-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
CREATE TABLE `Guild` (
	`id` text PRIMARY KEY NOT NULL,
	`language` text,
	`publishText` text,
	`scheduleText` text,
	`rescheduleText` text,
	`upcomingText` text,
	`liveText` text,
	`createdAt` numeric DEFAULT (CURRENT_TIMESTAMP),
	`updatedAt` numeric
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
	`createdAt` numeric DEFAULT (CURRENT_TIMESTAMP),
	`updatedAt` numeric,
	FOREIGN KEY (`guildId`) REFERENCES `Guild`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `YoutubeChannel` (
	`id` text PRIMARY KEY NOT NULL,
	`webhookId` text NOT NULL,
	`webhookSecret` text,
	`webhookExpiresAt` numeric,
	`createdAt` numeric DEFAULT (CURRENT_TIMESTAMP),
	`updatedAt` numeric
);
--> statement-breakpoint
CREATE TABLE `YoutubeVideo` (
	`id` text PRIMARY KEY NOT NULL,
	`channelId` text NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`scheduledAt` numeric,
	`livedAt` numeric,
	`deletedAt` numeric,
	`publishNotifiedAt` numeric,
	`scheduleNotifiedAt` numeric,
	`rescheduleNotifiedAt` numeric,
	`upcomingNotifiedAt` numeric,
	`liveNotifiedAt` numeric,
	`createdAt` numeric DEFAULT (CURRENT_TIMESTAMP),
	`updatedAt` numeric,
	FOREIGN KEY (`channelId`) REFERENCES `YoutubeChannel`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `YoutubeSubscription` (
	`youtubeChannelId` text NOT NULL,
	`guildChannelId` text NOT NULL,
	`notifyPublish` numeric DEFAULT true NOT NULL,
	`notifySchedule` numeric DEFAULT true NOT NULL,
	`notifyReschedule` numeric DEFAULT true NOT NULL,
	`notifyUpcoming` numeric DEFAULT true NOT NULL,
	`notifyLive` numeric DEFAULT true NOT NULL,
	`publishText` text,
	`scheduleText` text,
	`rescheduleText` text,
	`upcomingText` text,
	`liveText` text,
	`createdAt` numeric DEFAULT (CURRENT_TIMESTAMP),
	`updatedAt` numeric,
	PRIMARY KEY(`guildChannelId`, `youtubeChannelId`),
	FOREIGN KEY (`guildChannelId`) REFERENCES `GuildChannel`(`id`) ON UPDATE cascade ON DELETE cascade,
	FOREIGN KEY (`youtubeChannelId`) REFERENCES `YoutubeChannel`(`id`) ON UPDATE cascade ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `YoutubeChannel_webhookId_key` ON `YoutubeChannel` (`webhookId`);
