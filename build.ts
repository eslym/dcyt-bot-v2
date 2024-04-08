import { chmodSync } from 'fs';
import { ImportMarkdown, UseBrowserAxios } from './lib/plugins';
import pkg from './package.json';
import { $ } from 'bun';

const outdir = `${import.meta.dir}/dist`;

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
    plugins: [UseBrowserAxios, ImportMarkdown],
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
pkg.module = 'index.js';

await Bun.write('./dist/package.json', JSON.stringify(pkg, null, 2));

await $`cp -r -v ${import.meta.dir}/drizzle ${outdir}`;

chmodSync('./dist/index.js', '755');
