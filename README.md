# Discord Youtube Notification Bot v2

A bot to receive notification from youtube when there is any update. Notification received via
[Google Pubsubhubbub hub](https://pubsubhubbub.appspot.com/), live-streaming details are fetched from YouTube Data API v3. All operations can be done by application command.

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

## Requirements

1. [Bun](https://github.com/oven-sh/bun)
2. A way to allow public access to http server for receiving webhook. ex cloudflare tunnel (recommended) or ngrok

## Docker Compose

```yaml
# docker-compose.yml

# In cloudflare tunnel configuration, forward request to `http://app`

x-discord-token: &dcToken 'PUT YOUR PUT YOUR TOKEN HERE'
x-cloudflared-token: &cfToken 'PUT YOUR CLOUDFLARED TOKEN HERE'
x-websub-origin: &origin 'THE PUBLIC ORIGIN FOR HTTP SERVER TO RECEIVE WEBHOOK'
x-google-api-token: &gapiToken 'PUT YOUR GOOGLE API KEY HERE'

x-logging: &logging
    driver: 'json-file'
    options:
        max-file: 5
        max-size: 10m

services:
    app:
        image: eslym/discord-youtube-bot
        command: bun index.ts
        user: '1000:1000'
        working_dir: /home/bun/app
        restart: always
        volumes:
            - db:/database
        environment:
            DATABASE_URL: /database/db.sqlite
            DISCORD_TOKEN: *dcToken
            WEBSUB_ORIGIN: *origin
            GOOGLE_API_TOKEN: *gapiToken
        logging: *logging
    tunnel:
        container_name: cloudflared
        image: cloudflare/cloudflared:latest
        command: tunnel --no-autoupdate run
        restart: always
        logging: *logging

volumes:
    db: {}
```
