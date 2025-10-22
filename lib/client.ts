import {
	SlashCommandBuilder,
	Guild,
	ChannelType,
	PermissionFlagsBits,
	EmbedBuilder,
	ChatInputCommandInteraction,
	StringSelectMenuBuilder,
	ActionRowBuilder,
	type BaseMessageOptions,
	type AnySelectMenuInteraction,
	ButtonInteraction,
	ModalBuilder,
	TextInputBuilder,
	TextInputStyle,
	type Snowflake,
	ModalSubmitInteraction,
	ButtonBuilder,
	ButtonStyle,
	StringSelectMenuInteraction,
	ActivityType,
	type ModalMessageModalSubmitInteraction,
	MessageFlags
} from 'discord.js';
import type { Context } from './ctx';
import { kClient, kDb, kOptions, kYoutube } from './symbols';
import { lang } from './lang';
import enHelp from './help/en.md';
import cnHelp from './help/zh-CN.md';
import twHelp from './help/zh-TW.md';
import { NotificationType } from './enum';
import Mustache from 'mustache';
import { ucfirst } from './utils';
import { checkSubs } from './websub';
import * as t from './db/schema';
import { count, sql } from 'drizzle-orm';
import { getGuildData, upsertGuild } from './db/utils';
import type { YoutubeSubscription } from './db/types';
import { alias } from 'drizzle-orm/sqlite-core';
import { fetchChannelId } from './youtube/crawler';

Mustache.templateCache = undefined;

function escapeDiscordMarkdown(text: string) {
	const markdownSpecialChars = /([\\`*_\[\]\-~<]|^[#>])/g;
	return text.replace(markdownSpecialChars, '\\$1');
}

Mustache.escape = escapeDiscordMarkdown;

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

//MARK: Commands Definitions
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
				.setRequired(false)
		),

	new SlashCommandBuilder()
		.setName('inspect')
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
				.setRequired(false)
		),

	new SlashCommandBuilder()
		.setName('help')
		.setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
		.setDescription(lang.en.COMMAND.HELP.DESCRIPTION)
		.setDescriptionLocalization('zh-CN', lang['zh-CN'].COMMAND.HELP.DESCRIPTION)
		.setDescriptionLocalization('zh-TW', lang['zh-TW'].COMMAND.HELP.DESCRIPTION)
];

async function getGuildId(
	_: Context,
	interaction: ChatInputCommandInteraction | AnySelectMenuInteraction | ButtonInteraction | ModalSubmitInteraction
) {
	const guildId = interaction.guildId ?? interaction.guild?.id;
	if (!guildId) {
		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setTitle('Error')
					.setDescription('Unable to determine the guild for this interaction, DM mode is not supported.')
					.setColor('#ff0000')
			],
		});
		throw true;
	}
	return guildId;
}

type Mutable<T> = T extends readonly (infer U)[] ? U[] : never;

type MessageComponents = Mutable<BaseMessageOptions['components']>;

function configComponents(locale: string, channelId?: string): MessageComponents {
	const l = lang[locale];
	const languages = Object.entries(lang).map(([lang, l]) => ({
		value: lang,
		label: l.LANG,
		default: lang === locale
	}));
	const categories = Object.keys(NotificationType) as (keyof typeof NotificationType)[];
	const components = [
		new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
			new StringSelectMenuBuilder()
				.setCustomId(channelId ? `config:category:${channelId}` : 'config:category')
				.setPlaceholder(l.HINT.SELECT_CATEGORY)
				.setMinValues(1)
				.setMaxValues(1)
				.addOptions(
					categories.map((category) => ({
						value: category,
						label: l.ACTION.TOGGLE[category].TITLE,
						description: l.ACTION.TOGGLE[category].DESCRIPTION
					}))
				)
		)
	] as MessageComponents;
	if (!channelId) {
		components.unshift(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId('config:lang')
					.setPlaceholder(l.HINT.SELECT_LANGUAGE)
					.setMinValues(1)
					.setMaxValues(1)
					.addOptions(languages)
			)
		);
	}
	return components;
}

async function youtubeChannelInteraction(
	interaction:
		| ChatInputCommandInteraction
		| StringSelectMenuInteraction
		| ButtonInteraction
		| ModalMessageModalSubmitInteraction,
	ytChId: string,
	sub: YoutubeSubscription | null | undefined,
	targetChannel: string,
	l: (typeof lang)[string]
) {
	const rows = [
		new ActionRowBuilder<ButtonBuilder>().addComponents(
			new ButtonBuilder()
				.setCustomId(`subscribe:${ytChId}:${targetChannel}`)
				.setLabel(sub ? l.ACTION.REMOVE : l.ACTION.ADD)
				.setStyle(sub ? ButtonStyle.Secondary : ButtonStyle.Success)
				.setEmoji(sub ? '❌' : '➕')
		)
	] as MessageComponents;
	if (sub) {
		const categories = Object.keys(NotificationType) as (keyof typeof NotificationType)[];
		rows.push(
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(`notify:${ytChId}:${targetChannel}`)
					.setPlaceholder(l.HINT.SELECT_ENABLE)
					.setMinValues(0)
					.setMaxValues(categories.length)
					.addOptions(
						categories.map((category) => ({
							value: category,
							label: l.ACTION.TOGGLE[category].TITLE,
							description: l.ACTION.TOGGLE[category].DESCRIPTION,
							default: (sub as any)[`notify${ucfirst(category)}`]
						}))
					)
			),
			new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
				new StringSelectMenuBuilder()
					.setCustomId(`template:${ytChId}:${targetChannel}`)
					.setPlaceholder(l.HINT.SELECT_CATEGORY)
					.setMinValues(1)
					.setMaxValues(1)
					.addOptions(
						categories.map((category) => ({
							value: category,
							label: l.ACTION.TOGGLE[category].TITLE,
							description: l.ACTION.TOGGLE[category].DESCRIPTION
						}))
					)
			)
		);
	}
	await interaction.editReply({
		content: `# ${Mustache.render(l.HINT.CHANNEL, { channel: targetChannel })}\nhttps://youtube.com/channel/${ytChId}`,
		components: rows
	});
}

