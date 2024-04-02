import {
	SlashCommandBuilder,
	type Guild,
	ChannelType,
	PermissionFlagsBits,
	EmbedBuilder,
	ChatInputCommandInteraction,
	StringSelectMenuBuilder,
	ActionRowBuilder,
	type BaseMessageOptions
} from 'discord.js';
import type { Context } from './ctx';
import { kClient, kDb, kOptions } from './symbols';
import { lang } from './lang';

import enHelp from './help/en.md.txt';
import cnHelp from './help/zh-CN.md.txt';
import twHelp from './help/zh-TW.md.txt';
import type { PrismaClient, Guild as GuildRecord } from '@prisma/client';

export type ValidChannelTypes =
	| ChannelType.GuildText
	| ChannelType.AnnouncementThread
	| ChannelType.PublicThread
	| ChannelType.PrivateThread;

const helpText: Record<string, string> = {
	en: enHelp,
	'zh-CN': cnHelp,
	'zh-TW': twHelp
};

const guildCommands = [
	new SlashCommandBuilder()
		.setName('config')
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setDescription(lang.en.COMMAND.CONFIG.DESCRIPTION)
		.setDescriptionLocalization('zh-CN', lang['zh-CN'].COMMAND.CONFIG.DESCRIPTION)
		.setDescriptionLocalization('zh-TW', lang['zh-TW'].COMMAND.CONFIG.DESCRIPTION)
		.addChannelOption((opt) =>
			opt
				.setName('channel')
				.setDescription(lang.en.COMMAND.CONFIG.OPTIONS.CHANNEL)
				.setDescriptionLocalization('zh-CN', lang['zh-CN'].COMMAND.CONFIG.OPTIONS.CHANNEL)
				.addChannelTypes(
					ChannelType.GuildText,
					ChannelType.AnnouncementThread,
					ChannelType.PublicThread,
					ChannelType.PrivateThread
				)
				.setRequired(false)
		),

	new SlashCommandBuilder()
		.setName('list')
		.setDescription(lang.en.COMMAND.LIST.DESCRIPTION)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setDescriptionLocalization('zh-CN', lang['zh-CN'].COMMAND.LIST.DESCRIPTION)
		.setDescriptionLocalization('zh-TW', lang['zh-TW'].COMMAND.LIST.DESCRIPTION)
		.addChannelOption((opt) =>
			opt
				.addChannelTypes(
					ChannelType.GuildText,
					ChannelType.AnnouncementThread,
					ChannelType.PublicThread,
					ChannelType.PrivateThread
				)
				.setName('channel')
				.setDescription(lang.en.COMMAND.LIST.OPTIONS.CHANNEL)
				.setDescriptionLocalization('zh-CN', lang['zh-CN'].COMMAND.LIST.OPTIONS.CHANNEL)
				.setDescriptionLocalization('zh-TW', lang['zh-TW'].COMMAND.LIST.OPTIONS.CHANNEL)
		),

	new SlashCommandBuilder()
		.setName('subscribe')
		.setDescription(lang.en.COMMAND.SUBSCRIBE.DESCRIPTION)
		.setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
		.setDescriptionLocalization('zh-CN', lang['zh-CN'].COMMAND.SUBSCRIBE.DESCRIPTION)
		.setDescriptionLocalization('zh-TW', lang['zh-TW'].COMMAND.SUBSCRIBE.DESCRIPTION)
		.addStringOption((opt) =>
			opt
				.setName('channel')
				.setDescription(lang.en.COMMAND.SUBSCRIBE.OPTIONS.CHANNEL)
				.setDescriptionLocalization('zh-CN', lang['zh-CN'].COMMAND.SUBSCRIBE.OPTIONS.CHANNEL)
				.setDescriptionLocalization('zh-TW', lang['zh-TW'].COMMAND.SUBSCRIBE.OPTIONS.CHANNEL)
				.setRequired(true)
		)
		.addStringOption((opt) =>
			opt
				.setName('to')
				.setDescription(lang.en.COMMAND.SUBSCRIBE.OPTIONS.TO)
				.setDescriptionLocalization('zh-CN', lang['zh-CN'].COMMAND.SUBSCRIBE.OPTIONS.TO)
				.setDescriptionLocalization('zh-TW', lang['zh-TW'].COMMAND.SUBSCRIBE.OPTIONS.TO)
				.setRequired(true)
		),

	new SlashCommandBuilder()
		.setName('help')
		.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
		.setDescription(lang.en.COMMAND.HELP.DESCRIPTION)
		.setDescriptionLocalization('zh-CN', lang['zh-CN'].COMMAND.HELP.DESCRIPTION)
		.setDescriptionLocalization('zh-TW', lang['zh-TW'].COMMAND.HELP.DESCRIPTION)
];

