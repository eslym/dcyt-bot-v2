import type { YoutubeChannel } from '@prisma/client';
import { getChannelData, getVideoData } from './crawl';
import type { Context } from './ctx';
import { kClient, kDb } from './symbols';
import { createHmac } from 'crypto';
import { convert } from 'xmlbuilder2';
import { NotificationType, VideoType } from './enum';
import { ucfirst, determineVideoType, determineNotificationType } from './utils';
import type { TextBasedChannel } from 'discord.js';
import { lang } from './lang';
import Mustache from 'mustache';
import { lock } from './cache';

export function topicUrl(topic: string) {
    const url = new URL('https://www.youtube.com/xml/feeds/videos.xml');
    url.searchParams.set('channel_id', topic);
    return url.toString();
}

export async function postWebsub(mode: 'subscribe' | 'unsubscribe', topic: string, secret: string, callback: string) {
    const url = new URL('https://pubsubhubbub.appspot.com/subscribe');
    const data = new URLSearchParams();
    data.set('hub.callback', callback);
    data.set('hub.mode', mode);
    data.set('hub.topic', topicUrl(topic));
    data.set('hub.secret', secret);
    return fetch(url.toString(), { method: 'POST', body: data });
}

const methods = new Set(['HEAD', 'GET', 'POST']);