async function listSubscriptionInteraction(
	ctx: Context,
	interaction: ChatInputCommandInteraction | ButtonInteraction,
	l: (typeof lang)[string],
	dcCh: string,
	page: number = 1
) {
	const [db, yt] = ctx.getAll(kDb, kYoutube);
	const total = db
		.select({
			count: count()
		})
		.from(t.youtubeSubscription)
		.where(sql`${t.youtubeSubscription.guildChannelId} = ${dcCh}`)
		.get()!.count;
	if (interaction.isChatInputCommand()) {
		await interaction.deferReply({
			flags: MessageFlags.Ephemeral
		});
	} else {
		await interaction.deferUpdate();
	}
	if (total === 0) {
		await interaction.editReply({
			content: Mustache.render(l.HINT.NO_SUBSCRIPTIONS, { channel: dcCh })
		});
		return;
	}
	const subscriptions = db
		.select({
			channelId: t.youtubeSubscription.youtubeChannelId,
			channelName: t.youtubeChannel.title
		})
		.from(t.youtubeSubscription)
		.leftJoin(t.youtubeChannel, sql`${t.youtubeSubscription.youtubeChannelId} = ${t.youtubeChannel.id}`)
		.where(sql`${t.youtubeSubscription.guildChannelId} = ${dcCh}`)
		.offset((page - 1) * 5)
		.limit(5)
		.all();

	const dict = new Map(subscriptions.map((sub) => [sub.channelId, sub] as const));
	const missing = subscriptions.filter((sub) => !sub.channelName).map((sub) => sub.channelId);

	if (missing.length) {
		const res = await yt.channels.list({
			id: missing,
			part: ['id', 'snippet']
		});
		if (res.status === 200) {
			for (const item of res.data?.items ?? []) {
				db.update(t.youtubeChannel)
					.set({
						title: item.snippet?.title
					})
					.where(sql`${t.youtubeChannel.id} = ${item.id}`)
					.run();
				dict.get(item.id!)!.channelName = item.snippet?.title!;
			}
		}
	}

	const menu = new StringSelectMenuBuilder()
		.setCustomId(`list:${dcCh}:${page}`)
		.setPlaceholder(l.HINT.SELECT_CHANNEL)
		.setMinValues(1)
		.setMaxValues(1);

	for (const sub of subscriptions) {
		menu.addOptions({
			value: sub.channelId,
			label: sub.channelName ?? 'Unknown Channel',
			description: `youtube.com/channel/${sub.channelId}`
		});
	}

	const prev = new ButtonBuilder()
		.setCustomId(`list:${dcCh}:${page - 1}`)
		.setLabel(l.ACTION.PREVIOUS)
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(page <= 1);

	const next = new ButtonBuilder()
		.setCustomId(`list:${dcCh}:${page + 1}`)
		.setLabel(l.ACTION.NEXT)
		.setStyle(ButtonStyle.Secondary)
		.setDisabled(page * 5 >= total);

	await interaction.editReply({
		content: Mustache.render(l.HINT.CHANNEL, { channel: dcCh }),
		components: subscriptions.length
			? [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
					new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next)
				]
			: [new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next)]
	});
}

