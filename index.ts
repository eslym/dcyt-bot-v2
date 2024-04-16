import { resolve } from 'path';
import { ImportMarkdown } from './lib/plugins';

await Bun.plugin(ImportMarkdown);

process.env.__MIGRATIONS_FOLDER = resolve(import.meta.dirname, 'drizzle');
process.env.__WORKER_PATH = './worker.ts';

import('./lib/cli');
