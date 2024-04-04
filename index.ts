import { ImportMarkdown, UseBrowserAxios } from './lib/plugins';

await Bun.plugin(UseBrowserAxios);
await Bun.plugin(ImportMarkdown);

import('./lib/cli');
