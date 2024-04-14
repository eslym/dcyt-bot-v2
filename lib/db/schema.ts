import { sqliteTable, text, uniqueIndex, primaryKey, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';
import { createId } from '@paralleldrive/cuid2';

export const guild = sqliteTable('Guild', {
    id: text('id').primaryKey().notNull(),
    language: text('language'),
    publishText: text('publishText'),
    scheduleText: text('scheduleText'),
    rescheduleText: text('rescheduleText'),
    upcomingText: text('upcomingText'),
    liveText: text('liveText'),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).$onUpdate(() => sql`(CURRENT_TIMESTAMP)`)
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
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).$onUpdate(() => sql`(CURRENT_TIMESTAMP)`)
});

export const youtubeChannel = sqliteTable(
    'YoutubeChannel',
    {
        id: text('id').primaryKey().notNull(),
        webhookId: text('webhookId').$defaultFn(createId).notNull(),
        webhookSecret: text('webhookSecret'),
        webhookExpiresAt: integer('webhookExpiresAt', { mode: 'timestamp_ms' }),
        createdAt: integer('createdAt', { mode: 'timestamp_ms' }).default(sql`(CURRENT_TIMESTAMP)`),
        updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).$onUpdate(() => sql`(CURRENT_TIMESTAMP)`)
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
    scheduledAt: integer('scheduledAt', { mode: 'timestamp_ms' }),
    deletedAt: integer('deletedAt', { mode: 'timestamp_ms' }),
    publishNotifiedAt: integer('publishNotifiedAt', { mode: 'timestamp_ms' }),
    scheduleNotifiedAt: integer('scheduleNotifiedAt', { mode: 'timestamp_ms' }),
    rescheduleNotifiedAt: integer('rescheduleNotifiedAt', { mode: 'timestamp_ms' }),
    upcomingNotifiedAt: integer('upcomingNotifiedAt', { mode: 'timestamp_ms' }),
    liveNotifiedAt: integer('liveNotifiedAt', { mode: 'timestamp_ms' }),
    createdAt: integer('createdAt', { mode: 'timestamp_ms' }).default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).$onUpdate(() => sql`(CURRENT_TIMESTAMP)`)
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
        notifyPublish: integer('notifyPublish', { mode: 'boolean' }).default(true).notNull(),
        notifySchedule: integer('notifySchedule', { mode: 'boolean' }).default(true).notNull(),
        notifyReschedule: integer('notifyReschedule', { mode: 'boolean' }).default(true).notNull(),
        notifyUpcoming: integer('notifyUpcoming', { mode: 'boolean' }).default(true).notNull(),
        notifyLive: integer('notifyLive', { mode: 'boolean' }).default(true).notNull(),
        publishText: text('publishText'),
        scheduleText: text('scheduleText'),
        rescheduleText: text('rescheduleText'),
        upcomingText: text('upcomingText'),
        liveText: text('liveText'),
        createdAt: integer('createdAt', { mode: 'timestamp_ms' }).default(sql`(CURRENT_TIMESTAMP)`),
        updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).$onUpdate(() => sql`(CURRENT_TIMESTAMP)`)
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
