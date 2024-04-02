import cac from 'cac';
import { z } from 'zod';
import { createContext } from './ctx';
import { kClient, kDb, kServer } from './symbols';
import { Client } from 'discord.js';
import { PrismaClient } from '@prisma/client';

const startOptions = z.object({
	token: z.string({ required_error: 'Token must be present' }).min(1, 'Token must not be empty'),
	websub: z
		.string({ required_error: 'Websub origin must be present' })
		.min(1, 'Websub origin must not be empty')
		.url('Websub origin must be a valid URL'),
	host: z.string({ required_error: 'Host must be present' }).min(1, 'Host must not be empty'),
	port: z.coerce
		.number({ required_error: 'Port must be present' })
		.int('Port must be an integer')
		.min(1, 'Port must be a positive integer')
		.max(65535, 'Port must be less than 65536')
});

const env = Bun.env;

const cli = cac();

cli
	.command('start', 'Run the bot')
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
		ctx.set(kClient, new Client({ intents: [] }));
		ctx.set(kDb, new PrismaClient());

		const cleanup = async () => {
			ctx.get(kServer).stop();
			await ctx.get(kClient).destroy();
			await ctx.get(kDb).$disconnect();
		};

		process.once('SIGINT', cleanup);
		process.once('SIGTERM', cleanup);
	});

cli.help();

cli.parse();
