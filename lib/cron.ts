import type { Context } from './ctx';
import { kClient, kDb } from './symbols';
import cron from 'node-cron';
import { postWebsub, topicUrl } from './websub';
import { NotificationType, VideoType } from './enum';
import { lock } from './cache';
import { getVideoData } from './crawl';
import { lang } from './lang';
import type { TextBasedChannel } from 'discord.js';
import Mustache from 'mustache';
import { ucfirst } from './utils';

export function setupCron(ctx: Context) {
    const db = ctx.get(kDb);
    const client = ctx.get(kClient);

    cron.schedule('*/15 * * * *', async () => {
        const chs = await db.youtubeChannel.findMany({
            where: {
                AND: [
                    { webhookSecret: { not: null } },
                    {
                        OR: [
                            { webhookExpiresAt: { lte: new Date(Date.now() - 24 * 3600000) } },
                            { webhookExpiresAt: null }
                        ]
                    }
                ]
            },
            select: {
                id: true,
                webhookId: true,
                webhookSecret: true,
                webhookExpiresAt: true
            }
        });
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
        const records = await db.youtubeVideo.findMany({
            where: {
                type: {
                    in: [VideoType.LIVE, VideoType.PREMIERE]
                },
                liveNotifiedAt: null,
                upcomingNotifiedAt: null
            }
        });
        const notifyTime = Date.now() + 300000;
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
            const scheduled = videoData.schedule?.valueOf() ?? 0;
            if (videoData.schedule?.valueOf() === videoRecord.scheduledAt?.valueOf() && scheduled > notifyTime) {
                lock.delete(videoId);
                continue;
            }
            const notifyType =
                scheduled <= notifyTime
                    ? NotificationType.UPCOMING
                    : videoData.schedule
                      ? NotificationType.RESCHEDULE
                      : NotificationType.LIVE;
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
            console.log('[cron]', 'Notification detected', { videoId, videoType: videoRecord.type, notifyType });
            const subscriptions = await db.youtubeSubscription.findMany({
                where: {
                    youtubeChannelId: videoRecord.channelId,
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
            for (const sub of subscriptions) {
                try {
                    const ch = (await client.channels.fetch(sub.guildChannelId)) as TextBasedChannel;
                    const field = `${notifyType.toLowerCase()}Text`;
                    const l = lang[sub.GuildChannel.Guild.language ?? 'en'];
                    const template =
                        (sub as any)[field] ?? (sub.GuildChannel as any)[field] ?? l.NOTIFICATION[notifyType];
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
    });
}
