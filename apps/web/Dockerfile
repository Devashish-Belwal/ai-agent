FROM oven/bun:1.3.14-slim AS builder

WORKDIR /app

COPY package.json turbo.json ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY apps/web/package.json apps/web/package.json

RUN bun install

COPY packages packages
COPY apps/web apps/web

ARG NEXT_PUBLIC_API_URL=https://api.dabelwal.online
ARG NEXT_PUBLIC_LIVEKIT_URL=wss://livekit.dabelwal.online
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_LIVEKIT_URL=$NEXT_PUBLIC_LIVEKIT_URL

RUN cd apps/web && bun run build

FROM oven/bun:1.3.14-slim AS runner

WORKDIR /app

COPY --from=builder /app /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

EXPOSE 3000

CMD ["bun", "run", "--cwd", "apps/web", "start"]
