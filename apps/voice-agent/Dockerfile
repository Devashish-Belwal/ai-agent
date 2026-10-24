FROM node:22-slim AS runner

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json turbo.json ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY apps/voice-agent/package.json apps/voice-agent/package.json

# Install dependencies using npm or bun
RUN npm install -g bun@1.3.14
RUN bun install

COPY packages packages
COPY apps/voice-agent apps/voice-agent

# Build voice agent TypeScript to dist/
RUN cd apps/voice-agent && bun run build

ENV NODE_ENV=production

CMD ["node", "apps/voice-agent/dist/index.js", "start"]
