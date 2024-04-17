import { resolve } from 'path';
import { ImportMarkdown } from './lib/plugins';

await Bun.plugin(ImportMarkdown);

process.env.MIGRATIONS_FOLDER = resolve(import.meta.dirname, 'drizzle');

import('./lib/cli');
