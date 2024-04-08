import type { Client } from 'discord.js';
import { ctxKey } from './ctx';
import type { Server } from 'bun';
import type { StartOptions } from './schema';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';

export const kClient = ctxKey<Client>();
export const kDb = ctxKey<BunSQLiteDatabase<typeof import('./db/schema')>>();
export const kServer = ctxKey<Server>();
export const kOptions = ctxKey<StartOptions>();
