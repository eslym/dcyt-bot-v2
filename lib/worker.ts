declare var self: Worker;

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

async function extractScriptAndMeta({ url, headers }: { url: string; headers?: HeadersInit }) {
    const res = await fetch(url, { headers });
    if (res.status !== 200) {
        return {
            ok: false,
            status: res.status
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

self.onmessage = (event: MessageEvent<{ url: string; headers?: HeadersInit }>) => {
    extractScriptAndMeta(event.data).then((result) => {
        self.postMessage(result);
    });
};
