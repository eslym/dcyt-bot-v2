import type { BunPlugin } from 'bun';
import { dirname, join, relative } from 'path';
import axiosPackage from 'axios/package.json';

const axiosBasePath = dirname(Bun.resolveSync('axios', import.meta.dir));

export const UseBrowserAxios: BunPlugin = {
	name: 'use-browser-axios',
	setup(build) {
		build.onLoad({ filter: /\/node_modules\/axios\// }, ({ path }) => {
			const rel = './' + relative(axiosBasePath, path);
			if (rel in axiosPackage.browser) {
				const resolved = join(axiosBasePath, axiosPackage.browser[rel as keyof typeof axiosPackage.browser]);
				const importPath = relative(dirname(path), resolved);
				return {
					contents: `import def from ${JSON.stringify(
						importPath.startsWith('.') ? importPath : './' + importPath
					)}; export default def;`,
					loader: 'js'
				};
			}
		});
	}
};

Bun.plugin(UseBrowserAxios);
