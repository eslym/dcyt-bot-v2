import type { Context, ContextValue } from './ctx';
import { kClient, kDb, kFetcher, kOptions } from './symbols';
import { createHmac } from 'crypto';
import { convert } from 'xmlbuilder2';
import { NotificationType, VideoType } from './enum';
import { determineNotificationType, publishNotification, withCatch } from './utils';
import * as t from './db/schema';
import { count, sql } from 'drizzle-orm';
import type { YoutubeChannel } from './db/types';
import { randomBytes } from 'crypto';

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
    data.set('hub.verify', 'async');
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
        if (
            sig.toLowerCase() !==
            createHmac(algo, ytCh.webhookSecret!)
                .update(buffer as any)
                .digest('hex')
        ) {
            console.warn('[http]', 'Invalid signature', { id });
            return new Response('403 Forbidden', {
                status: 403,
                headers: {
                    'Content-Type': 'text/plain'
                }
            });
        }
        queueMicrotask(withCatch(videoCallback.bind(null, ctx, ytCh, buffer), '[http]'));
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
    queueMicrotask(withCatch(subscribeCallback.bind(null, mode, url, db, id, ytCh), '[http]'));
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
    const [db, fetcher] = ctx.getAll(kDb, kFetcher);
    const xml = convert(body.toString('utf8'), { format: 'object' }) as any as {
        feed: FeedEntry | DeletedFeed;
    };
    if ('at:deleted-entry' in xml.feed) {
        const at = new Date(xml.feed['at:deleted-entry']['@when']);
        const videoId = xml.feed['at:deleted-entry']['@ref'].split(':').pop()!;
        db.update(t.youtubeVideo)
            .set({
                deletedAt: at
            })
            .where(sql`${t.youtubeVideo.id} = ${videoId}`)
            .run();
        console.log('[http]', `Video deleted: ${xml.feed['at:deleted-entry'].link['@href']}`);
        return;
    }
    if (xml.feed.entry['yt:channelId'] !== ch.id) return;
    const videoId = xml.feed.entry['yt:videoId'];
    const videoRecord = db
        .select()
        .from(t.youtubeVideo)
        .where(sql`${t.youtubeVideo.id} = ${videoId}`)
        .get();
    const videoData = await fetcher.fetchVideoData(videoId);
    db.update(t.youtubeChannel)
        .set({ title: videoData.channelName })
        .where(sql`${t.youtubeChannel.id} = ${ch.id}`)
        .run();
    if (!videoRecord) {
        const notifyType =
            videoData.type === 'VIDEO'
                ? NotificationType.PUBLISH
                : videoData.live?.livedAt
                  ? NotificationType.LIVE
                  : NotificationType.SCHEDULE;
        db.insert(t.youtubeVideo)
            .values({
                id: videoId,
                channelId: ch.id,
                title: videoData.title,
                type: videoData.type,
                scheduledAt: videoData.live?.scheduledAt,
                [`${notifyType.toLowerCase()}NotifiedAt`]: new Date()
            })
            .run();
        if (videoData.live?.endedAt) {
            console.log('[http]', 'Ignoring finished live content', videoData);
            return;
        }
        const publishedAt = new Date(xml.feed.entry.published);
        if (videoData.type === VideoType.VIDEO && Date.now() - publishedAt.valueOf() > 3 * 24 * 60 * 60 * 1000) {
            // Sometimes youtube will send old video, so we set threshold to 3 days
            // ignore the video if it's older than 3 days
            console.log('[http]', 'Ignoring old video', videoData);
            return;
        }
        console.log('[http]', 'Incoming notification', { videoData, notifyType });
        publishNotification(ctx.get(kClient), db, videoData, notifyType);
        return;
    }
    if (videoRecord.type === VideoType.VIDEO) {
        return;
    }
    if (videoRecord.deletedAt || videoRecord.livedAt) {
        db.update(t.youtubeVideo)
            .set({
                title: videoData.title,
                scheduledAt: videoData.live?.scheduledAt ?? null,
                livedAt: videoData.live?.livedAt ?? null,
                deletedAt: null
            })
            .where(sql`${t.youtubeVideo.id} = ${videoId}`)
            .run();
        return;
    }
    const notifyType = determineNotificationType(videoData, videoRecord);
    if (!notifyType || videoRecord.liveNotifiedAt || videoRecord.upcomingNotifiedAt) {
        return;
    }
    db.update(t.youtubeVideo)
        .set({
            title: videoData.title,
            scheduledAt: videoData.live?.scheduledAt ?? null,
            livedAt: videoData.live?.livedAt ?? null,
            [`${notifyType.toLowerCase()}NotifiedAt`]: new Date()
        })
        .where(sql`${t.youtubeVideo.id} = ${videoId}`)
        .run();
    console.log('[http]', 'Incoming notification', { videoData, notifyType });
    publishNotification(ctx.get(kClient), db, videoData, notifyType);
}

export async function subscribeCallback(
    mode: string,
    url: URL,
    db: ContextValue<typeof kDb>,
    id: string,
    ytCh: YoutubeChannel
) {
    if (mode === 'subscribe') {
        if (!url.searchParams.has('hub.lease_seconds')) {
            return;
        }
        const lease = parseInt(url.searchParams.get('hub.lease_seconds')!);
        if (isNaN(lease) || lease < 300) return;
        const expires = new Date(Date.now() + lease * 1000);
        db.update(t.youtubeChannel)
            .set({
                webhookExpiresAt: expires
            })
            .where(sql`${t.youtubeChannel.webhookId} = ${id}`)
            .run();
        if (ytCh.webhookExpiresAt) {
            console.log('[http]', `Subscription for https://youtube.com/channel/${ytCh.id} renewed.`);
        } else {
            console.log('[http]', `Subscribed to https://youtube.com/channel/${ytCh.id}`);
        }
        return;
    }
    db.update(t.youtubeChannel)
        .set({
            webhookExpiresAt: null,
            webhookSecret: null
        })
        .where(sql`${t.youtubeChannel.webhookId} = ${id}`)
        .run();
    console.log('[http]', `Unsubscribed from https://youtube.com/channel/${ytCh.id}`);
}

const env = Bun.env;

export async function checkSubs(ctx: Context, channel: string) {
    if (env.DEV_WEBSUB_DISABLED === 'true') return;
    const db = ctx.get(kDb);
    const opts = ctx.get(kOptions);
    const ch = db
        .select({
            id: t.youtubeChannel.id,
            webhookId: t.youtubeChannel.webhookId,
            webhookSecret: t.youtubeChannel.webhookSecret
        })
        .from(t.youtubeChannel)
        .where(sql`${t.youtubeChannel.id} = ${channel}`)
        .get();
    const subs = db
        .select({
            count: count()
        })
        .from(t.youtubeSubscription)
        .where(sql`${t.youtubeSubscription.youtubeChannelId} = ${channel}`)
        .get()!;
    if (!ch) return;
    if (subs.count && !ch.webhookSecret) {
        const secret = randomBytes(24).toString('base64');
        db.update(t.youtubeChannel)
            .set({ webhookSecret: secret, updatedAt: new Date() })
            .where(sql`${t.youtubeChannel.id} = ${channel}`)
            .run();
        const callback = new URL(`./websub/${ch.webhookId}`, opts.websub);
        await postWebsub('subscribe', channel, secret, callback.toString());
        return;
    }
    if (!subs.count && ch.webhookSecret) {
        const callback = new URL(`./websub/${ch.webhookId}`, opts.websub);
        await postWebsub('unsubscribe', channel, ch.webhookSecret, callback.toString());
    }
}
