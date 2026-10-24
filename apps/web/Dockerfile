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

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["sh", "-c", "if [ -f server.js ]; then node server.js; else node apps/web/server.js; fi"]
