ARG BUN_VERSION

FROM oven/bun:${BUN_VERSION}-alpine AS builder

COPY . /home/bun/app

WORKDIR /home/bun/app

RUN bun install --ignore-scripts --no-progress && bun build/index.ts

FROM oven/bun:${BUN_VERSION}-alpine

COPY --from=builder /home/bun/app/dist /home/bun/app

WORKDIR /home/bun/app

CMD ["bun", "index.js"]
