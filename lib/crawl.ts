import JSON5 from 'json5';
import { cache } from './cache';

export interface Thumbnail {
    url: string;
    width?: number;
    height?: number;
}

export interface VideoDetails {
    videoId: string;
    title: string;
    lengthSeconds: string;
    isLive?: boolean;
    keywords?: string[];
    channelId: string;
    isOwnerViewing: boolean;
    shortDescription: string;
    isCrawlable: boolean;
    isLiveDvrEnabled?: boolean;
    thumbnail: {
        thumbnails: Thumbnail[];
    };
    liveChunkReadahead?: number;
    allowRatings: boolean;
    viewCount: string;
    author: string;
    isLowLatencyLiveStream: boolean;
    isPrivate: boolean;
    isUnpluggedCorpus: boolean;
    latencyClass: string;
    isLiveContent: boolean;
}

export interface ChannelMetadata {
    title: string;
    description: string;
    rssUrl: string;
    externalId: string;
    keywords: string;
    ownerUrls: string[];
    avatar: {
        thumbnails: Thumbnail[];
    };
    channelUrl: string;
    isFamilySafe: boolean;
    availableCountryCodes: string[];
    androidDeepLink: string;
    androidAppindexingLink: string;
    iosAppindexingLink: string;
    vanityChannelUrl: string;
}

export interface ProfileCrawlResult {
    type: 'profile';

    metadata: ChannelMetadata;
}

export interface VideoCrawlResult {
    type: 'video';
    details: VideoDetails;
    schedule?: Date;
}

export class InvalidURLError extends Error {
    constructor(url: string) {
        super(`Invalid URL: ${url}`);
    }
}

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

class ScriptExtractor implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
    #scripts: string[] = [];
    #script = '';

    get scripts() {
        return this.#scripts;
    }

    element(element: HTMLRewriterTypes.Element) {
        element.onEndTag(() => {
            this.#scripts.push(this.#script);
            this.#script = '';
        });
    }

    text(text: HTMLRewriterTypes.Text) {
        this.#script += text.text;
    }
}

class MetaExtractor implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
    public url?: string;
    public type?: 'profile' | 'video.other';

    element(element: HTMLRewriterTypes.Element): void {
        if (!element.hasAttribute('property')) return;
        if (element.getAttribute('property') === 'og:url') {
            this.url = element.getAttribute('content') ?? undefined;
        } else if (element.getAttribute('property') === 'og:type') {
            this.type = (element.getAttribute('content') ?? undefined) as 'profile' | 'video.other';
        }
    }
}

const quotes = new Set(['"', "'"]);

type StringRange = [number, number];

type ExtractResult<T> = {
    result: T;
    range: StringRange;
};

function locateString(source: string, index: number = 0): StringRange | null {
    while (!quotes.has(source[index]) && index < source.length) index++;
    if (index >= source.length) {
        return null;
    }
    let start = index;
    let quote = source[index];
    let escape = false;
    while (++index < source.length && (escape || source[index] !== quote)) {
        escape = source[index] === '\\';
    }
    if (!escape && source[index] === quote) {
        return [start, index + 1];
    }
    return null;
}

function locateObject(source: string, index: number = 0): StringRange | null {
    let start = (index = source.indexOf('{', index));
    if (start === -1) {
        return null;
    }
    let open = 1;
    while (++index < source.length && open > 0) {
        if (source[index] === '{') {
            open++;
        } else if (source[index] === '}') {
            open--;
        } else if (quotes.has(source[index])) {
            // when string
            let loc = locateString(source, index);
            if (!loc) {
                return null;
            }
            index = loc[1] - 1;
        }
    }
    if (open === 0) {
        return [start, index];
    }
    return null;
}

function extractObject<T extends object>(keyword: string, source: string, index: number = 0): ExtractResult<T> | null {
    index = source.indexOf(keyword, index);
    if (index < 0) {
        return null;
    }
    let loc = locateObject(source, index);
    if (!loc) {
        return null;
    }
    try {
        let json = source.slice(...loc);
        return {
            range: loc,
            result: JSON5.parse(json)
        };
    } catch (e) {}
    return null;
}

