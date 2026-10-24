import { PrismaClient } from '@prisma/client';
import postgres from 'postgres';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  sqlClient: postgres.Sql | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export function getDatabaseClient(): postgres.Sql {
  if (!globalForPrisma.sqlClient) {
    const url = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/agentic';
    globalForPrisma.sqlClient = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return globalForPrisma.sqlClient;
}

export { PrismaClient };
