CREATE TABLE `Guild` (
	`id` text PRIMARY KEY NOT NULL,
	`language` text,
	`publishText` text,
	`scheduleText` text,
	`rescheduleText` text,
	`upcomingText` text,
	`liveText` text,
	`createdAt` integer DEFAULT (CURRENT_TIMESTAMP),
	`updatedAt` integer
);
--> statement-breakpoint
CREATE TABLE `GuildChannel` (
	`id` text PRIMARY KEY NOT NULL,
	`guildId` text NOT NULL,
	`publishText` text,
	`scheduleText` text,
	`rescheduleText` text,
	`upcomingText` text,
	`liveText` text,
	`createdAt` integer DEFAULT (CURRENT_TIMESTAMP),
	`updatedAt` integer,
	FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `YoutubeChannel` (
	`id` text PRIMARY KEY NOT NULL,
	`webhookId` text NOT NULL,
	`webhookSecret` text,
	`webhookExpiresAt` integer,
	`createdAt` integer DEFAULT (CURRENT_TIMESTAMP),
	`updatedAt` integer
);
--> statement-breakpoint
CREATE TABLE `YoutubeSubscription` (
	`youtubeChannelId` text NOT NULL,
	`guildChannelId` text NOT NULL,
	`notifyPublish` numeric DEFAULT 'true' NOT NULL,
	`notifySchedule` numeric DEFAULT 'true' NOT NULL,
	`notifyReschedule` numeric DEFAULT 'true' NOT NULL,
	`notifyUpcoming` numeric DEFAULT 'true' NOT NULL,
	`notifyLive` numeric DEFAULT 'true' NOT NULL,
	`publishText` text,
	`scheduleText` text,
	`rescheduleText` text,
	`upcomingText` text,
	`liveText` text,
	`createdAt` integer DEFAULT (CURRENT_TIMESTAMP),
	`updatedAt` integer,
	PRIMARY KEY(`guildChannelId`, `youtubeChannelId`),
	FOREIGN KEY (`youtubeChannelId`) REFERENCES `YoutubeChannel`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`guildChannelId`) REFERENCES `GuildChannel`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `YoutubeVideo` (
	`id` text PRIMARY KEY NOT NULL,
	`channelId` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`scheduledAt` integer,
	`livedAt` integer,
	`deletedAt` integer,
	`publishNotifiedAt` integer,
	`scheduleNotifiedAt` integer,
	`rescheduleNotifiedAt` integer,
	`upcomingNotifiedAt` integer,
	`liveNotifiedAt` integer,
	`createdAt` integer DEFAULT (CURRENT_TIMESTAMP),
	`updatedAt` integer,
	FOREIGN KEY (`channelId`) REFERENCES `YoutubeChannel`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `YoutubeChannel_webhookId_key` ON `YoutubeChannel` (`webhookId`);