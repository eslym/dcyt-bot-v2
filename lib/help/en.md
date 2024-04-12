# Youtube Notification Bot

This bot sends a notification to a discord channel when a new video is uploaded to a youtube channel.

## Commands

> ### /config `[channel]`
> Configure the global settings for the current discord server.
> - **channel**: (optional) Configure a channel wide global settings when specified.

> ### /inspect `<channel>` `[to]`
> Inspect a youtube channel.
> - **channel**: The youtube channel to inspect, could be youtube URL or handle.
> - **to**: (optional) Specify the channel to send the notification to.

> ### /list `[channel]`
> List the subscribed youtube channels in this channel.
> - **channel**: (optional) List the subscribed youtube channels in the specified channel.

> ### /help
> Show this help message.

## Templates

The notification text uses mustache for templating, there are few available variable to use.
- `{{title}}`: The title of the video.
- `{{{url}}}`: The link to the video (must be included in text), use `{{{` and `}}}` to avoid url being escaped.
- `{{type}}`: The type of video, for diffrenciate live streaming and premiere.
- `{{channel}}`: The YouTube channel name.
- `{{timestamp}}`: The timestamp of schedule, available when there is a schedule. this is designed to use with [discord timestamp format](<https://discord.com/developers/docs/reference#message-formatting-timestamp-styles>), ex: `<t:{{timestamp}}:R>`.

[_Bot Source Code_](<https://github.com/eslym/dcyt-bot-v2>)