import { chmodSync } from 'fs';
import { $ } from 'bun';
import { resolve } from 'path';

const outdir = resolve(import.meta.dir, '../dist');

function humanFileSize(bytes: number, si = false, dp = 1) {
    const thresh = si ? 1000 : 1024;

    if (Math.abs(bytes) < thresh) {
        return bytes + ' B';
    }

    const units = si
        ? ['kB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
        : ['KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB'];
    let u = -1;
    const r = 10 ** dp;

    do {
        bytes /= thresh;
        ++u;
    } while (Math.round(Math.abs(bytes) * r) / r >= thresh && u < units.length - 1);

    return bytes.toFixed(dp) + ' ' + units[u];
}

await $`rm -rf ${outdir}`;
await $`mkdir -p ${outdir}`;

console.time('build bundle');
const bundle = await Bun.build({
    entrypoints: ['./lib/cli.ts'],
    outdir,
    naming: 'index.js',
    target: 'bun',
    minify: {
        syntax: true
    },
    plugins: [
        {
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
        },
        {
            // Temporary fix for https://github.com/oven-sh/bun/issues/10851
            name: 'import-json',
            target: 'bun',
            setup(build) {
                build.onLoad({ filter: /\.json$/ }, async ({ path }) => {
                    const data = await Bun.file(path).json();
                    return {
                        contents: `export default ${JSON.stringify(data)};`,
                        loader: 'js'
                    };
                });
            }
        }
    ],
    external: ['drizzle-orm', 'drizzle-orm/sqlite-core', 'drizzle-orm/bun-sqlite', 'drizzle-orm/bun-sqlite/migrator'],
    define: {
        MIGRATIONS_FOLDER: '"drizzle"'
    }
});

console.timeEnd('build bundle');

bundle.logs.forEach((log) => console.log(log));

for (const file of bundle.outputs) {
    console.log(
        `${file.path.padEnd(50, ' ')} ${`${file.size} bytes`.padStart(20, ' ')} ${humanFileSize(file.size).padStart(
            10,
            ' '
        )}`
    );
}

chmodSync('./dist/index.js', '755');

console.log("\nCopying 'drizzle' folder");

await $`cp -r -v ${import.meta.dir}/../drizzle ${outdir}`;

console.log();

console.time('build drizzle-lib');
const drizzle = await Bun.build({
    entrypoints: [
        './build/drizzle/index.ts',
        './build/drizzle/sqlite-core.ts',
        './build/drizzle/bun-sqlite.ts',
        './build/drizzle/migrator.ts'
    ],
    outdir: resolve(outdir, 'node_modules/drizzle-orm'),
    target: 'bun',
    minify: true,
    splitting: true
});
console.timeEnd('build drizzle-lib');

for (const file of drizzle.outputs) {
    console.log(
        `${file.path.padEnd(50, ' ')} ${`${file.size} bytes`.padStart(20, ' ')} ${humanFileSize(file.size).padStart(
            10,
            ' '
        )}`
    );
}

drizzle.logs.forEach((log) => console.log(log));

const pkgJson = await Bun.file('node_modules/drizzle-orm/package.json').json();

await Bun.write(
    resolve(outdir, 'node_modules/drizzle-orm/package.json'),
    JSON.stringify({
        name: pkgJson.name,
        version: pkgJson.version,
        description: pkgJson.description,
        type: 'module',
        main: 'index.js',
        exports: {
            '.': {
                import: './index.js'
            },
            './sqlite-core': {
                import: './sqlite-core.js'
            },
            './bun-sqlite': {
                import: './bun-sqlite.js'
            },
            './bun-sqlite/migrator': {
                import: './migrator.js'
            }
        }
    })
);
