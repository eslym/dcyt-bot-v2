import type { Guild } from 'discord.js';
import type { ContextValue } from '../ctx';
import type { kDb } from '../symbols';
import * as schema from './schema';
import { sql } from 'drizzle-orm';

type DB = ContextValue<typeof kDb>;

export function upsertGuild(db: DB, guild: Guild) {
    return db
        .insert(schema.guild)
        .values({
            id: guild.id,
            updatedAt: new Date()
        })
        .onConflictDoUpdate({
            target: schema.guild.id,
            set: {
                updatedAt: new Date()
            }
        })
        .returning()
        .get();
}

export function getGuildData(db: DB, guildId: string) {
    return db
        .select()
        .from(schema.guild)
        .where(sql`${schema.guild.id} = ${guildId}`)
        .get()!;
}
