export const VideoType = {
	VIDEO: 'VIDEO',
	LIVE: 'LIVE',
	PLAYLIST: 'PLAYLIST'
} as const;
export type VideoType = (typeof VideoType)[keyof typeof VideoType];

export const NotificationType = {
	PUBLISH: 'PUBLISH',
	SCHEDULE: 'SCHEDULE',
	RESCHEDULE: 'RESCHEDULE',
	UPCOMING: 'UPCOMING',
	LIVE: 'LIVE'
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
