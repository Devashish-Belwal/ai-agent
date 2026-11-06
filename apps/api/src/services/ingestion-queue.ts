import { Queue, Worker, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { prisma, getDatabaseClient } from '@workspace/database';
import {
  GitService,
  chunkFile,
  BatchEmbedder,
  GeminiEmbeddingProvider,
  OpenAIEmbeddingProvider,
  MockEmbeddingProvider,
  type CodeChunk,
} from '@workspace/rag-core';
import { environment } from '../config/environment.js';

const connection = new Redis(environment.REDIS_URL, {
  maxRetriesPerRequest: null,
});

export const INGESTION_QUEUE_NAME = 'repository-ingestion';
export const ingestionQueue = new Queue(INGESTION_QUEUE_NAME, { connection });

export class IngestionCancelledError extends Error {
  constructor(message = 'Indexing stopped by user') {
    super(message);
    this.name = 'IngestionCancelledError';
  }
}

export async function isIngestionCancelled(repositoryId: string): Promise<boolean> {
  const flag = await connection.get(`stop-indexing:${repositoryId}`);
  if (flag) return true;
  const repo = await prisma.repository.findUnique({
    where: { id: repositoryId },
    select: { status: true },
  });
  return repo?.status === 'STOPPED';
}

export async function stopRepositoryIngestion(repositoryId: string) {
  // 1. Set stop flag in Redis with a TTL of 1 hour
  await connection.set(`stop-indexing:${repositoryId}`, '1', 'EX', 3600);

  // 2. Remove waiting/delayed/paused BullMQ jobs for this repo
  try {
    const jobs = await ingestionQueue.getJobs(['waiting', 'delayed', 'paused', 'prioritized']);
    for (const job of jobs) {
      if (job.data?.repositoryId === repositoryId) {
        await job.remove();
      }
    }
  } catch (err) {
    console.warn(`Could not remove queued jobs for repo ${repositoryId}:`, err);
  }

  // 3. Mark active and queued ingestion jobs as CANCELLED
  await prisma.ingestionJob.updateMany({
    where: {
      repositoryId,
      status: { in: ['QUEUED', 'PROCESSING'] },
    },
    data: {
      status: 'CANCELLED',
      errorMessage: 'Indexing stopped by user',
      completedAt: new Date(),
    },
  });

  // 4. Update the repository status to STOPPED
  const updatedRepo = await prisma.repository.update({
    where: { id: repositoryId },
    data: {
      status: 'STOPPED',
    },
  });

  return updatedRepo;
}

export async function enqueueRepositoryIngestion(repositoryId: string, repoUrl: string, branch = 'main') {
  // Clear any existing stop flag in Redis
  await connection.del(`stop-indexing:${repositoryId}`);

  const job = await prisma.ingestionJob.create({
    data: {
      repositoryId,
      commitSha: 'PENDING',
      status: 'QUEUED',
      progressPercentage: 0,
    },
  });

  await prisma.repository.update({
    where: { id: repositoryId },
    data: { status: 'INDEXING' },
  });

  await ingestionQueue.add('index-repo', {
    ingestionJobId: job.id,
    repositoryId,
    repoUrl,
    branch,
  });

  return job;
}

// Ingestion Worker
export const ingestionWorker = new Worker(
  INGESTION_QUEUE_NAME,
  async (job: Job) => {
    const { ingestionJobId, repositoryId, repoUrl, branch } = job.data;

    try {
      if (await isIngestionCancelled(repositoryId)) {
        throw new IngestionCancelledError();
      }

      await prisma.ingestionJob.update({
        where: { id: ingestionJobId },
        data: {
          status: 'PROCESSING',
          startedAt: new Date(),
          progressPercentage: 10,
        },
      });

      // 1. Fetch & Extract Git files
      const extracted = await GitService.fetchAndExtract({
        repoUrl,
        branch,
      });

      if (await isIngestionCancelled(repositoryId)) {
        throw new IngestionCancelledError();
      }

      await prisma.repository.update({
        where: { id: repositoryId },
        data: {
          currentCommitSha: extracted.commitSha,
          fileCount: extracted.fileCount,
          totalSizeBytes: BigInt(extracted.totalBytes),
        },
      });

      await prisma.ingestionJob.update({
        where: { id: ingestionJobId },
        data: {
          commitSha: extracted.commitSha,
          progressPercentage: 30,
        },
      });

      // 2. Chunk Files
      const allChunks: CodeChunk[] = [];
      for (const file of extracted.files) {
        if (await isIngestionCancelled(repositoryId)) {
          throw new IngestionCancelledError();
        }

        // Save IndexedFile
        await prisma.indexedFile.upsert({
          where: {
            repositoryId_commitSha_filePath: {
              repositoryId,
              commitSha: extracted.commitSha,
              filePath: file.filePath,
            },
          },
          create: {
            repositoryId,
            commitSha: extracted.commitSha,
            filePath: file.filePath,
            language: file.language,
            sizeBytes: file.sizeBytes,
            lineCount: file.lineCount,
          },
          update: {
            sizeBytes: file.sizeBytes,
            lineCount: file.lineCount,
          },
        });

        const fileChunks = chunkFile(file, repositoryId, extracted.commitSha);
        allChunks.push(...fileChunks);
      }

      if (await isIngestionCancelled(repositoryId)) {
        throw new IngestionCancelledError();
      }

      await prisma.ingestionJob.update({
        where: { id: ingestionJobId },
        data: {
          filesProcessed: extracted.files.length,
          progressPercentage: 50,
        },
      });

      // 3. Generate Embeddings (Gemini -> OpenAI -> Mock fallback)
      const embedProvider = environment.GEMINI_API_KEY
        ? new GeminiEmbeddingProvider(environment.GEMINI_API_KEY)
        : environment.OPENAI_API_KEY
        ? new OpenAIEmbeddingProvider(environment.OPENAI_API_KEY)
        : new MockEmbeddingProvider(768);

      const embeddedChunks = await BatchEmbedder.embedChunks(allChunks, embedProvider, {
        batchSize: environment.GEMINI_API_KEY ? 5 : 25,
        shouldStop: () => isIngestionCancelled(repositoryId),
        onProgress: async (processed, total) => {
          if (await isIngestionCancelled(repositoryId)) {
            throw new IngestionCancelledError();
          }
          const pct = 50 + Math.round((processed / total) * 35);
          await prisma.ingestionJob.update({
            where: { id: ingestionJobId },
            data: { progressPercentage: pct },
          });
        },
      });

      if (await isIngestionCancelled(repositoryId)) {
        throw new IngestionCancelledError();
      }

      // 4. Bulk Insert Chunks into PostgreSQL with pgvector
      const sql = getDatabaseClient();
      for (let i = 0; i < embeddedChunks.length; i++) {
        if (i % 25 === 0 && (await isIngestionCancelled(repositoryId))) {
          throw new IngestionCancelledError();
        }
        const ec = embeddedChunks[i];
        const vectorStr = `[${ec.embedding.join(',')}]`;
        await sql`
          INSERT INTO code_chunks (
            id, repository_id, commit_sha, file_path, language,
            start_line, end_line, content, content_hash, embedding
          ) VALUES (
            ${ec.chunk.id}::uuid,
            ${repositoryId}::uuid,
            ${extracted.commitSha},
            ${ec.chunk.filePath},
            ${ec.chunk.language},
            ${ec.chunk.startLine},
            ${ec.chunk.endLine},
            ${ec.chunk.content},
            ${ec.chunk.contentHash},
            ${vectorStr}::vector
          )
          ON CONFLICT (id) DO NOTHING;
        `;
      }

      // 5. Extract Code Edges (imports & references)
      for (let i = 0; i < allChunks.length; i++) {
        if (i % 25 === 0 && (await isIngestionCancelled(repositoryId))) {
          throw new IngestionCancelledError();
        }
        const chunk = allChunks[i];
        const importMatches = chunk.content.matchAll(/from\s+['"]([^'"]+)['"]/g);
        for (const match of importMatches) {
          const targetRel = match[1];
          const matchedTarget = allChunks.find((c) => c.filePath.includes(targetRel.replace(/^\.\//, '')));
          if (matchedTarget) {
            await prisma.codeEdge.create({
              data: {
                repositoryId,
                commitSha: extracted.commitSha,
                sourceChunkId: chunk.id,
                targetChunkId: matchedTarget.id,
                relationType: 'IMPORTS',
                symbolName: targetRel,
                sourceFile: chunk.filePath,
                targetFile: matchedTarget.filePath,
              },
            });
          }
        }
      }

      if (await isIngestionCancelled(repositoryId)) {
        throw new IngestionCancelledError();
      }

      // 6. Complete Job
      await prisma.repository.update({
        where: { id: repositoryId },
        data: {
          chunkCount: allChunks.length,
          status: 'READY',
        },
      });

      await prisma.ingestionJob.update({
        where: { id: ingestionJobId },
        data: {
          status: 'COMPLETED',
          progressPercentage: 100,
          chunksCreated: allChunks.length,
          completedAt: new Date(),
        },
      });
    } catch (err: any) {
      const isCancelled =
        err instanceof IngestionCancelledError ||
        err?.message?.includes('stopped by user') ||
        (await isIngestionCancelled(repositoryId));

      if (isCancelled) {
        console.log(`Ingestion stopped by user for repo ${repositoryId}`);
        await prisma.repository.update({
          where: { id: repositoryId },
          data: { status: 'STOPPED' },
        });
        await prisma.ingestionJob.update({
          where: { id: ingestionJobId },
          data: {
            status: 'CANCELLED',
            errorMessage: 'Indexing stopped by user',
            completedAt: new Date(),
          },
        });
        return;
      }

      console.error(`Ingestion failed for repo ${repositoryId}:`, err);
      await prisma.repository.update({
        where: { id: repositoryId },
        data: { status: 'ERROR' },
      });
      await prisma.ingestionJob.update({
        where: { id: ingestionJobId },
        data: {
          status: 'FAILED',
          errorMessage: err.message || 'Unknown ingestion error',
          completedAt: new Date(),
        },
      });
    }
  },
  { connection }
);
