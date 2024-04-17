import { cache } from './cache';
import type { ProfileCrawlResult, VideoCrawlResult } from './worker';

export class FetchError extends Error {
    #status: number;

    get status() {
        return this.#status;
    }

    constructor(url: string, status: number) {
        super(`Failed to fetch ${url}: ${status}`);
        this.#status = status;
    }
}

export class CrawlError extends Error {
    constructor() {
        super(`Failed to extract info from url.`);
    }
}

export class InvalidURLError extends Error {
    constructor(url: string) {
        super(`Invalid URL: ${url}`);
    }
}

let api: {
    fetchProfile: (url: string) => Promise<ProfileCrawlResult>;
    fetchVideo: (url: string) => Promise<VideoCrawlResult>;
} = undefined as any;

function getApi(): typeof api {
    if (api) {
        return api;
    }
    let req_id = 0;
    let timeout: any = undefined;
    const worker = new Worker(new URL(process.env.__WORKER_PATH ?? './worker.ts', import.meta.url), { type: 'module' });
    const cbs = new Map<number, [resolve: (data: any) => void, reject: (error: any) => void]>();
    worker.onmessage = (e: MessageEvent) => {
        const [id, result] = e.data;
        if (result.ok) {
            cbs.get(id)![0](result.data);
        } else {
            const err =
                result.error[0] in errors
                    ? new (errors as any)[result.error[0]](...result.error.slice(1))
                    : new Error(result.error[0]);
            cbs.get(id)![1](err);
        }
        cbs.delete(id);
        if (cbs.size === 0) {
            timeout = setTimeout(() => {
                worker.terminate();
                api = undefined as any;
            }, 5000);
        }
    };
    return (api = {
        fetchProfile: (url: string) =>
            new Promise((resolve, reject) => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = undefined;
                }
                const id = req_id++;
                cbs.set(id, [resolve, reject]);
                worker.postMessage([id, 'profile', url]);
            }),
        fetchVideo: (url: string) =>
            new Promise((resolve, reject) => {
                if (timeout) {
                    clearTimeout(timeout);
                    timeout = undefined;
                }
                const id = req_id++;
                cbs.set(id, [resolve, reject]);
                worker.postMessage([id, 'video', url]);
            })
    });
}

const errors = { CrawlError, FetchError, InvalidURLError };

export async function getChannelData(urlOrHandle: string) {
    const ttl = 15 * 60 * 1000;
    if (urlOrHandle.startsWith('@')) {
        urlOrHandle = `https://youtube.com/${urlOrHandle}`;
    }
    const result = await cache.get(
        urlOrHandle,
        async () => {
            const res = await getApi().fetchProfile(urlOrHandle);
            if (res.metadata.description.length > 500) {
                res.metadata.description = res.metadata.description.slice(0, 500) + '...';
            }
            res.metadata = {
                title: res.metadata.title,
                description: res.metadata.description,
                externalId: res.metadata.externalId,
                avatar: res.metadata.avatar
            } as any;
            return res;
        },
        ttl
    );
    if (!cache.has(`https://youtube.com/channel/${result.metadata.externalId}`)) {
        cache.set(`https://youtube.com/channel/${result.metadata.externalId}`, result, ttl);
    }
    if (!cache.has(result.metadata.channelUrl)) {
        cache.set(result.metadata.channelUrl, result, ttl);
    }
    return result;
}

export async function getVideoData(id: string) {
    const url = `https://www.youtube.com/watch?v=${id}`;
    const result = await getApi().fetchVideo(url);
    result.details = {
        videoId: result.details.videoId,
        title: result.details.title,
        author: result.details.author,
        isLive: result.details.isLive,
        isLiveContent: result.details.isLiveContent,
        channelId: result.details.channelId
    } as any;
    return result;
}