export async function handleWebSub(ctx: Context, req: Request): Promise<Response | undefined> {
    if (!methods.has(req.method)) return undefined;
    const url = new URL(req.url);
    const match = url.pathname.match(/^\/websub\/([^\/]+)$/);
    if (!match) return undefined;
    const db = ctx.get(kDb);
    const id = match[1];
    const ytCh = await db.youtubeChannel.findUnique({ where: { webhookId: id } });
    if (!ytCh || !ytCh.webhookSecret) return undefined;
    if (req.method === 'POST') {
        if (!req.headers.has('x-hub-signature')) {
            return new Response('400 Bad Request', {
                status: 400,
                headers: {
                    'Content-Type': 'text/plain'
                }
            });
        }
        const [algo, sig] = req.headers.get('x-hub-signature')!.split('=');
        const buffer = Buffer.from(await req.arrayBuffer());
        if (sig.toLowerCase() !== createHmac(algo, ytCh.webhookSecret!).update(buffer).digest('hex')) {
            console.warn('[http]', 'Invalid signature', { id });
            return new Response('403 Forbidden', {
                status: 403,
                headers: {
                    'Content-Type': 'text/plain'
                }
            });
        }
        queueMicrotask(() => videoCallback(ctx, ytCh, buffer).catch((err) => console.error('[http]', err)));
        return new Response('OK', { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    if (!url.searchParams.has('hub.challenge')) {
        return new Response('400 Bad Request', {
            status: 400,
            headers: {
                'Content-Type': 'text/plain'
            }
        });
    }
    const mode = url.searchParams.get('hub.mode')!;
    queueMicrotask(async () => {
        if (mode === 'subscribe') {
            if (!url.searchParams.has('hub.lease_seconds')) {
                return;
            }
            const lease = parseInt(url.searchParams.get('hub.lease_seconds')!);
            if (isNaN(lease) || lease < 300) return;
            const expires = new Date(Date.now() + lease * 1000);
            await db.youtubeChannel.update({ where: { webhookId: id }, data: { webhookExpiresAt: expires } });
            const chData = await getChannelData(`https://youtube.com/channel/${ytCh.id}`);
            if (ytCh.webhookExpiresAt) {
                console.log('[http]', `Renewing subscription for ${chData.metadata.title}`);
            } else {
                console.log('[http]', `Subscribed to ${chData.metadata.title}`);
            }
            return;
        }
        await db.youtubeChannel.update({
            where: { webhookId: id },
            data: { webhookExpiresAt: null, webhookSecret: null }
        });
        const chData = await getChannelData(`https://youtube.com/channel/${ytCh.id}`);
        console.log('[http]', `Unsubscribed from ${chData.metadata.title}`);
    });
    return new Response(url.searchParams.get('hub.challenge'), {
        status: 200,
        headers: {
            'Content-Type': 'text/plain'
        }
    });
}

interface FeedEntry {
    title: string;
    updated: string;
    entry: {
        id: string;
        'yt:videoId': string;
        'yt:channelId': string;
        title: string;
        link: {
            '@rel': string;
            '@href': string;
        };
        author: {
            name: string;
            uri: string;
        };
        published: string;
        updated: string;
    };
}

interface DeletedFeed {
    'at:deleted-entry': {
        '@ref': string;
        '@when': string;
        link: {
            '@href': string;
        };
        'at:by': {
            name: string;
            uri: string;
        };
    };
}

async function videoCallback(ctx: Context, ch: YoutubeChannel, body: Buffer) {
    const db = ctx.get(kDb);
    const xml = convert(body.toString('utf8'), { format: 'object' }) as any as {
        feed: FeedEntry | DeletedFeed;
    };
    if ('at:deleted-entry' in xml.feed) {
        const at = new Date(xml.feed['at:deleted-entry']['@when']);
        const videoId = xml.feed['at:deleted-entry']['@ref'].split(':').pop()!;
        await db.youtubeVideo.update({
            where: {
                id: videoId
            },
            data: {
                deletedAt: at
            }
        });
        console.log('[http]', `Video deleted: ${xml.feed['at:deleted-entry'].link['@href']}`);
        return;
    }
    if (xml.feed.entry['yt:channelId'] !== ch.id) return;
    const videoId = xml.feed.entry['yt:videoId'];
    if (lock.has(videoId)) return;
    lock.add(videoId);
    const catchCase = (err: any) => {
        lock.delete(videoId);
        throw err;
    };
    const videoRecord = await ctx
        .get(kDb)
        .youtubeVideo.findUnique({ where: { id: videoId } })
        .catch(catchCase);
    const videoData = await getVideoData(videoId, false).catch(catchCase);
    const videoType = determineVideoType(videoData);
    if (!videoRecord) {
        const notifyType =
            videoType === 'VIDEO'
                ? NotificationType.PUBLISH
                : videoData.schedule
                  ? NotificationType.SCHEDULE
                  : NotificationType.LIVE;
        await db.youtubeVideo
            .create({
                data: {
                    id: videoId,
                    channelId: ch.id,
                    title: videoData.details.title,
                    type: videoType,
                    scheduledAt: videoData.schedule,
                    [`${notifyType.toLowerCase()}NotifiedAt`]: new Date()
                }
            })
            .finally(() => lock.delete(videoId));
        const publishedAt = new Date(xml.feed.entry.published);
        if (Date.now() - publishedAt.valueOf() > 30 * 24 * 60 * 60 * 1000) {
            // Sometimes youtube will send old video, so we set threshold to 30 days
            // ignore the video if it's older than 30 days
            console.log('[http]', 'Ignoring old video', { videoId, videoType });
            lock.delete(videoId);
            return;
        }
        console.log('[http]', 'Incoming notification', { videoId, videoType, notifyType });
        const subscribtions = await db.youtubeSubscription.findMany({
            where: {
                youtubeChannelId: ch.id,
                [`notify${ucfirst(notifyType)}`]: true
            },
            include: {
                GuildChannel: {
                    include: {
                        Guild: true
                    }
                }
            }
        });
        const client = ctx.get(kClient);
        for (const sub of subscribtions) {
            try {
                const ch = (await client.channels.fetch(sub.guildChannelId)) as TextBasedChannel;
                const field = `${notifyType.toLowerCase()}Text`;
                const l = lang[sub.GuildChannel.Guild.language ?? 'en'];
                const template = (sub as any)[field] ?? (sub.GuildChannel as any)[field] ?? l.NOTIFICATION[notifyType];
                const data: any = {
                    title: videoData.details.title,
                    url: `https://youtube.com/watch?v=${videoId}`,
                    channel: videoData.details.author,
                    type: l.TYPE[videoType],
                    timestamp: videoData.schedule ? Math.floor(videoData.schedule.valueOf() / 1000) : undefined
                };
                await ch.send(Mustache.render(template, data));
            } catch (err) {
                console.error('[http]', `Failed to notify ${sub.guildChannelId}`, { error: err });
            }
        }
        return;
    }
    if (videoRecord.type === VideoType.VIDEO) {
        lock.delete(videoId);
        return;
    }
    if (videoRecord.deletedAt) {
        await db.youtubeVideo
            .update({
                where: {
                    id: videoId
                },
                data: {
                    deletedAt: null
                }
            })
            .finally(() => lock.delete(videoId));
        return;
    }
    const notifyType = determineNotificationType(videoData, videoRecord);
    if (!notifyType) {
        lock.delete(videoId);
        return;
    }
    await db.youtubeVideo
        .update({
            where: {
                id: videoId
            },
            data: {
                title: videoData.details.title,
                scheduledAt: videoData.schedule ?? null,
                [`${notifyType.toLowerCase()}NotifiedAt`]: new Date()
            }
        })
        .finally(() => lock.delete(videoId));
    console.log('[http]', 'Incoming notification', {
        videoId,
        videoType,
        notifyType
    });
    const subscriptions = await db.youtubeSubscription.findMany({
        where: {
            youtubeChannelId: ch.id,
            [`notify${ucfirst(notifyType)}`]: true
        },
        include: {
            GuildChannel: {
                include: {
                    Guild: true
                }
            }
        }
    });
    const client = ctx.get(kClient);
    for (const sub of subscriptions) {
        try {
            const ch = (await client.channels.fetch(sub.guildChannelId)) as TextBasedChannel;
            const field = `${notifyType.toLowerCase()}Text`;
            const l = lang[sub.GuildChannel.Guild.language ?? 'en'];
            const template = (sub as any)[field] ?? (sub.GuildChannel as any)[field] ?? l.NOTIFICATION[notifyType];
            const data: any = {
                title: videoData.details.title,
                url: `https://youtube.com/watch?v=${videoId}`,
                channel: videoData.details.author,
                type: l.TYPE[videoRecord.type as VideoType],
                timestamp: videoData.schedule ? Math.floor(videoData.schedule.valueOf() / 1000) : undefined
            };
            await ch.send(Mustache.render(template, data));
        } catch (err) {
            console.error('[http]', `Failed to notify ${sub.guildChannelId}`, { error: err });
        }
    }
}
