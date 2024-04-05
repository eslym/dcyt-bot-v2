import {
	SlashCommandBuilder,
	type Guild,
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
	type ModalMessageModalSubmitInteraction
} from 'discord.js';
import type { Context } from './ctx';
import { kClient, kDb, kOptions } from './symbols';
import { lang } from './lang';
import enHelp from './help/en.md';
import cnHelp from './help/zh-CN.md';
import twHelp from './help/zh-TW.md';
import { NotificationType } from './enum';
import Mustache from 'mustache';
import { cache } from './cache';
import {
	CrawlError,
	InvalidURLError,
	fetchProfile,
	type ProfileCrawlResult,
	getChannelData,
	FetchError
} from './crawl';
import type { PrismaClient, YoutubeSubscription } from '@prisma/client';
import { ucfirst } from './utils';
import { postWebsub } from './websub';

Mustache.escape = function escapeMarkdown(text) {
	const markdownSpecialChars = /([\\`*_\[\]\-~])/g;
	return text.replace(markdownSpecialChars, '\\$1');
};

function escapeDiscordMarkdown(text: string) {
	const markdownSpecialChars = /([\\`*_\[\]\-~<]|^[#>])/g;
	return text.replace(markdownSpecialChars, '\\$1');
}

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

const env = process.env;

async function checkSubs(ctx: Context, channel: string) {
	if (env.DEV_WEBSUB_DISABLED === 'true') return;
	const db = ctx.get(kDb);
	const opts = ctx.get(kOptions);
	const ch = await db.youtubeChannel.findUnique({
		where: { id: channel },
		include: {
			_count: {
				select: {
					Subscriptions: true
				}
			}
		}
	});
	if (!ch) return;
	if (ch._count.Subscriptions && !ch.webhookSecret) {
		const secret = Buffer.from(channel).toString('base64');
		await db.youtubeChannel.update({
			where: { id: channel },
			data: {
				webhookSecret: secret
			}
		});
		const callback = new URL(`./websub/${ch.webhookId}`, opts.websub);
		await postWebsub('subscribe', channel, secret, callback.toString());
		return;
	}
	if (!ch._count.Subscriptions && ch.webhookSecret) {
		const callback = new URL(`./websub/${ch.webhookId}`, opts.websub);
		await postWebsub('unsubscribe', channel, ch.webhookSecret, callback.toString());
	}
}

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
			ephemeral: true
		});
		throw true;
	}
	return guildId;
}

