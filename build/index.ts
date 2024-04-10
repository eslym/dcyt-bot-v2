import { chmodSync } from 'fs';
import { ImportMarkdown } from '../lib/plugins';
import pkg from '../package.json';
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
    plugins: [ImportMarkdown],
    external: Object.keys((pkg as any).dependencies ?? {}),
    define: {
        'process.env.MIGRATIONS_FOLDER': '"drizzle"'
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

delete (pkg as any).devDependencies;
delete (pkg as any).peerDependencies;
pkg.module = 'index.js';

await Bun.write('./dist/package.json', JSON.stringify(pkg, null, 2));

chmodSync('./dist/index.js', '755');

console.log("\nCopying 'drizzle' folder");

await $`cp -r -v ${import.meta.dir}/../drizzle ${outdir}`;

console.time('\nbuild drizzle-lib');
const drizzle = await Bun.build({
    entrypoints: [
        './build/drizzle/drizzle-orm.ts',
        './build/drizzle/sqlite-core.ts',
        './build/drizzle/bun-sqlite.ts',
        './build/drizzle/migrator.ts'
    ],
    outdir: resolve(outdir, 'drizzle/lib'),
    target: 'bun',
    minify: {
        syntax: true
    },
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

const index = await Bun.file(resolve(outdir, 'index.js')).text();

await Bun.write(
    resolve(outdir, 'index.js'),
    index
        .replace('from "drizzle-orm"', 'from "./drizzle/lib/drizzle-orm"')
        .replace('from "drizzle-orm/sqlite-core"', 'from "./drizzle/lib/sqlite-core"')
        .replace('from "drizzle-orm/bun-sqlite"', 'from "./drizzle/lib/bun-sqlite"')
        .replace('from "drizzle-orm/bun-sqlite/migrator"', 'from "./drizzle/lib/migrator"')
);