const allowedHosts = new Set(['youtube.com', 'www.youtube.com', 'youtu.be']);

function validateURL(url: string) {
    if (!URL.canParse(url)) {
        throw new InvalidURLError(url);
    }
    const { hostname, protocol } = new URL(url);
    if (!allowedHosts.has(hostname) || protocol !== 'https:') {
        throw new InvalidURLError(url);
    }
}

async function extractScriptAndMeta(res: Response) {
    if (res.status !== 200) {
        throw new FetchError(res.url, res.status);
    }
    const se = new ScriptExtractor();
    const me = new MetaExtractor();
    const rewriter = new HTMLRewriter().on('script', se).on('meta', me);
    rewriter.transform(await res.text());
    return {
        scripts: se.scripts,
        meta: {
            url: me.url,
            type: me.type
        }
    };
}

function extractProfile(scripts: string[]): ProfileCrawlResult {
    for (let script of scripts) {
        if (script.match(/^\s*var\s+ytInitialData\s*=/)) {
            let initialData = extractObject<any>('=', script);
            if (initialData && initialData.result.metadata) {
                return {
                    type: 'profile',
                    metadata: initialData.result.metadata.channelMetadataRenderer
                };
            }
        }
    }
    throw new CrawlError();
}

function extractVideo(scripts: string[]): VideoCrawlResult {
    let ytInitialPlayerResponse: any = undefined;
    for (let script of scripts) {
        if (script.match(/^\s*var\s+ytInitialPlayerResponse\s*=/)) {
            ytInitialPlayerResponse = extractObject<any>('=', script)?.result;
            continue;
        }
    }

    if (!ytInitialPlayerResponse) {
        throw new CrawlError();
    }

    let result: VideoCrawlResult = {
        type: 'video',
        details: ytInitialPlayerResponse.videoDetails
    };

    if (ytInitialPlayerResponse.playabilityStatus.liveStreamability) {
        let streamAbility = ytInitialPlayerResponse.playabilityStatus.liveStreamability.liveStreamabilityRenderer;
        if (
            streamAbility.offlineSlate &&
            streamAbility.offlineSlate.liveStreamOfflineSlateRenderer.scheduledStartTime
        ) {
            const timestamp =
                Number.parseInt(streamAbility.offlineSlate.liveStreamOfflineSlateRenderer.scheduledStartTime) * 1000;
            if (!isNaN(timestamp)) {
                result.schedule = new Date(timestamp);
            }
        }
    }

    return result;
}

export async function fetchProfile(url: string) {
    validateURL(url);

    let res = await extractScriptAndMeta(
        await fetch(url, {
            headers: {
                'accept-language': 'en-US,en;q=0.9'
            }
        })
    );

    if (!res.meta.type) {
        throw new CrawlError();
    }

    if (res.meta.type === 'video.other') {
        const data = extractVideo(res.scripts);
        res = await extractScriptAndMeta(
            await fetch(`https://youtube.com/channel/${data.details.channelId}`, {
                headers: {
                    'accept-language': 'en-US,en;q=0.9'
                }
            })
        );
    }

    return extractProfile(res.scripts);
}

export async function fetchVideo(url: string) {
    validateURL(url);

    let res = await extractScriptAndMeta(
        await fetch(url, {
            headers: {
                'accept-language': 'en-US,en;q=0.9'
            }
        })
    );

    if (res.meta.type !== 'video.other') {
        throw new CrawlError();
    }

    return extractVideo(res.scripts);
}

export async function getChannelData(urlOrHandle: string) {
    const ttl = 15 * 60 * 1000;
    if (urlOrHandle.startsWith('@')) {
        urlOrHandle = `https://youtube.com/${urlOrHandle}`;
    }
    const result = await cache.get(
        urlOrHandle,
        async () => {
            const res = await fetchProfile(urlOrHandle);
            if (res.metadata.description.length > 500) {
                res.metadata.description = res.metadata.description.slice(0, 500) + '...';
            }
            res.metadata = {
                title: res.metadata.title,
                description: res.metadata.description,
                externalId: res.metadata.externalId
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
    const result = await fetchVideo(url);
    return result;
}
