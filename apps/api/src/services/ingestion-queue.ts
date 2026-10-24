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

export async function enqueueRepositoryIngestion(repositoryId: string, repoUrl: string, branch = 'main') {
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
        batchSize: 25,
        onProgress: async (processed, total) => {
          const pct = 50 + Math.round((processed / total) * 35);
          await prisma.ingestionJob.update({
            where: { id: ingestionJobId },
            data: { progressPercentage: pct },
          });
        },
      });

      // 4. Bulk Insert Chunks into PostgreSQL with pgvector
      const sql = getDatabaseClient();
      for (const ec of embeddedChunks) {
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
