import type { Context } from './ctx';
import { kClient, kDb, kFetcher, kOptions } from './symbols';
import cron from 'node-cron';
import { postWebsub, topicUrl } from './websub';
import { NotificationType, VideoType } from './enum';
import { determineNotificationType, publishNotification } from './utils';
import * as t from './db/schema';
import { count, sql } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { NotFoundError, type YoutubeVideoData } from './youtube/types';
import { fetchLiveID } from './youtube/crawler';

export function setupCron(ctx: Context) {
	const [client, db, opts, fetcher] = ctx.getAll(kClient, kDb, kOptions, kFetcher);

	cron.schedule('*/15 * * * *', async () => {
		const chs = db
			.select({
				id: t.youtubeChannel.id,
				webhookId: t.youtubeChannel.webhookId,
				webhookSecret: t.youtubeChannel.webhookSecret,
				webhookExpiresAt: t.youtubeChannel.webhookExpiresAt
			})
			.from(t.youtubeChannel)
			.where(
				sql`${t.youtubeChannel.webhookSecret} IS NOT NULL AND (${t.youtubeChannel.webhookExpiresAt} IS NULL OR ${t.youtubeChannel.webhookExpiresAt} <= ${Date.now() + 4 * 3600000})`
			)
			.all();
		if (!chs.length) return;
		for (const ch of chs) {
			ch.webhookSecret = randomBytes(24).toString('base64');
			db.update(t.youtubeChannel)
				.set({
					webhookSecret: ch.webhookSecret
				})
				.where(sql`${t.youtubeChannel.id} = ${ch.id}`)
				.run();
			const callback = new URL(`./websub/${ch.webhookId}`, opts.websub);
			const res = await postWebsub('subscribe', ch.id, ch.webhookSecret!, callback.toString());
			if (!res.ok) {
				console.error('[cron]', `Failed to subscribe to ${topicUrl(ch.id)}`, {
					status: res.status,
					body: await res.text()
				});
			}
		}
	});

	cron.schedule('*/15 * * * *', async () => {
		const chs = db
			.select({ id: t.youtubeChannel.id })
			.from(t.youtubeChannel)
			.where(sql`${t.youtubeChannel.webhookSecret} IS NOT NULL`)
			.all()
			.map((ch) => ch.id);

		while (chs.length) {
			const ids = chs.splice(0, 10);
			const videos = await Promise.allSettled(ids.map((id) => fetchLiveID(id)));
			for (const [i, video] of videos.entries()) {
				if (video.status === 'rejected') {
					console.error('[cron]', `Failed to fetch live ID for ${ids[i]}`, video.reason);
					continue;
				}
				if (!video.value) {
					continue;
				}
				const exists = db
					.select({ count: count(t.youtubeVideo.id) })
					.from(t.youtubeVideo)
					.where(sql`${t.youtubeVideo.id} = ${video.value}`)
					.get()!.count;
				if (exists) {
					continue;
				}
				const videoData = await fetcher.fetchVideoData(video.value);
				const notifyType =
					videoData.type === 'VIDEO'
						? NotificationType.PUBLISH
						: videoData.live?.livedAt
							? NotificationType.LIVE
							: NotificationType.SCHEDULE;
				db.insert(t.youtubeVideo)
					.values({
						id: videoData.id,
						channelId: videoData.channelId,
						title: videoData.title,
						type: videoData.type,
						scheduledAt: videoData.live?.scheduledAt,
						[`${notifyType.toLowerCase()}NotifiedAt`]: new Date()
					})
					.run();
				if ((!videoData.live?.livedAt && !videoData.live?.scheduledAt) || videoData.live?.endedAt) {
					return;
				}
				console.log('[cron]', 'Found live', { videoData, notifyType });
				publishNotification(ctx.get(kClient), db, videoData, notifyType);
			}
		}
	});

	cron.schedule('*/5 * * * *', async () => {
		const notLived = sql`${t.youtubeVideo.livedAt} IS NULL`;
		const notNotified = sql`${t.youtubeVideo.liveNotifiedAt} IS NULL`;
		const notDeleted = sql`${t.youtubeVideo.deletedAt} IS NULL`;
		const criteria = sql`${notLived} AND ${notNotified} AND ${notDeleted}`;
		const records = db
			.select()
			.from(t.youtubeVideo)
			.where(sql`${t.youtubeVideo.type} IN ${[VideoType.LIVE, VideoType.PREMIERE]} AND ${criteria}`)
			.all();
		if (!records.length) return;
		const videoDatas = new Map<string, YoutubeVideoData | Error>(
			await Promise.all(
				records.map((record) =>
					fetcher
						.fetchVideoData(record.id)
						.then((d) => [record.id, d] as const)
						.catch((err) => [record.id, err as Error] as const)
				)
			)
		);
		const channels = new Map();
		for (const videoRecord of records) {
			const videoData = videoDatas.get(videoRecord.id)!;
			if (videoData instanceof NotFoundError) {
				db.update(t.youtubeVideo)
					.set({
						deletedAt: new Date()
					})
					.where(sql`${t.youtubeVideo.id} = ${videoRecord.id}`)
					.run();
				continue;
			}
			if (videoData instanceof Error) {
				console.error('[cron]', `Failed to fetch video data for ${videoRecord.title}`, {
					id: videoRecord.id,
					error: videoData
				});
				continue;
			}
			const videoId = videoRecord.id;
			const notifyType = determineNotificationType(videoData, videoRecord);
			const update = {
				title: videoData.title,
				scheduledAt: videoData.live?.scheduledAt ?? null,
				livedAt: videoData.live?.livedAt ?? null
			};
			channels.set(videoData.channelId, videoData.channelName);
			if (!notifyType) {
				db.update(t.youtubeVideo)
					.set(update)
					.where(sql`${t.youtubeVideo.id} = ${videoId}`)
					.run();
				continue;
			}
			db.update(t.youtubeVideo)
				.set({
					...update,
					[`${notifyType.toLowerCase()}NotifiedAt`]: new Date()
				})
				.where(sql`${t.youtubeVideo.id} = ${videoId}`)
				.run();
			console.log('[cron]', 'Notification detected', { videoData, notifyType });
			await publishNotification(client, db, videoData, notifyType);
		}
	});
}
