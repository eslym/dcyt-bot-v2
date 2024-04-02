import type { PrismaClient } from '@prisma/client';
import type { Client } from 'discord.js';
import { ctxKey } from './ctx';
import type { Server } from 'bun';

export const kClient = ctxKey<Client>();
export const kDb = ctxKey<PrismaClient>();
export const kServer = ctxKey<Server>();