//MARK: Command Handlers
const commandHandlers: Record<string, (ctx: Context, interaction: ChatInputCommandInteraction) => Promise<unknown>> = {
	async config(ctx, interaction) {
		return getGuildId(ctx, interaction)
			.then(async (guildId) => {
				const db = ctx.get(kDb);
				const guildData = getGuildData(db, guildId);
				const channel = interaction.options.getChannel<ValidChannelTypes>('channel', false);
				const l = lang[guildData.language ?? 'en'];
				if (!channel) {
					await interaction.reply({
						components: configComponents(guildData.language ?? 'en'),
						flags: MessageFlags.Ephemeral
					});
					return;
				}
				await interaction.reply({
					content: Mustache.render(l.HINT.SETTINGS_FOR, { channel: channel.id }),
					components: configComponents(guildData.language ?? 'en', channel.id),
					flags: MessageFlags.Ephemeral
				});
			})
			.catch((err) => {
				if (err === true) return;
				console.error(err);
			});
	},
	async inspect(ctx, interaction) {
		return getGuildId(ctx, interaction)
			.then(async (guildId) => {
				const source = interaction.options.getString('channel', true);
				await interaction.deferReply({
					flags: MessageFlags.Ephemeral
				});
				const db = ctx.get(kDb);
				const guildData = getGuildData(db, guildId);
				const l = lang[guildData.language ?? 'en'];
				const channelId = await fetchChannelId(source);
				if (!channelId) {
					await interaction.editReply({
						content: l.ERROR.NOT_FOUND
					});
					return;
				}
				const targetChannel = interaction.options.getString('to', false) ?? interaction.channelId;
				const sub = db
					.select()
					.from(t.youtubeSubscription)
					.where(
						sql`${t.youtubeSubscription.guildChannelId} = ${targetChannel} AND ${t.youtubeSubscription.youtubeChannelId} = ${channelId}`
					)
					.get();
				await youtubeChannelInteraction(interaction, channelId, sub, targetChannel, l);
			})
			.catch(async (err) => {
				if (err === true) return;
				console.error(err);
			});
	},
	async list(ctx, interaction) {
		return getGuildId(ctx, interaction)
			.then(async (guildId) => {
				const ch = interaction.options.getChannel<ValidChannelTypes>('channel', false);
				const guildData = getGuildData(ctx.get(kDb), guildId);
				const l = lang[guildData.language ?? 'en'];
				await listSubscriptionInteraction(ctx, interaction, l, ch?.id ?? interaction.channelId);
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
				const guild = getGuildData(db, guildId);
				await interaction.reply({
					content: helpText[guild.language ?? 'en'],
					flags: MessageFlags.Ephemeral,
					embeds: []
				});
			})
			.catch((err) => {
				if (err === true) return;
				console.error(err);
			});
	}
};

