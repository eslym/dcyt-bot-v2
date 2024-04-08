import type { Client, TextBasedChannel } from 'discord.js';
import type { VideoCrawlResult } from './crawl';
import type { ContextValue } from './ctx';
import type { YoutubeVideo } from './db/types';
import { NotificationType, VideoType } from './enum';
import type { kDb } from './symbols';
import { lang } from './lang';
import Mustache from 'mustache';
import * as t from './db/schema';
import { sql } from 'drizzle-orm';

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
    const subscriptions = db
        .select()
        .from(t.youtubeSubscription)
        .where(
            sql`${t.youtubeSubscription.youtubeChannelId} = ${videoData.details.channelId} AND ${(t.youtubeSubscription as any)[`notify${ucfirst(notifyType)}`]}`
        )
        .innerJoin(t.guildChannel, sql`${t.youtubeSubscription.guildChannelId} = ${t.guildChannel.id}`)
        .innerJoin(t.guild, sql`${t.guildChannel.guildId} = ${t.guild.id}`)
        .all();
    for (const sub of subscriptions) {
        try {
            const ch = (await client.channels.fetch(sub.GuildChannel.id)) as TextBasedChannel;
            const field = `${notifyType.toLowerCase()}Text`;
            const l = lang[sub.Guild.language ?? 'en'];
            const template =
                (sub.YoutubeSubscription as any)[field] ??
                (sub.GuildChannel as any)[field] ??
                (sub.Guild as any)[field] ??
                l.NOTIFICATION[notifyType];
            const data: any = {
                title: videoData.details.title,
                url: `https://youtube.com/watch?v=${videoData.details.videoId}`,
                channel: videoData.details.author,
                type: l.TYPE[videoType],
                timestamp: videoData.schedule ? Math.floor(videoData.schedule.valueOf() / 1000) : undefined
            };
            await ch.send(Mustache.render(template, data));
        } catch (err) {
            console.error('[http]', `Failed to notify ${sub.GuildChannel.id}`, { error: err });
        }
    }
}
