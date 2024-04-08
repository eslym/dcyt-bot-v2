import type { InferSelectModel } from 'drizzle-orm';
import * as schema from './schema';

export type YoutubeVideo = InferSelectModel<typeof schema.youtubeVideo>;
export type YoutubeChannel = InferSelectModel<typeof schema.youtubeChannel>;
export type Guild = InferSelectModel<typeof schema.guild>;
export type GuildChannel = InferSelectModel<typeof schema.guildChannel>;
export type YoutubeSubscription = InferSelectModel<typeof schema.youtubeSubscription>;