const selectMenuHandlers: Record<string, (ctx: Context, interaction: StringSelectMenuInteraction) => Promise<unknown>> =
	{
		async configLang(ctx, interaction) {
			const db = ctx.get(kDb);
			return getGuildId(ctx, interaction)
				.then(async (guildId) => {
					const guildData = db
						.update(t.guild)
						.set({
							language: interaction.values[0]
						})
						.where(sql`${t.guild.id} = ${guildId}`)
						.returning()
						.get();
					await interaction.update({
						components: configComponents(guildData.language ?? 'en')
					});
				})
				.catch((err) => {
					if (err === true) return;
					console.error(err);
				});
		},
		async configCategory(ctx, interaction) {
			const db = ctx.get(kDb);
			return getGuildId(ctx, interaction)
				.then(async (guildId) => {
					const channelId = interaction.customId.substring('config:category'.length + 1);
					const guildData = getGuildData(db, guildId);
					const category = interaction.values[0];
					const l = lang[guildData.language ?? 'en'];
					let template: string;
					let placeholder = (l.NOTIFICATION as any)[category];
					if (channelId) {
						const channelData = db
							.select()
							.from(t.guildChannel)
							.where(sql`${t.guildChannel.id} = ${channelId}`)
							.get()!;
						template = ((channelData as any)[`${category.toLowerCase()}Text`] as string) ?? '';
						placeholder = ((guildData as any)[`${category.toLowerCase()}Text`] as string) ?? placeholder;
					} else {
						template = ((guildData as any)[`${category.toLowerCase()}Text`] as string) ?? '';
					}
					await interaction.showModal(
						new ModalBuilder()
							.setTitle((l.ACTION.TOGGLE as any)[category].TITLE)
							.setCustomId(channelId ? `config:${category}:${channelId}` : `config:${category}`)
							.addComponents(
								new ActionRowBuilder<TextInputBuilder>().addComponents(
									new TextInputBuilder()
										.setLabel(l.LABEL.TEMPLATE)
										.setStyle(TextInputStyle.Paragraph)
										.setCustomId(`template`)
										.setPlaceholder(placeholder)
										.setMinLength(0)
										.setMaxLength(1000)
										.setValue(template)
										.setRequired(false)
								)
							)
					);
				})
				.catch((err) => {
					if (err === true) return;
					console.error(err);
				});
		},
		async notify(ctx, interaction) {
			const db = ctx.get(kDb);
			const [source, targetChannel] = interaction.customId.substring('notify:'.length).split(':');
			return getGuildId(ctx, interaction)
				.then(async (guildId) => {
					const guildData = getGuildData(db, guildId);
					const where = sql`${t.youtubeSubscription.guildChannelId} = ${targetChannel} AND ${t.youtubeSubscription.youtubeChannelId} = ${source}`;
					const sub = db.select().from(t.youtubeSubscription).where(where).get()!;
					if (!sub) return;
					interaction.deferUpdate();
					const update: any = {};
					for (const category of Object.values(NotificationType)) {
						update[`notify${ucfirst(category)}`] = interaction.values.includes(category);
					}
					db.update(t.youtubeSubscription).set(update).where(where).run();
					await youtubeChannelInteraction(
						interaction,
						source,
						sub,
						targetChannel,
						lang[guildData.language ?? 'en']
					);
				})
				.catch((err) => {
					if (err === true) return;
					console.error(err);
				});
		},
		async template(ctx, interaction) {
			const db = ctx.get(kDb);
			const [source, targetChannel] = interaction.customId.substring('template:'.length).split(':');
			return getGuildId(ctx, interaction)
				.then(async (guildId) => {
					const guildData = getGuildData(db, guildId);

					const category = interaction.values[0];
					const field = `${category.toLowerCase()}Text`;

					const subs = alias(t.youtubeSubscription, 'sub');
					const chs = alias(t.guildChannel, 'ch');

					const sub = db
						.select({
							[field]: (subs as any)[field],
							[field + 'Channel']: sql<string>`${(chs as any)[field]}`.as(field + 'Channel')
						})
						.from(subs)
						.where(sql`${subs.guildChannelId} = ${targetChannel} AND ${subs.youtubeChannelId} = ${source}`)
						.innerJoin(chs, sql`${subs.guildChannelId} = ${chs.id}`)
						.get()!;

					if (!sub) return;
					const l = lang[guildData.language ?? 'en'];
					await interaction.showModal(
						new ModalBuilder()
							.setTitle((l.ACTION.TOGGLE as any)[category].TITLE)
							.setCustomId(`template:${source}:${targetChannel}:${category}`)
							.addComponents(
								new ActionRowBuilder<TextInputBuilder>().addComponents(
									new TextInputBuilder()
										.setLabel(l.LABEL.TEMPLATE)
										.setStyle(TextInputStyle.Paragraph)
										.setCustomId(`template`)
										.setPlaceholder(
											sub[field + 'Channel'] ??
												(guildData as any)[field] ??
												(l.NOTIFICATION as any)[category]
										)
										.setMinLength(0)
										.setMaxLength(1000)
										.setValue(sub[field] ?? '')
										.setRequired(false)
								)
							)
					);
				})
				.catch((err) => {
					if (err === true) return;
					console.error(err);
				});
		},
		async list(ctx, interaction) {
			return getGuildId(ctx, interaction)
				.then(async (guildId) => {
					const [dcCh] = interaction.customId.substring('list:'.length).split(':') as [string, string];
					const ytCh = interaction.values[0];
					const db = ctx.get(kDb);
					const guildData = getGuildData(db, guildId);
					const l = lang[guildData.language ?? 'en'];
					const sub = db
						.select()
						.from(t.youtubeSubscription)
						.where(
							sql`${t.youtubeSubscription.guildChannelId} = ${dcCh} AND ${t.youtubeSubscription.youtubeChannelId} = ${ytCh}`
						)
						.get();
					await interaction.deferReply({
						flags: MessageFlags.Ephemeral
					});
					await youtubeChannelInteraction(interaction, ytCh, sub, dcCh, l);
				})
				.catch((err) => {
					if (err === true) return;
					console.error(err);
				});
		}
	};

