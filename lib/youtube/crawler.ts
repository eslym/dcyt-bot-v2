import { FetchError, InvalidURLError } from './types';

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
	public meta = new Map<string, string>();

	element(element: HTMLRewriterTypes.Element): void {
		if (element.hasAttribute('property')) {
			const prop = element.getAttribute('property')!;
			this.meta.set(`property/${prop}`, element.getAttribute('content') ?? '');
		} else if (element.hasAttribute('name')) {
			const name = element.getAttribute('name')!;
			this.meta.set(`name/${name}`, element.getAttribute('content') ?? '');
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
			result: JSON.parse(json)
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
	if (res.status === 404) {
		return undefined;
	}
	if (res.status !== 200) {
		throw new FetchError(`Failed to fetch: ${res.status}`);
	}
	const se = new ScriptExtractor();
	const me = new MetaExtractor();
	const rewriter = new HTMLRewriter().on('script', se).on('meta', me);
	await rewriter.transform(res).arrayBuffer();
	return {
		scripts: se.scripts,
		meta: me.meta
	};
}

function findChannelId(scripts: string[]): string | undefined {
	for (const script of scripts) {
		if (script.match(/^\s*var\s+ytInitialPlayerResponse\s*=/)) {
			return extractObject<any>('=', script)?.result?.videoDetails?.channelId;
		}
	}
}

export async function fetchChannelId(urlOrHandle: string) {
	if (urlOrHandle.startsWith('@')) {
		urlOrHandle = `https://youtube.com/${urlOrHandle}`;
	}
	validateURL(urlOrHandle);
	let res = await extractScriptAndMeta(
		await fetch(urlOrHandle, {
			headers: {
				'accept-language': 'en-US,en;q=0.9'
			}
		})
	);
	if (!res) return undefined;
	if (res.meta.get('property/og:type') === 'video.other') {
		return findChannelId(res.scripts);
	}
	if (res.meta.get('property/og:type') !== 'profile') {
		return undefined;
	}
	if (!res.meta.has('property/og:url')) {
		return undefined;
	}
	const url = new URL(res.meta.get('property/og:url')!);
	const match = /^\/channel\/([^\/]+)/.exec(url.pathname);
	return match?.[1];
}

class CanonicalLinkFinder implements HTMLRewriterTypes.HTMLRewriterElementContentHandlers {
	public links: string[] = [];

	element(element: HTMLRewriterTypes.Element): void {
		if (element.hasAttribute('rel') && element.getAttribute('rel') === 'canonical') {
			this.links.push(element.getAttribute('href') ?? '');
		}
	}
}

async function crawlCanonicalLink(url: string | URL): Promise<string[]> {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(`Failed to fetch ${url}`);
	}
	const finder = new CanonicalLinkFinder();
	const rewriter = new HTMLRewriter();
	rewriter.on('link', finder);
	await rewriter.transform(res).arrayBuffer();
	return finder.links;
}

export async function fetchLiveID(channel: string) {
	const link = `https://www.youtube.com/channel/${channel}/live`;
	const href = await crawlCanonicalLink(link);
	if (!href.length) {
		return null;
	}
	const url = new URL(href[0]);
	if (url.pathname !== '/watch' || !url.searchParams.has('v')) {
		return null;
	}
	const videoId = url.searchParams.get('v')!;
	return videoId;
}
