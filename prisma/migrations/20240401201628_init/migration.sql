-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "language" TEXT,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME
);

-- CreateTable
CREATE TABLE "GuildChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "guildId" TEXT NOT NULL,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    CONSTRAINT "GuildChannel_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "YoutubeChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhookId" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
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
    "id" BIGINT NOT NULL PRIMARY KEY,
    "youtubeChannelId" TEXT NOT NULL,
    "guildChannelId" TEXT NOT NULL,
    "notifyPublish" BOOLEAN NOT NULL,
    "notifySchedule" BOOLEAN NOT NULL,
    "notifyReschedule" BOOLEAN NOT NULL,
    "notifyUpcoming" BOOLEAN NOT NULL,
    "notifyLive" BOOLEAN NOT NULL,
    "publishText" TEXT,
    "scheduleText" TEXT,
    "rescheduleText" TEXT,
    "upcomingText" TEXT,
    "liveText" TEXT,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    CONSTRAINT "YoutubeSubscription_youtubeChannelId_fkey" FOREIGN KEY ("youtubeChannelId") REFERENCES "YoutubeChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "YoutubeSubscription_guildChannelId_fkey" FOREIGN KEY ("guildChannelId") REFERENCES "GuildChannel" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "YoutubeChannel_webhookId_key" ON "YoutubeChannel"("webhookId");