const modalHandlers: Record<string, (ctx: Context, interaction: ModalSubmitInteraction) => Promise<unknown>> = {
	async config(ctx, interaction) {
		const db = ctx.get(kDb);
		const [category, channelId] = interaction.customId.substring('config:'.length).split(':') as [
			NotificationType,
			Snowflake | undefined
		];
		return getGuildId(ctx, interaction)
			.then(async (guildId) => {
				const guildData = getGuildData(db, guildId);
				const value = interaction.fields.getTextInputValue('template') || null;
				if (channelId) {
					db.insert(t.guildChannel)
						.values({
							id: channelId,
							guildId: guildId,
							[`${category.toLowerCase()}Text`]: value
						})
						.onConflictDoUpdate({
							target: t.guildChannel.id,
							set: {
								[`${category.toLowerCase()}Text`]: value,
								updatedAt: new Date()
							}
						})
						.run();
				} else {
					db.update(t.guild)
						.set({
							[`${category.toLowerCase()}Text`]: value
						})
						.run();
				}
				if (interaction.isFromMessage()) {
					await interaction.update({
						components: configComponents(guildData.language ?? 'en', channelId)
					});
				}
			})
			.catch((err) => {
				if (err === true) return;
				console.error(err);
			});
	},
	async template(ctx, interaction) {
		const db = ctx.get(kDb);
		const [source, targetChannel, category] = interaction.customId.substring('template:'.length).split(':') as [
			string,
			string,
			NotificationType
		];
		return getGuildId(ctx, interaction)
			.then(async (guildId) => {
				const guildData = getGuildData(db, guildId);
				const value = interaction.fields.getTextInputValue('template') || null;
				const where = sql`${t.youtubeSubscription.guildChannelId} = ${targetChannel} AND ${t.youtubeSubscription.youtubeChannelId} = ${source}`;
				const sub = db.select().from(t.youtubeSubscription).where(where).get();
				if (!sub) return;
				db.update(t.youtubeSubscription)
					.set({
						[`${category.toLowerCase()}Text`]: value
					})
					.where(where)
					.run();
				if (interaction.isFromMessage()) {
					interaction.deferUpdate();
					await youtubeChannelInteraction(
						interaction,
						source,
						sub,
						targetChannel,
						lang[guildData.language ?? 'en']
					);
				}
			})
			.catch((err) => {
				if (err === true) return;
				console.error(err);
			});
	}
};

const buttonHandlers: Record<string, (ctx: Context, interaction: ButtonInteraction) => Promise<unknown> | void> = {
	async subscribe(ctx, interaction) {
		const db = ctx.get(kDb);
		return getGuildId(ctx, interaction)
			.then(async (guildId) => {
				await interaction.deferUpdate();
				const guildData = getGuildData(db, guildId);
				const [source, targetChannel] = interaction.customId.substring('subscribe:'.length).split(':');
				const deleted = db
					.delete(t.youtubeSubscription)
					.where(
						sql`${t.youtubeSubscription.youtubeChannelId} = ${source} AND ${t.youtubeSubscription.guildChannelId} = ${targetChannel}`
					)
					.returning()
					.get();
				if (deleted) {
					queueMicrotask(() => checkSubs(ctx, source).catch(console.error));
					return youtubeChannelInteraction(
						interaction,
						source,
						null,
						targetChannel,
						lang[guildData.language ?? 'en']
					);
				}
				db.insert(t.youtubeChannel)
					.values({
						id: source
					})
					.onConflictDoUpdate({
						target: t.youtubeChannel.id,
						set: {
							updatedAt: new Date()
						}
					})
					.run();
				db.insert(t.guildChannel)
					.values({
						id: targetChannel,
						guildId: guildId
					})
					.onConflictDoUpdate({
						target: t.guildChannel.id,
						set: {
							updatedAt: new Date()
						}
					})
					.run();
				const sub = db
					.insert(t.youtubeSubscription)
					.values({
						guildChannelId: targetChannel,
						youtubeChannelId: source
					})
					.returning()
					.get();
				queueMicrotask(() => checkSubs(ctx, source).catch(console.error));
				await youtubeChannelInteraction(
					interaction,
					source,
					sub,
					targetChannel,
					lang[guildData.language ?? 'en']
				);
			})
			.catch((err) => {
				if (err === true) return;
				console.error(err);
			});
	},
	async list(ctx, interaction) {
		const db = ctx.get(kDb);
		const [dcCh, page] = interaction.customId.substring('list:'.length).split(':');
		return getGuildId(ctx, interaction)
			.then(async (guildId) => {
				const guildData = getGuildData(db, guildId);
				const l = lang[guildData.language ?? 'en'];
				await listSubscriptionInteraction(ctx, interaction, l, dcCh, parseInt(page));
			})
			.catch((err) => {
				if (err === true) return;
				console.error(err);
			});
	}
};

