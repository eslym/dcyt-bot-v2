FROM oven/bun:1.1.3-alpine AS builder

COPY . /home/bun/app

WORKDIR /home/bun/app

RUN bun install --no-progress && bun build/build.ts

FROM oven/bun:1.1.3-alpine

COPY --from=builder /home/bun/app/dist /home/bun/app

WORKDIR /home/bun/app

CMD ["bun", "index.js"]
