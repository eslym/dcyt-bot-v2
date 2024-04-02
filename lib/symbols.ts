import type { PrismaClient } from '@prisma/client';
import type { Client } from 'discord.js';
import { ctxKey } from './ctx';
import type { Server } from 'bun';
import type { StartOptions } from './schema';

export const kClient = ctxKey<Client>();
export const kDb = ctxKey<PrismaClient>();
export const kServer = ctxKey<Server>();
export const kOptions = ctxKey<StartOptions>();
