#!/usr/bin/env bun

import cac from 'cac';
import { kClient, kDb, kFetcher, kOptions, kServer } from './symbols';
import { Client, IntentsBitField } from 'discord.js';
import { startOptions } from './options';
import { setupClient } from './client';
import { handleWebSub } from './websub';
import { setupCron } from './cron';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { resolve } from 'path';
import * as t from './db/schema';
import { Context } from './ctx';
import { APIDataFetcher } from './youtube/api';
import { youtube } from '@googleapis/youtube';

declare var MIGRATION_FOLDER: string;

const env = Bun.env;

const cli = cac();

cli.command('', 'Run the bot')
    .option('-t, --token [token]', 'Bot token', { default: env.DISCORD_TOKEN })
    .option('-w, --websub [websub]', 'Websub origin', { default: env.WEBSUB_ORIGIN })
    .option('-h, --host [host]', 'Host to listen on', { default: env.HOST || '0.0.0.0' })
    .option('-p, --port [port]', 'Port to listen on', { default: env.PORT || '80' })
    .option('-d, --database [database]', 'Database path', { default: resolve(env.DATABASE_URL || './db.sqlite') })
    .option('--gapi-token [token]', 'Google API token', { default: env.GOOGLE_API_TOKEN })
    .example('start -t <token> -w <websub> -h <host> -p <port>')
    .action(async (options) => {
        const opts = startOptions.safeParse(options);
        if (!opts.success) {
            console.error('Invalid options');
            const errors = opts.error.flatten().fieldErrors;
            for (const [key, value] of Object.entries(errors)) {
                console.error(`--${key}:`);
                for (const err of value) {
                    console.error(`\t${err}`);
                }
            }
            process.exit(1);
        }
        const ctx = new Context();

        ctx.set(kFetcher, new APIDataFetcher(youtube({ version: 'v3', auth: opts.data.gapiToken })));

        let db = new Database(opts.data.database);
        let orm = drizzle(db, {
            schema: t
        });

        ctx.set(kDb, orm);

        migrate(orm, {
            migrationsFolder: resolve(import.meta.dirname, MIGRATION_FOLDER)
        });

        ctx.set(kOptions, opts.data);

        ctx.set(kClient, new Client({ intents: [IntentsBitField.Flags.Guilds], partials: [] }));
        ctx.set(
            kServer,
            Bun.serve({
                hostname: opts.data.host,
                port: opts.data.port,
                development: false,
                async fetch(request) {
                    const result = await handleWebSub(ctx, request);
                    if (result) return result;
                    if (request.method === 'HEAD' || request.method === 'GET') {
                        return new Response('404 Not Found', {
                            status: 404,
                            headers: { 'Content-Type': 'text/plain' }
                        });
                    }
                    return new Response('405 Method Not Allowed', {
                        status: 405,
                        headers: { 'Content-Type': 'text/plain' }
                    });
                }
            })
        );

        setupCron(ctx);

        const cleanup = async () => {
            console.log('Program shutting down');
            ctx.get(kServer).stop();
            await ctx.get(kClient).destroy();
            db.close();
            process.exit(0);
        };

        process.once('SIGINT', cleanup);
        process.once('SIGTERM', cleanup);

        await setupClient(ctx);
    });

cli.command('clear-commands', 'Clear all commands from the bot')
    .option('-t, --token [token]', 'Bot token', { default: env.DISCORD_TOKEN })
    .action(async (options: { token: string }) => {
        const client = new Client({ intents: [], partials: [] });

        client.on('ready', async () => {
            if (client.application) {
                await client.application.commands.set([]);
            }
            for (const guild of client.guilds.cache.values()) {
                console.log('[bot]', 'Clearing commands', { guild: guild.id });
                await guild.commands.set([]);
            }
            process.exit(0);
        });

        await client.login(options.token);
    });

cli.help();

cli.parse();