type MessageComponents = Exclude<BaseMessageOptions['components'], undefined>;

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
	videoData: ProfileCrawlResult,
	sub: YoutubeSubscription | null | undefined,
	targetChannel: string,
	l: (typeof lang)[string]
) {
	try {
		const rows = [
			new ActionRowBuilder<ButtonBuilder>().addComponents(
				new ButtonBuilder()
					.setCustomId(`subscribe:${videoData.metadata.externalId}:${targetChannel}`)
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
						.setCustomId(`notify:${videoData.metadata.externalId}:${targetChannel}`)
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
						.setCustomId(`template:${videoData.metadata.externalId}:${targetChannel}`)
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
		const embed = new EmbedBuilder()
			.setTitle(videoData.metadata.title)
			.setThumbnail(videoData.metadata.avatar.thumbnails[0].url)
			.setURL(videoData.metadata.channelUrl)
			.setColor('#00ff00');
		if (videoData.metadata.description) {
			embed.setDescription(escapeDiscordMarkdown(videoData.metadata.description));
		}
		await interaction.editReply({
			content: Mustache.render(l.HINT.CHANNEL, { channel: `<#${targetChannel}>` }),
			embeds: [embed],
			components: rows
		});
	} catch (err) {
		if (err instanceof InvalidURLError) {
			await interaction.editReply({
				embeds: [new EmbedBuilder().setTitle('Error').setDescription(l.ERROR.INVALID_URL).setColor('#ff0000')]
			});
			return;
		}
		if (err instanceof FetchError && err.status === 404) {
			await interaction.editReply({
				embeds: [new EmbedBuilder().setTitle('Error').setDescription(l.ERROR.NOT_FOUND).setColor('#ff0000')]
			});
			return;
		}
		await interaction.editReply({
			embeds: [new EmbedBuilder().setTitle('Error').setDescription(l.ERROR.UNKNOWN).setColor('#ff0000')]
		});
		throw err;
	}
}

async function listSubscriptionInteraction(
	db: PrismaClient,
	interaction: ChatInputCommandInteraction | ButtonInteraction,
	l: (typeof lang)[string],
	dcCh: string,
	page: number = 1
) {
	const total = await db.youtubeSubscription.count({
		where: {
			guildChannelId: dcCh
		}
	});
	if (interaction.isChatInputCommand()) {
		await interaction.deferReply({
			ephemeral: true
		});
	} else {
		await interaction.deferUpdate();
	}
	if (total === 0) {
		await interaction.editReply({
			content: Mustache.render(l.HINT.NO_SUBSCRIPTIONS, { channel: `<#${dcCh}>` })
		});
		return;
	}
	const subscriptions = await db.youtubeSubscription.findMany({
		where: {
			guildChannelId: dcCh
		},
		skip: (page - 1) * 5
	});
	const menu = new StringSelectMenuBuilder()
		.setCustomId(`list:${dcCh}:${page}`)
		.setPlaceholder(l.HINT.SELECT_CHANNEL)
		.setMinValues(1)
		.setMaxValues(1);

	for (const sub of subscriptions) {
		const chData = await getChannelData(`https://youtube.com/channel/${sub.youtubeChannelId}`);
		menu.addOptions({
			value: sub.youtubeChannelId,
			label: chData.metadata.title,
			description: chData.metadata.description.substring(0, 50)
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
		content: Mustache.render(l.HINT.CHANNEL, { channel: `<#${dcCh}>` }),
		components: subscriptions.length
			? [
					new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
					new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next)
				]
			: [new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next)]
	});
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
					await interaction.reply({
						components: configComponents(guildData.language ?? 'en'),
						ephemeral: true
					});
					return;
				}
				await interaction.reply({
					content: Mustache.render(l.HINT.SETTINGS_FOR, { channel: `<#${channel.id}>` }),
					components: configComponents(guildData.language ?? 'en', channel.id),
					ephemeral: true
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
				let source = interaction.options.getString('channel', true);
				await interaction.deferReply({
					ephemeral: true
				});
				const guildData = (await ctx.get(kDb).guild.findUnique({ where: { id: guildId } }))!;
				const l = lang[guildData.language ?? 'en'];
				const targetChannel = interaction.options.getString('to', false) ?? interaction.channelId;
				const result = await getChannelData(source);
				const sub = await ctx.get(kDb).youtubeSubscription.findUnique({
					where: {
						id: {
							guildChannelId: targetChannel,
							youtubeChannelId: result.metadata.externalId
						}
					}
				});
				await youtubeChannelInteraction(interaction, result, sub, targetChannel, l);
			})
			.catch(async (err) => {
				if (err === true) return;
				if (err instanceof CrawlError) {
					await interaction.editReply({
						embeds: [new EmbedBuilder().setTitle('Error').setDescription(err.message).setColor('#ff0000')]
					});
				}
				console.error(err);
			});
	},
	async list(ctx, interaction) {
		return getGuildId(ctx, interaction)
			.then(async (guildId) => {
				const ch = interaction.options.getChannel<ValidChannelTypes>('channel', false);
				const guildData = (await ctx.get(kDb).guild.findUnique({ where: { id: guildId } }))!;
				const l = lang[guildData.language ?? 'en'];
				await listSubscriptionInteraction(ctx.get(kDb), interaction, l, ch?.id ?? interaction.channelId);
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

const selectMenuHandlers: Record<string, (ctx: Context, interaction: StringSelectMenuInteraction) => Promise<unknown>> =
	{
		async configLang(ctx, interaction) {
			const db = ctx.get(kDb);
			return getGuildId(ctx, interaction)
				.then(async (guildId) => {
					const guildData = (await db.guild.findUnique({ where: { id: guildId } }))!;
					guildData.language = interaction.values[0];
					await db.guild.update({
						where: { id: guildId },
						data: { language: guildData.language }
					});
					await interaction.update({
						components: configComponents(guildData.language)
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
					const guildData = (await db.guild.findUnique({ where: { id: guildId } }))!;
					const category = interaction.values[0];
					const l = lang[guildData.language ?? 'en'];
					let template: string;
					let placeholder = (l.NOTIFICATION as any)[category];
					if (channelId) {
						const channelData = await db.guildChannel.findUnique({
							where: {
								id: channelId,
								guildId: guildId
							}
						});
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
					const guildData = (await db.guild.findUnique({ where: { id: guildId } }))!;
					const sub = await db.youtubeSubscription.findUnique({
						where: {
							id: {
								guildChannelId: targetChannel,
								youtubeChannelId: source
							}
						}
					});
					if (!sub) return;
					interaction.deferUpdate();
					const update: any = {};
					for (const category of Object.values(NotificationType)) {
						update[`notify${ucfirst(category)}`] = interaction.values.includes(category);
					}
					await db.youtubeSubscription.update({
						where: {
							id: {
								guildChannelId: targetChannel,
								youtubeChannelId: source
							}
						},
						data: update
					});
					const result = await cache.get(
						`https://youtube.com/channel/${source}`,
						() => fetchProfile(`https://youtube.com/channel/${source}`),
						600000
					);
					await youtubeChannelInteraction(interaction, result, sub, targetChannel, lang[guildData.language ?? 'en']);
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
					const guildData = (await db.guild.findUnique({ where: { id: guildId } }))!;
					const sub = await db.youtubeSubscription.findUnique({
						where: {
							id: {
								guildChannelId: targetChannel,
								youtubeChannelId: source
							}
						},
						include: {
							GuildChannel: true
						}
					});
					if (!sub) return;
					const category = interaction.values[0];
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
											(sub.GuildChannel as any)[`${category.toLowerCase()}Text`] ?? (l.NOTIFICATION as any)[category]
										)
										.setMinLength(0)
										.setMaxLength(1000)
										.setValue((sub as any)[`${category.toLowerCase()}Text`] ?? '')
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
					const guildData = (await ctx.get(kDb).guild.findUnique({ where: { id: guildId } }))!;
					const l = lang[guildData.language ?? 'en'];
					const sub = await db.youtubeSubscription.findUnique({
						where: {
							id: {
								guildChannelId: dcCh,
								youtubeChannelId: ytCh
							}
						}
					});
					await interaction.deferReply({
						ephemeral: true
					});
					const result = await cache.get(
						`https://youtube.com/channel/${ytCh}`,
						() => fetchProfile(`https://youtube.com/channel/${ytCh}`),
						600000
					);
					await youtubeChannelInteraction(interaction, result, sub, dcCh, l);
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
				const guildData = (await db.guild.findUnique({ where: { id: guildId } }))!;
				const value = interaction.fields.getTextInputValue('template') || null;
				if (channelId) {
					await db.guildChannel.upsert({
						where: {
							id: channelId,
							guildId: guildId
						},
						create: {
							id: channelId,
							guildId: guildId,
							[`${category.toLowerCase()}Text`]: value
						},
						update: {
							[`${category.toLowerCase()}Text`]: value
						}
					});
				} else {
					(guildData as any)[`${category.toLowerCase()}Text`] = value;
					await db.guild.update({
						where: { id: guildId },
						data: guildData
					});
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
				const guildData = (await db.guild.findUnique({ where: { id: guildId } }))!;
				const value = interaction.fields.getTextInputValue('template') || null;
				const sub = await db.youtubeSubscription.findUnique({
					where: {
						id: {
							guildChannelId: targetChannel,
							youtubeChannelId: source
						}
					}
				});
				if (!sub) return;
				await db.youtubeSubscription.update({
					where: {
						id: {
							guildChannelId: targetChannel,
							youtubeChannelId: source
						}
					},
					data: {
						[`${category.toLowerCase()}Text`]: value
					}
				});
				if (interaction.isFromMessage()) {
					interaction.deferUpdate();
					const result = await cache.get(
						`https://youtube.com/channel/${source}`,
						() => fetchProfile(`https://youtube.com/channel/${source}`),
						600000
					);
					await youtubeChannelInteraction(interaction, result, sub, targetChannel, lang[guildData.language ?? 'en']);
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
				const guildData = (await db.guild.findUnique({ where: { id: guildId } }))!;
				const [source, targetChannel] = interaction.customId.substring('subscribe:'.length).split(':');
				const result = await getChannelData(`https://youtube.com/channel/${source}`);
				const deleted = await db.youtubeSubscription.deleteMany({
					where: {
						guildChannelId: targetChannel,
						youtubeChannelId: result.metadata.externalId
					}
				});
				if (deleted.count) {
					queueMicrotask(() => checkSubs(ctx, source).catch(console.error));
					return youtubeChannelInteraction(interaction, result, null, targetChannel, lang[guildData.language ?? 'en']);
				}
				await db.youtubeChannel.upsert({
					where: {
						id: source
					},
					create: {
						id: source
					},
					update: {}
				});
				await db.guildChannel.upsert({
					where: {
						id: targetChannel,
						guildId: guildId
					},
					create: {
						id: targetChannel,
						guildId: guildId
					},
					update: {}
				});
				const sub = await db.youtubeSubscription.create({
					data: {
						guildChannelId: targetChannel,
						youtubeChannelId: result.metadata.externalId
					}
				});
				queueMicrotask(() => checkSubs(ctx, source).catch(console.error));
				await youtubeChannelInteraction(interaction, result, sub, targetChannel, lang[guildData.language ?? 'en']);
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
				const guildData = (await db.guild.findUnique({ where: { id: guildId } }))!;
				const l = lang[guildData.language ?? 'en'];
				await listSubscriptionInteraction(db, interaction, l, dcCh, parseInt(page));
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

	client.on('ready', async () => {
		if (client.user) {
			client.user.setActivity({
				name: 'use /help',
				type: ActivityType.Custom
			});
			console.log('[bot]', `Logged in as ${client.user.tag}`);
		}

		if (client.application) {
			const url = new URL('https://discord.com/oauth2/authorize?scope=bot+applications.commands&permissions=149504');
			url.searchParams.append('client_id', client.application.id);
			console.log('[bot]', `Invite link: ${url}`);
			console.log('[bot]', 'Syncing global commands');
			await client.application.commands.set(guildCommands);

			for (const guild of client.guilds.cache.values()) {
				await db.guild.upsert({
					where: { id: guild.id },
					create: { id: guild.id },
					update: {}
				});
			}
		} else {
			console.log('[bot]', 'Could not get application id, invite link will not be generated');

			client.on('guildCreate', syncCommands);

			for (const guild of client.guilds.cache.values()) {
				await syncCommands(guild);
				await db.guild.upsert({
					where: { id: guild.id },
					create: { id: guild.id },
					update: {}
				});
			}
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
