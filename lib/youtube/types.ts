import type { VideoType } from '../enum';

export type YoutubeVideoData = {
    id: string;
    type: VideoType;
    channelId: string;
    channelName: string;
    title: string;
    live?: {
        scheduledAt?: Date;
        livedAt?: Date;
        endedAt?: Date;
    };
};

export type DataFetcher = {
    fetchVideoData(videoId: string): Promise<YoutubeVideoData>;
};

export class FetchError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export class InvalidURLError extends Error {
    constructor(url: string) {
        super(`Invalid URL: ${url}`);
    }
}
