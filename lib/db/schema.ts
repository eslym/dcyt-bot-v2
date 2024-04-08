import { sqliteTable, text, numeric, uniqueIndex, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const guild = sqliteTable('Guild', {
    id: text('id').primaryKey().notNull(),
    language: text('language'),
    publishText: text('publishText'),
    scheduleText: text('scheduleText'),
    rescheduleText: text('rescheduleText'),
    upcomingText: text('upcomingText'),
    liveText: text('liveText'),
    createdAt: numeric('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: numeric('updatedAt')
});

export const guildChannel = sqliteTable('GuildChannel', {
    id: text('id').primaryKey().notNull(),
    guildId: text('guildId')
        .notNull()
        .references(() => guild.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    publishText: text('publishText'),
    scheduleText: text('scheduleText'),
    rescheduleText: text('rescheduleText'),
    upcomingText: text('upcomingText'),
    liveText: text('liveText'),
    createdAt: numeric('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: numeric('updatedAt')
});

export const youtubeChannel = sqliteTable(
    'YoutubeChannel',
    {
        id: text('id').primaryKey().notNull(),
        webhookId: text('webhookId').notNull(),
        webhookSecret: text('webhookSecret'),
        webhookExpiresAt: numeric('webhookExpiresAt'),
        createdAt: numeric('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
        updatedAt: numeric('updatedAt')
    },
    (table) => {
        return {
            webhookIdKey: uniqueIndex('YoutubeChannel_webhookId_key').on(table.webhookId)
        };
    }
);

export const youtubeVideo = sqliteTable('YoutubeVideo', {
    id: text('id').primaryKey().notNull(),
    channelId: text('channelId')
        .notNull()
        .references(() => youtubeChannel.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    scheduledAt: numeric('scheduledAt'),
    livedAt: numeric('livedAt'),
    deletedAt: numeric('deletedAt'),
    publishNotifiedAt: numeric('publishNotifiedAt'),
    scheduleNotifiedAt: numeric('scheduleNotifiedAt'),
    rescheduleNotifiedAt: numeric('rescheduleNotifiedAt'),
    upcomingNotifiedAt: numeric('upcomingNotifiedAt'),
    liveNotifiedAt: numeric('liveNotifiedAt'),
    createdAt: numeric('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: numeric('updatedAt')
});

export const youtubeSubscription = sqliteTable(
    'YoutubeSubscription',
    {
        youtubeChannelId: text('youtubeChannelId')
            .notNull()
            .references(() => youtubeChannel.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        guildChannelId: text('guildChannelId')
            .notNull()
            .references(() => guildChannel.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
        notifyPublish: numeric('notifyPublish').default('true').notNull(),
        notifySchedule: numeric('notifySchedule').default('true').notNull(),
        notifyReschedule: numeric('notifyReschedule').default('true').notNull(),
        notifyUpcoming: numeric('notifyUpcoming').default('true').notNull(),
        notifyLive: numeric('notifyLive').default('true').notNull(),
        publishText: text('publishText'),
        scheduleText: text('scheduleText'),
        rescheduleText: text('rescheduleText'),
        upcomingText: text('upcomingText'),
        liveText: text('liveText'),
        createdAt: numeric('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
        updatedAt: numeric('updatedAt')
    },
    (table) => {
        return {
            pk0: primaryKey({
                columns: [table.guildChannelId, table.youtubeChannelId],
                name: 'YoutubeSubscription_guildChannelId_youtubeChannelId_pk'
            })
        };
    }
);
