#!/usr/bin/env bun

import cac from 'cac';
import { createContext } from './ctx';
import { kClient, kDb, kOptions, kServer } from './symbols';
import { Client } from 'discord.js';
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import fetchAdapter from '@haverstack/axios-fetch-adapter';
import { startOptions } from './schema';
import { setupClient } from './client';
import { handleWebSub } from './websub';
import { cache } from './cache';

axios.defaults.adapter = fetchAdapter;

const env = Bun.env;

const cli = cac();

cli
	.command('', 'Run the bot')
	.option('-t, --token [token]', 'Bot token', { default: env.DISCORD_TOKEN })
	.option('-w, --websub [websub]', 'Websub origin', { default: env.WEBSUB_ORIGIN })
	.option('-h, --host [host]', 'Host to listen on', { default: env.HOST || '0.0.0.0' })
	.option('-p, --port [port]', 'Port to listen on', { default: env.PORT || '80' })
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
		const ctx = createContext();
		ctx.set(kOptions, opts.data);
		ctx.set(kDb, new PrismaClient());
		ctx.set(kClient, new Client({ intents: [], partials: [] }));
		ctx.set(
			kServer,
			Bun.serve({
				hostname: opts.data.host,
				port: opts.data.port,
				async fetch(request) {
					const result = await handleWebSub(ctx, request);
					if (result) return result;
					if (request.method === 'HEAD' || request.method === 'GET') {
						return new Response('404 Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } });
					}
					return new Response('405 Method Not Allowed', { status: 405, headers: { 'Content-Type': 'text/plain' } });
				}
			})
		);

		setInterval(() => cache.invalidate(), 15000);

		const cleanup = async () => {
			console.log('Program shutting down');
			ctx.get(kServer).stop();
			await ctx.get(kClient).destroy();
			await ctx.get(kDb).$disconnect();
			process.exit(0);
		};

		process.once('SIGINT', cleanup);
		process.once('SIGTERM', cleanup);

		await setupClient(ctx);
	});

cli
	.command('clear-commands', 'Clear all commands from the bot')
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
