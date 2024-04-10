import type { BunPlugin } from 'bun';

export const ImportMarkdown: BunPlugin = {
    name: 'import-markdown',
    target: 'bun',

    setup(build) {
        build.onLoad({ filter: /\.md$/ }, async ({ path }) => {
            return {
                contents: `export default ${JSON.stringify(await Bun.file(path).text())}`,
                loader: 'js'
            };
        });
    }
};
