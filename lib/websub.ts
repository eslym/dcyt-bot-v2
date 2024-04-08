import type { YoutubeChannel } from '@prisma/client';
import { getChannelData, getVideoData } from './crawl';
import type { Context } from './ctx';
import { kClient, kDb } from './symbols';
import { createHmac } from 'crypto';
import { convert } from 'xmlbuilder2';
import { NotificationType, VideoType } from './enum';
import { determineVideoType, determineNotificationType, publishNotification } from './utils';
import { lock } from './cache';
import * as t from './db/schema';
import { sql } from 'drizzle-orm';

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
    const ytCh = db
        .select()
        .from(t.youtubeChannel)
        .where(sql`${t.youtubeChannel.webhookId} = ${id}`)
        .get();
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
            db.update(t.youtubeChannel)
                .set({
                    webhookExpiresAt: expires,
                    updatedAt: new Date()
                })
                .where(sql`${t.youtubeChannel.webhookId} = ${id}`)
                .run();
            const chData = await getChannelData(`https://youtube.com/channel/${ytCh.id}`);
            if (ytCh.webhookExpiresAt) {
                console.log('[http]', `Renewing subscription for ${chData.metadata.title}`);
            } else {
                console.log('[http]', `Subscribed to ${chData.metadata.title}`);
            }
            return;
        }
        db.update(t.youtubeChannel)
            .set({
                webhookExpiresAt: null,
                webhookSecret: null,
                updatedAt: new Date()
            })
            .where(sql`${t.youtubeChannel.webhookId} = ${id}`)
            .run();
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
        db.update(t.youtubeVideo)
            .set({
                deletedAt: at,
                updatedAt: new Date()
            })
            .where(sql`${t.youtubeVideo.id} = ${videoId}`)
            .run();
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
    const videoRecord = db
        .select()
        .from(t.youtubeVideo)
        .where(sql`${t.youtubeVideo.id} = ${videoId}`)
        .get();
    const videoData = await getVideoData(videoId, false).catch(catchCase);
    const videoType = determineVideoType(videoData);
    if (!videoRecord) {
        const notifyType =
            videoType === 'VIDEO'
                ? NotificationType.PUBLISH
                : videoData.schedule
                  ? NotificationType.SCHEDULE
                  : NotificationType.LIVE;
        db.insert(t.youtubeVideo)
            .values({
                id: videoId,
                channelId: ch.id,
                title: videoData.details.title,
                type: videoType,
                scheduledAt: videoData.schedule,
                [`${notifyType.toLowerCase()}NotifiedAt`]: new Date(),
                updatedAt: new Date()
            })
            .run();
        lock.delete(videoId);
        if (videoData.details.isLiveContent && !videoData.details.isLive && !videoData.schedule) {
            console.log('[http]', 'Ignoring finished live content', { videoId, videoType });
            return;
        }
        const publishedAt = new Date(xml.feed.entry.published);
        if (videoType === VideoType.VIDEO && Date.now() - publishedAt.valueOf() > 3 * 24 * 60 * 60 * 1000) {
            // Sometimes youtube will send old video, so we set threshold to 3 days
            // ignore the video if it's older than 3 days
            console.log('[http]', 'Ignoring old video', { videoId, videoType });
            lock.delete(videoId);
            return;
        }
        console.log('[http]', 'Incoming notification', { videoId, videoType, notifyType });
        publishNotification(ctx.get(kClient), db, videoType, videoData, notifyType);
        return;
    }
    if (videoRecord.type === VideoType.VIDEO) {
        lock.delete(videoId);
        return;
    }
    if (videoRecord.deletedAt) {
        db.update(t.youtubeVideo)
            .set({
                deletedAt: null,
                updatedAt: new Date()
            })
            .where(sql`${t.youtubeVideo.id} = ${videoId}`)
            .run();
        lock.delete(videoId);
        return;
    }
    const notifyType = determineNotificationType(videoData, videoRecord);
    if (!notifyType || videoRecord.liveNotifiedAt || videoRecord.upcomingNotifiedAt) {
        lock.delete(videoId);
        return;
    }
    db.update(t.youtubeVideo)
        .set({
            title: videoData.details.title,
            scheduledAt: videoData.schedule ?? null,
            [`${notifyType.toLowerCase()}NotifiedAt`]: new Date(),
            updatedAt: new Date()
        })
        .where(sql`${t.youtubeVideo.id} = ${videoId}`)
        .run();
    lock.delete(videoId);
    console.log('[http]', 'Incoming notification', {
        videoId,
        videoType,
        notifyType
    });
    publishNotification(ctx.get(kClient), db, videoType, videoData, notifyType);
}
