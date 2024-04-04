import type { BunPlugin } from 'bun';
import { dirname, join } from 'path';
import axiosPackage from 'axios/package.json';

const axiosBasePath = dirname(Bun.resolveSync('axios', import.meta.dir));

function escapeRegex(str: string) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const UseBrowserAxios: BunPlugin = {
	name: 'use-browser-axios',
	target: 'bun',
	setup(build) {
		for (const [rel, dest] of Object.entries(axiosPackage.browser)) {
			const pattern = new RegExp(`${escapeRegex(join('node_modules/axios', rel))}$`);
			build.onLoad({ filter: pattern }, async ({ path }) => {
				const resolved = join(axiosBasePath, dest);
				return {
					contents: `import def from ${JSON.stringify(resolved)};export default def;`,
					loader: 'js'
				};
			});
		}
	}
};

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

Bun.plugin(UseBrowserAxios);
Bun.plugin(ImportMarkdown);
