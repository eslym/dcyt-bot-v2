# discord-youtube-bot

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

This project was created using `bun init` in bun v1.0.36. [Bun](https://bun.sh) is a fast all-in-one JavaScript runtime.

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

x-logging: &logging
    driver: 'json-file'
    options:
        max-file: 5
        max-size: 10m

services:
    app:
        image: eslym/discord-youtube-bot
        build: .
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
        logging: *logging
    tunnel:
        container_name: cloudflared
        image: cloudflare/cloudflared:latest
        command: tunnel --no-autoupdate run
        restart: always
        networks:
            - cloudflared
        logging: *logging

volumes:
    db: {}
```
