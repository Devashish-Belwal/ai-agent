FROM oven/bun:1.3.14-slim AS builder

WORKDIR /app

# Copy root configurations
COPY package.json turbo.json ./
COPY packages/protocol/package.json packages/protocol/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/rag-core/package.json packages/rag-core/package.json
COPY packages/typescript-config/package.json packages/typescript-config/package.json
COPY apps/api/package.json apps/api/package.json

ENV DATABASE_URL="postgresql://postgres:postgres@localhost:5432/agentic"

RUN bun install

# Copy source code
COPY packages packages
COPY apps/api apps/api

# Generate Prisma Client
RUN cd packages/database && bunx prisma generate

FROM oven/bun:1.3.14-slim AS runner

WORKDIR /app

COPY --from=builder /app /app

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["bun", "run", "--cwd", "apps/api", "start"]
