import { VideoType } from '../enum';
import { noop } from '../utils';
import { FetchError, NotFoundError, type DataFetcher, type YoutubeVideoData } from './types';
import type { youtube_v3 } from '@googleapis/youtube';

export class APIDataFetcher implements DataFetcher {
    #api: youtube_v3.Youtube;
    #videoQueues: [id: string, resolve: (data: YoutubeVideoData) => void, reject: (err: any) => void][] = [];
    #shouldRunQueue = true;

    constructor(api: youtube_v3.Youtube) {
        this.#api = api;
    }

    fetchVideoData(videoId: string): Promise<YoutubeVideoData> {
        return new Promise((resolve, reject) => {
            this.#videoQueues.push([videoId, resolve, reject]);
            if (this.#shouldRunQueue) queueMicrotask(this.#runQueue.bind(this));
        });
    }

    async #runQueue() {
        this.#shouldRunQueue = false;
        while (this.#videoQueues.length) {
            await this.#fetchVideos(this.#videoQueues.splice(0, 50));
        }
        this.#shouldRunQueue = true;
    }

    async #fetchVideos(queue: [id: string, resolve: (data: YoutubeVideoData) => void, reject: (err: any) => void][]) {
        if (!queue.length) return;
        const ids = queue.map(([id]) => id);
        const res = await this.#api.videos
            .list({
                id: ids,
                part: ['id', 'snippet', 'liveStreamingDetails', 'contentDetails'],
                maxResults: 50
            })
            .catch(noop);
        if (!res) {
            for (const [_, __, reject] of queue) {
                reject(new FetchError('Failed to fetch video data'));
            }
            return;
        }
        if (res.status !== 200) {
            const err = `Failed to fetch video data, status: ${res.status}`;
            for (const [_, __, reject] of queue) {
                reject(new FetchError(err));
            }
            return;
        }
        const videos = new Map((res.data.items ?? []).map((item) => [item.id!, item]));
        for (const [id, resolve, reject] of queue) {
            const video = videos.get(id);
            if (!video) {
                reject(new NotFoundError(`Video ${id} not found`));
                continue;
            }
            const data: YoutubeVideoData = {
                id: video.id!,
                type: this.#getVideoType(video),
                channelId: video.snippet!.channelId!,
                channelName: video.snippet!.channelTitle!,
                title: video.snippet!.title!
            };
            if (video.liveStreamingDetails) {
                data.live = {
                    scheduledAt: video.liveStreamingDetails.scheduledStartTime
                        ? new Date(video.liveStreamingDetails.scheduledStartTime)
                        : undefined,
                    livedAt: video.liveStreamingDetails.actualStartTime
                        ? new Date(video.liveStreamingDetails.actualStartTime)
                        : undefined,
                    endedAt: video.liveStreamingDetails.actualEndTime
                        ? new Date(video.liveStreamingDetails.actualEndTime)
                        : undefined
                };
            }
            resolve(data);
        }
    }

    #getVideoType(video: youtube_v3.Schema$Video): VideoType {
        if (!video.liveStreamingDetails) return VideoType.VIDEO;
        if (video.contentDetails?.duration === 'P0D') return VideoType.LIVE;
        return VideoType.PREMIERE;
    }
}
