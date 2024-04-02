export const VideoType = {
	VIDEO: 'video',
	LIVE: 'live',
	PLAYLIST: 'playlist'
} as const;
export type VideoType = (typeof VideoType)[keyof typeof VideoType];

export const NotificationType = {
	PUBLISH: 'publish',
	SCHEDULE: 'schedule',
	RESCHEDULE: 'reschedule',
	UPCOMING: 'upcoming',
	LIVE: 'live'
} as const;
export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