async function syncCommands(guild: Guild) {
	return guild.commands
		.set(guildCommands)
		.then(async () => {
			console.log('[bot]', 'Application commands synced.', { guild: guild.id });
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

	client.on('clientReady', async () => {
		if (client.user) {
			client.user.setActivity({
				name: 'use /help',
				type: ActivityType.Custom
			});
			console.log('[bot]', `Logged in as ${client.user.tag}`);
		}

		if (client.application) {
			const url = new URL(
				'https://discord.com/oauth2/authorize?scope=bot+applications.commands&permissions=149504'
			);
			url.searchParams.append('client_id', client.application.id);
			console.log('[bot]', `Invite link: ${url}`);
			console.log('[bot]', 'Syncing global commands');
			await client.application.commands.set(guildCommands);

			for (const guild of client.guilds.cache.values()) {
				upsertGuild(db, guild);
			}
		} else {
			console.log('[bot]', 'Could not get application id, invite link will not be generated');

			client.on('guildCreate', syncCommands);

			for (const guild of client.guilds.cache.values()) {
				await syncCommands(guild);
				upsertGuild(db, guild);
			}
		}
	});

	client.on('guildCreate', (guild) => {
		console.log('[bot]', 'Joined guild.', {
			id: guild.id,
			name: guild.name
		});
		upsertGuild(db, guild);
	});
	client.on('guildDelete', async (guild) => {
		console.log('[bot]', 'Leaved guild.', {
			id: guild.id,
			name: guild.name
		});
		const chs = db
			.select({
				id: t.youtubeChannel.id
			})
			.from(t.youtubeChannel)
			.innerJoin(t.youtubeSubscription, sql`${t.youtubeChannel.id} = ${t.youtubeSubscription.youtubeChannelId}`)
			.innerJoin(t.guildChannel, sql`${t.youtubeSubscription.guildChannelId} = ${t.guildChannel.id}`)
			.where(sql`${t.guildChannel.guildId} = ${guild.id}`)
			.all();
		db.delete(t.guild)
			.where(sql`${t.guild.id} = ${guild.id}`)
			.run();
		for (const ch of chs) {
			await checkSubs(ctx, ch.id).catch(console.error);
		}
	});

	client.on('interactionCreate', async (interaction) => {
		if (interaction.isChatInputCommand()) {
			await commandHandlers[interaction.commandName]?.(ctx, interaction);
			return;
		}
		if (interaction.isStringSelectMenu()) {
			if (interaction.customId === 'config:lang') {
				await selectMenuHandlers.configLang(ctx, interaction);
				return;
			}
			if (interaction.customId.startsWith('config:category')) {
				await selectMenuHandlers.configCategory(ctx, interaction);
				return;
			}
			if (interaction.customId.startsWith('notify:')) {
				await selectMenuHandlers.notify(ctx, interaction);
				return;
			}
			if (interaction.customId.startsWith('template:')) {
				await selectMenuHandlers.template(ctx, interaction);
				return;
			}
			if (interaction.customId.startsWith('list:')) {
				await selectMenuHandlers.list(ctx, interaction);
				return;
			}
		} else if (interaction.isModalSubmit()) {
			if (interaction.customId.startsWith('config:')) {
				await modalHandlers.config(ctx, interaction);
				return;
			}
			if (interaction.customId.startsWith('template:')) {
				await modalHandlers.template(ctx, interaction);
				return;
			}
		} else if (interaction.isButton()) {
			if (interaction.customId.startsWith('subscribe:')) {
				await buttonHandlers.subscribe(ctx, interaction);
				return;
			}
		}
	});

	return client.login(options.token);
}
