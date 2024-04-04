-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_YoutubeChannel" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhookId" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "webhookExpiresAt" DATETIME,
    "webhookEnabled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME
);
INSERT INTO "new_YoutubeChannel" ("createdAt", "id", "updatedAt", "webhookExpiresAt", "webhookId", "webhookSecret") SELECT "createdAt", "id", "updatedAt", "webhookExpiresAt", "webhookId", "webhookSecret" FROM "YoutubeChannel";
DROP TABLE "YoutubeChannel";
ALTER TABLE "new_YoutubeChannel" RENAME TO "YoutubeChannel";
CREATE UNIQUE INDEX "YoutubeChannel_webhookId_key" ON "YoutubeChannel"("webhookId");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
