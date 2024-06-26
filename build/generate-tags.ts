const sha = process.env.GITHUB_SHA!;
const ref = process.env.GITHUB_REF;

const tags = new Set<string>();

if (ref?.startsWith('refs/tags')) {
    const match = /^refs\/tags\/v?(\d+)\.(\d+)\.(\d+)$/.exec(ref);
    if (match) {
        tags.add(`v${match[1]}`);
        tags.add(`v${match[1]}.${match[2]}`);
        tags.add(`v${match[1]}.${match[2]}.${match[3]}`);
        tags.add('latest');
    }
}

if (ref === 'refs/heads/main') {
    tags.add(`nightly`);
    tags.add(`${sha.substring(0, 7)}`);
}

const image = Bun.argv[2];
const baseTags = [...tags];
const result = baseTags.map((t) => `${image}:${t}`);

console.log('Tags: ', result);

Bun.write(process.env.GITHUB_OUTPUT!, `tags=${result.join(',')}\nbase-tags=${baseTags.join(',')}`);
