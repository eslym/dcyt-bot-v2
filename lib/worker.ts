import JSON5 from 'json5';

declare var self: Worker;

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

class ScriptExtractor implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
    public scripts: string[] = [];
    #script = '';

    element(element: HTMLRewriterTypes.Element) {
        element.onEndTag(() => {
            this.scripts.push(this.#script);
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
    const start = (index = source.indexOf('{', index));
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
            const loc = locateString(source, index);
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
    const loc = locateObject(source, index);
    if (!loc) {
        return null;
    }
    try {
        const json = source.slice(...loc);
        return {
            range: loc,
            result: JSON5.parse(json)
        };
    } catch (e) {}
    return null;
}

function extractProfile(scripts: string[]): ProfileCrawlResult | null {
    for (const script of scripts) {
        if (script.match(/^\s*var\s+ytInitialData\s*=/)) {
            const initialData = extractObject<any>('=', script);
            if (initialData && initialData.result.metadata) {
                return {
                    type: 'profile',
                    metadata: initialData.result.metadata.channelMetadataRenderer
                };
            }
        }
    }
    return null;
}

function extractVideo(scripts: string[]): VideoCrawlResult | null {
    let ytInitialPlayerResponse: any = undefined;
    for (const script of scripts) {
        if (script.match(/^\s*var\s+ytInitialPlayerResponse\s*=/)) {
            ytInitialPlayerResponse = extractObject<any>('=', script)?.result;
            continue;
        }
    }

    if (!ytInitialPlayerResponse) {
        return null;
    }

    const result: VideoCrawlResult = {
        type: 'video',
        details: ytInitialPlayerResponse.videoDetails
    };

    if (ytInitialPlayerResponse.playabilityStatus.liveStreamability) {
        const streamAbility = ytInitialPlayerResponse.playabilityStatus.liveStreamability.liveStreamabilityRenderer;
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

async function extractScriptAndMeta({ url, headers }: { url: string; headers?: HeadersInit }): Promise<
    | {
          ok: true;
          data: {
              scripts: string[];
              meta: {
                  url?: string;
                  type?: 'profile' | 'video.other';
              };
          };
      }
    | { ok: false; error: any[] }
> {
    const res = await fetch(url, { headers });
    if (res.status !== 200) {
        return {
            ok: false,
            error: ['FetchError', url, res.status]
        };
    }
    const html = await res.text();
    const se = new ScriptExtractor();
    const me = new MetaExtractor();
    const rewriter = new HTMLRewriter().on('script', se).on('meta', me);
    rewriter.transform(html);
    return {
        ok: true,
        data: {
            scripts: se.scripts,
            meta: {
                url: me.url,
                type: me.type
            }
        }
    };
}

async function fetchProfile(url: string) {
    if (!validateURL(url)) {
        return {
            ok: false,
            error: ['InvalidURLError', url]
        };
    }

    let res = await extractScriptAndMeta({
        url,
        headers: {
            'accept-language': 'en-US,en;q=0.9'
        }
    });

    if (!res.ok) {
        return res;
    }

    if (!res.data.meta.type) {
        return {
            ok: false,
            error: ['CrawlError']
        };
    }

    if (res.data.meta.type === 'video.other') {
        const data = extractVideo(res.data.scripts);
        if (!data) {
            return {
                ok: false,
                error: ['CrawlError']
            };
        }
        res = await extractScriptAndMeta({
            url: `https://youtube.com/channel/${data.details.channelId}`,
            headers: {
                'accept-language': 'en-US,en;q=0.9'
            }
        });
        if (!res.ok) {
            return res;
        }
    }

    const profile = extractProfile(res.data.scripts);
    if (!profile) {
        return {
            ok: false,
            error: ['CrawlError']
        };
    }
    return {
        ok: true,
        data: profile
    };
}

async function fetchVideo(url: string) {
    if (!validateURL(url)) {
        return {
            ok: false,
            error: ['InvalidURLError', url]
        };
    }

    const res = await extractScriptAndMeta({
        url,
        headers: {
            'accept-language': 'en-US,en;q=0.9'
        }
    });

    if (!res.ok) {
        return res;
    }

    if (res.data.meta.type !== 'video.other') {
        return {
            ok: false,
            error: ['CrawlError']
        };
    }

    const video = extractVideo(res.data.scripts);
    if (!video) {
        return {
            ok: false,
            error: ['CrawlError']
        };
    }
    return {
        ok: true,
        data: video
    };
}

const allowedHosts = new Set(['youtube.com', 'www.youtube.com', 'youtu.be']);

function validateURL(url: string) {
    if (!URL.canParse(url)) {
        return false;
    }
    const { hostname, protocol } = new URL(url);
    if (!allowedHosts.has(hostname) || protocol !== 'https:') {
        return false;
    }
    return true;
}

self.onmessage = (event: MessageEvent<[id: number, type: 'video' | 'profile', url: string]>) => {
    const [id, type, url] = event.data;
    if (type === 'video') {
        fetchVideo(url)
            .then((result) => {
                self.postMessage([id, result]);
            })
            .catch((err) => {
                self.postMessage([id, { ok: false, error: [err.message] }]);
            });
    } else if (type === 'profile') {
        fetchProfile(url)
            .then((result) => {
                self.postMessage([id, result]);
            })
            .catch((err) => {
                self.postMessage([id, { ok: false, error: [err.message] }]);
            });
    }
};
