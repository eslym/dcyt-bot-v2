import type { Client, TextBasedChannel } from 'discord.js';
import type { ContextValue } from './ctx';
import type { YoutubeVideo } from './db/types';
import { NotificationType, VideoType } from './enum';
import type { kDb } from './symbols';
import { lang } from './lang';
import Mustache from 'mustache';
import * as t from './db/schema';
import { sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';
import type { VideoCrawlResult } from './worker';

export function ucfirst(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

export function determineVideoType(videoData: VideoCrawlResult): VideoType {
    if (videoData.schedule || videoData.details.isLive) {
        return videoData.details.isLiveContent ? VideoType.LIVE : VideoType.PREMIERE;
    }
    return videoData.details.isLiveContent ? VideoType.LIVE : VideoType.VIDEO;
}

export function determineNotificationType(
    videoData: VideoCrawlResult,
    videoRecord: YoutubeVideo
): NotificationType | undefined {
    if (videoRecord.type === VideoType.VIDEO) {
        return;
    }
    if (videoData.details.isLive) {
        return NotificationType.LIVE;
    }
    if (!videoData.schedule) {
        return;
    }
    const schedule = videoData.schedule.valueOf();
    if (schedule !== videoRecord.scheduledAt?.valueOf()) {
        return NotificationType.RESCHEDULE;
    }
    const now = Date.now();
    const notifyTime = now + 5 * 60 * 1000;
    if (schedule > now && schedule <= notifyTime) {
        return NotificationType.UPCOMING;
    }
}

export async function publishNotification(
    client: Client<true>,
    db: ContextValue<typeof kDb>,
    videoType: VideoType,
    videoData: VideoCrawlResult,
    notifyType: NotificationType
) {
    const field = `${notifyType.toLowerCase()}Text` as 'publishText' | 'upcomingText' | 'liveText' | 'rescheduleText';

    const sub = alias(t.youtubeSubscription, 'sub');
    const ch = alias(t.guildChannel, 'ch');
    const g = alias(t.guild, 'g');

    const subscriptions = db
        .select({
            channelId: ch.id,
            language: g.language,
            [field]: sub[field],
            [field + 'Channel']: sql<string>`${ch[field]}`.as(field + 'Channel'),
            [field + 'Guild']: sql<string>`${g[field]}`.as(field + 'Guild')
        })
        .from(sub)
        .where(
            sql`${sub.youtubeChannelId} = ${videoData.details.channelId} AND ${(sub as any)[`notify${ucfirst(notifyType)}`]}`
        )
        .innerJoin(ch, sql`${sub.guildChannelId} = ${ch.id}`)
        .innerJoin(g, sql`${ch.guildId} = ${g.id}`)
        .all();
    for (const sub of subscriptions) {
        try {
            const ch = (await client.channels.fetch(sub.channelId)) as TextBasedChannel;
            const l = lang[sub.language ?? 'en'];
            const template = sub[field] ?? sub[field + 'Channel'] ?? sub[field + 'Guild'] ?? l.NOTIFICATION[notifyType];
            const data: any = {
                title: videoData.details.title,
                url: `https://youtube.com/watch?v=${videoData.details.videoId}`,
                channel: videoData.details.author,
                type: l.TYPE[videoType],
                timestamp: videoData.schedule ? Math.floor(videoData.schedule.valueOf() / 1000) : undefined
            };
            await ch.send(Mustache.render(template, data));
        } catch (err) {
            console.error('[http]', `Failed to notify ${sub.channelId}`, { error: err });
        }
    }
}
