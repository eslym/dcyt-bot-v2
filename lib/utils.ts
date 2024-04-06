import type { YoutubeVideo } from '@prisma/client';
import type { VideoCrawlResult } from './crawl';
import { NotificationType, VideoType } from './enum';

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
