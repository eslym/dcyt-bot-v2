const sha = process.env.GITHUB_SHA!;
const ref = process.env.GITHUB_REF;

const arch = process.arch;

const tags = new Set<string>();

if (ref?.startsWith('refs/tags')) {
    const match = /^refs\/tags\/v?(\d+)\.(\d+)\.(\d+)$/.exec(ref);
    if (match) {
        tags.add(match[1]);
        tags.add(`${match[1]}.${match[2]}`);
        tags.add(`${match[1]}.${match[2]}.${match[3]}`);
        tags.add('latest');
    }
}

if (ref === 'refs/heads/main') {
    tags.add(`nightly`);
    tags.add(`nightly-${sha.substring(0, 7)}`);
}

const image = Bun.argv[2];
const result = [...tags].map((t) => `${image}:${t}-${arch}`).join(',');

console.log('Tags: ', result);

Bun.write(process.env.GITHUB_OUTPUT!, `tags=${result}`);