async function getGuildId(_: Context, interaction: ChatInputCommandInteraction) {
	const guildId = interaction.guildId ?? interaction.guild?.id;
	if (!guildId) {
		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setTitle('Error')
					.setDescription('Unable to determine the guild for this interaction.')
					.setColor('#ff0000')
			],
			ephemeral: true
		});
		throw true;
	}
	return guildId;
}

type MessageComponents = Exclude<BaseMessageOptions['components'], undefined>;

function configComponents(locale: string, guildData: GuildRecord) {
	const l = lang[locale];
	const languages = Object.entries(lang).map(([lang, l]) => ({
		value: lang,
		label: l.LANG,
		default: lang === (guildData.language ?? 'en')
	}));
	return [
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId('config:lang')
				.setPlaceholder(l.HINT.SELECT_LANGUAGE)
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(languages)
		)
	];
}

const commandHandlers: Record<string, (ctx: Context, interaction: ChatInputCommandInteraction) => Promise<unknown>> = {
	async config(ctx, interaction) {
		return getGuildId(ctx, interaction)
			.then(async (guildId) => {
				const db = ctx.get(kDb);
				const guildData = (await db.guild.findUnique({ where: { id: guildId } }))!;
				const channel = interaction.options.getChannel<ValidChannelTypes>('channel', false);
				const l = lang[guildData.language ?? 'en'];
				if (!channel) {
					const languages = Object.entries(lang).map(([lang, l]) => ({
						value: lang,
						label: l.LANG,
						default: lang === (guildData.language ?? 'en')
					}));
					await interaction.reply({
						components: [
							new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
								new StringSelectMenuBuilder()
									.setCustomId('config:lang')
									.setPlaceholder(l.HINT.SELECT_LANGUAGE)
									.setMinValues(1)
									.setMaxValues(1)
									.addOptions(languages)
							)
						],
						ephemeral: true
					});
					return;
				}
			})
			.catch((err) => {
				if (err === true) return;
				console.error(err);
			});
	},
	async help(ctx, interaction) {
		return getGuildId(ctx, interaction)
			.then(async (guildId) => {
				const db = ctx.get(kDb);
				const guild = (await db.guild.findUnique({ where: { id: guildId } }))!;
				await interaction.reply({
					content: helpText[guild.language ?? 'en'],
					ephemeral: true
				});
			})
			.catch((err) => {
				if (err === true) return;
				console.error(err);
			});
	}
};

async function syncCommands(db: PrismaClient, guild: Guild) {
	return guild.commands
		.set(guildCommands)
		.then(async () => {
			console.log('[bot]', 'Application commands synced.', { guild: guild.id });
			await db.guild.upsert({
				where: { id: guild.id },
				create: { id: guild.id },
				update: {}
			});
		})
		.catch((error) => {
			console.log('[bot]', 'Unable to sync commands', {
				error,
				guild: guild.id
			});
		});
}

export function setupClient(ctx: Context) {
	const client = ctx.get(kClient);
	const options = ctx.get(kOptions);
	const db = ctx.get(kDb);

	client.on('ready', async () => {
		if (client.user) console.log('[bot]', `Logged in as ${client.user.tag}`);

		if (client.application) {
			const url = new URL('https://discord.com/oauth2/authorize?scope=bot+applications.commands&permissions=149504');
			url.searchParams.append('client_id', client.application.id);
			console.log('[bot]', `Invite link: ${url}`);
			console.log('[bot]', 'Syncing global commands');
			client.application.commands.set(guildCommands);
		} else {
			console.log('[bot]', 'Could not get application id, invite link will not be generated');
		}

		for (const guild of client.guilds.cache.values()) {
			await syncCommands(db, guild);
		}
	});

	client.on('interactionCreate', async (interaction) => {
		if (interaction.isChatInputCommand()) {
			await commandHandlers[interaction.commandName]?.(ctx, interaction);
			return;
		}
	});

	client.on('guildCreate', (g) => syncCommands(db, g));

	return client.login(options.token);
}
