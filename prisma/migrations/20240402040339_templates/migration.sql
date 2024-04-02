-- AlterTable
ALTER TABLE "Guild" ADD COLUMN "liveText" TEXT;
ALTER TABLE "Guild" ADD COLUMN "publishText" TEXT;
ALTER TABLE "Guild" ADD COLUMN "rescheduleText" TEXT;
ALTER TABLE "Guild" ADD COLUMN "scheduleText" TEXT;
ALTER TABLE "Guild" ADD COLUMN "upcomingText" TEXT;

-- AlterTable
ALTER TABLE "GuildChannel" ADD COLUMN "liveText" TEXT;
ALTER TABLE "GuildChannel" ADD COLUMN "publishText" TEXT;
ALTER TABLE "GuildChannel" ADD COLUMN "rescheduleText" TEXT;
ALTER TABLE "GuildChannel" ADD COLUMN "scheduleText" TEXT;
ALTER TABLE "GuildChannel" ADD COLUMN "upcomingText" TEXT;
