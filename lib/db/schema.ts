import { sqliteTable, text, numeric, uniqueIndex, primaryKey, integer } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const guild = sqliteTable('Guild', {
    id: text('id').primaryKey().notNull(),
    language: text('language'),
    publishText: text('publishText'),
    scheduleText: text('scheduleText'),
    rescheduleText: text('rescheduleText'),
    upcomingText: text('upcomingText'),
    liveText: text('liveText'),
    createdAt: integer('createdAt', { mode: 'timestamp' }).default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
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
    createdAt: integer('createdAt', { mode: 'timestamp' }).default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
});

export const youtubeChannel = sqliteTable(
    'YoutubeChannel',
    {
        id: text('id').primaryKey().notNull(),
        webhookId: text('webhookId').notNull(),
        webhookSecret: text('webhookSecret'),
        webhookExpiresAt: integer('webhookExpiresAt', { mode: 'timestamp' }),
        createdAt: integer('createdAt', { mode: 'timestamp' }).default(sql`(CURRENT_TIMESTAMP)`),
        updatedAt: integer('updatedAt', { mode: 'timestamp' })
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
    scheduledAt: integer('scheduledAt', { mode: 'timestamp' }),
    livedAt: integer('livedAt', { mode: 'timestamp' }),
    deletedAt: integer('deletedAt', { mode: 'timestamp' }),
    publishNotifiedAt: integer('publishNotifiedAt', { mode: 'timestamp' }),
    scheduleNotifiedAt: integer('scheduleNotifiedAt', { mode: 'timestamp' }),
    rescheduleNotifiedAt: integer('rescheduleNotifiedAt', { mode: 'timestamp' }),
    upcomingNotifiedAt: integer('upcomingNotifiedAt', { mode: 'timestamp' }),
    liveNotifiedAt: integer('liveNotifiedAt', { mode: 'timestamp' }),
    createdAt: integer('createdAt', { mode: 'timestamp' }).default(sql`(CURRENT_TIMESTAMP)`),
    updatedAt: integer('updatedAt', { mode: 'timestamp' })
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
        createdAt: integer('createdAt', { mode: 'timestamp' }).default(sql`(CURRENT_TIMESTAMP)`),
        updatedAt: integer('updatedAt', { mode: 'timestamp' })
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
