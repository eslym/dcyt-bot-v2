import { resolve } from 'path';

await Bun.plugin({
    name: 'dependencies',
    target: 'bun',

    setup(build) {
        build.onLoad({ filter: /\.md$/ }, async ({ path }) => {
            return {
                exports: {
                    default: await Bun.file(path).text()
                },
                loader: 'object'
            };
        });
    }
});

(globalThis as any).MIGRATIONS_FOLDER = resolve(import.meta.dirname, 'drizzle');

import('./lib/cli');
