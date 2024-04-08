import type { Context } from './ctx';
import { kClient, kDb } from './symbols';
import cron from 'node-cron';
import { postWebsub, topicUrl } from './websub';
import { VideoType } from './enum';
import { lock } from './cache';
import { getVideoData } from './crawl';
import { determineNotificationType, publishNotification } from './utils';
import * as t from './db/schema';
import { sql } from 'drizzle-orm';

export function setupCron(ctx: Context) {
    const db = ctx.get(kDb);
    const client = ctx.get(kClient);

    cron.schedule('*/15 * * * *', async () => {
        const chs = db
            .select({
                id: t.youtubeChannel.id,
                webhookId: t.youtubeChannel.webhookId,
                webhookSecret: t.youtubeChannel.webhookSecret,
                webhookExpiresAt: t.youtubeChannel.webhookExpiresAt
            })
            .from(t.youtubeChannel)
            .where(
                sql`${t.youtubeChannel.webhookSecret} IS NOT NULL AND (${t.youtubeChannel.webhookExpiresAt} IS NULL OR ${t.youtubeChannel.webhookExpiresAt} <= ${new Date(Date.now() - 24 * 3600000)})`
            )
            .all();
        if (!chs.length) return;
        for (const ch of chs) {
            const res = await postWebsub(
                'subscribe',
                ch.id,
                ch.webhookSecret!,
                'https://www.youtube.com/xml/feeds/videos.xml'
            );
            if (!res.ok) {
                console.error('[cron]', `Failed to subscribe to ${topicUrl(ch.id)}`, {
                    status: res.status,
                    body: await res.text()
                });
            }
        }
    });

    cron.schedule('*/5 * * * *', async () => {
        const records = db
            .select()
            .from(t.youtubeVideo)
            .where(
                sql`${t.youtubeVideo.type} IN ${[VideoType.LIVE, VideoType.PREMIERE]} AND ${t.youtubeVideo.liveNotifiedAt} IS NULL AND ${t.youtubeVideo.upcomingNotifiedAt} IS NULL AND ${t.youtubeVideo.deletedAt} IS NULL`
            )
            .all();
        for (const videoRecord of records) {
            if (lock.has(videoRecord.id)) continue;
            lock.add(videoRecord.id);
            const videoData = await getVideoData(videoRecord.id, false).catch((err) => {
                lock.delete(videoRecord.id);
                console.warn(
                    '[cron]',
                    `Failed to fetch video data for https://www.youtube.com/watch?v=${videoRecord.id}`,
                    {
                        error: err
                    }
                );
                return null;
            });
            if (!videoData) continue;
            const videoId = videoRecord.id;
            const notifyType = determineNotificationType(videoData, videoRecord);
            if (!notifyType) {
                lock.delete(videoId);
                continue;
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
            console.log('[cron]', 'Notification detected', {
                videoId,
                videoType: videoRecord.type,
                notifyType
            });
            publishNotification(client, db, videoRecord.type as VideoType, videoData, notifyType);
        }
    });
}
