import type { Client } from 'discord.js';
import { ctxKey } from './ctx';
import type { Server } from 'bun';
import type { StartOptions } from './options';
import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { DataFetcher } from './youtube/types';
import { youtube_v3 } from '@googleapis/youtube';

export const kClient = ctxKey<Client<true>>();
export const kDb = ctxKey<BunSQLiteDatabase<typeof import('./db/schema')>>();
export const kServer = ctxKey<Server>();
export const kOptions = ctxKey<StartOptions>();
export const kYoutube = ctxKey<youtube_v3.Youtube>();
export const kFetcher = ctxKey<DataFetcher>();
