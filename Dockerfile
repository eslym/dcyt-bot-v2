FROM oven/bun:1.1.12-alpine AS builder

COPY . /home/bun/app

WORKDIR /home/bun/app

RUN bun install --ignore-scripts --no-progress && bun build/index.ts

FROM oven/bun:1.1.12-distroless

COPY --from=builder /home/bun/app/dist /home/bun/app

WORKDIR /home/bun/app

CMD ["index.js"]
