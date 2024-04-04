-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "language" TEXT,
    "publishText" TEXT,
    "scheduleText" TEXT,
    "rescheduleText" TEXT,
    "upcomingText" TEXT,
    "liveText" TEXT,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "GuildChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "publishText" TEXT,
    "scheduleText" TEXT,
    "rescheduleText" TEXT,
    "upcomingText" TEXT,
    "liveText" TEXT,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    CONSTRAINT "GuildChannel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "YoutubeChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhookId" TEXT NOT NULL,
    "webhookSecret" TEXT,
    "webhookExpiresAt" DATETIME,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "YoutubeVideo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "channelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scheduledAt" DATETIME,
    "livedAt" DATETIME,
    "deletedAt" DATETIME,
    "publishNotifiedAt" DATETIME,
    "scheduleNotifiedAt" DATETIME,
    "rescheduleNotifiedAt" DATETIME,
    "upcomingNotifiedAt" DATETIME,
    "liveNotifiedAt" DATETIME,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    CONSTRAINT "YoutubeVideo_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "YoutubeChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "YoutubeSubscription" (
    "youtubeChannelId" TEXT NOT NULL,
    "guildChannelId" TEXT NOT NULL,
    "notifyPublish" BOOLEAN NOT NULL DEFAULT true,
    "notifySchedule" BOOLEAN NOT NULL DEFAULT true,
    "notifyReschedule" BOOLEAN NOT NULL DEFAULT true,
    "notifyUpcoming" BOOLEAN NOT NULL DEFAULT true,
    "notifyLive" BOOLEAN NOT NULL DEFAULT true,
    "publishText" TEXT,
    "scheduleText" TEXT,
    "rescheduleText" TEXT,
    "upcomingText" TEXT,
    "liveText" TEXT,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,

    PRIMARY KEY ("youtubeChannelId", "guildChannelId"),
    CONSTRAINT "YoutubeSubscription_youtubeChannelId_fkey" FOREIGN KEY ("youtubeChannelId") REFERENCES "YoutubeChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "YoutubeSubscription_guildChannelId_fkey" FOREIGN KEY ("guildChannelId") REFERENCES "GuildChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeChannel_webhookId_key" ON "YoutubeChannel"("webhookId");
