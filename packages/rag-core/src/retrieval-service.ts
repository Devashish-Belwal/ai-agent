import { executeVectorSearch, executeLexicalSearch, executeGraphNeighborhoodTraversal } from '@workspace/database';
import type { EmbeddingProvider } from './embedding-provider.js';
import type { RetrievedChunk } from './citation-validator.js';

export interface RetrievalOptions {
  repositoryId: string;
  commitSha?: string;
  query: string;
  topK?: number;
  minSimilarity?: number;
  includeGraphNeighbors?: boolean;
  fastPath?: boolean;
}

export class RetrievalService {
  private embeddingProvider: EmbeddingProvider;

  constructor(embeddingProvider: EmbeddingProvider) {
    this.embeddingProvider = embeddingProvider;
  }

  async retrieve(options: RetrievalOptions): Promise<{ chunks: RetrievedChunk[]; latencyMs: number }> {
    const start = performance.now();
    const topK = options.topK ?? 8;

    // Fast-path: Check instantaneous PostgreSQL keyword/lexical search
    if (options.fastPath) {
      try {
        const lexicalRows = await executeLexicalSearch({
          repositoryId: options.repositoryId,
          commitSha: options.commitSha,
          query: options.query,
          limit: topK,
        });

        if (lexicalRows.length > 0) {
          const chunks: RetrievedChunk[] = lexicalRows.map((r) => ({
            chunkId: r.id,
            filePath: r.filePath,
            startLine: r.startLine,
            endLine: r.endLine,
            content: r.content,
            similarity: r.similarity,
          }));

          return {
            chunks,
            latencyMs: Math.round(performance.now() - start),
          };
        }
      } catch (err) {
        console.warn('Fast-path lexical search failed, falling back to vector search:', err);
      }
    }

    let queryEmbedding: number[] = [];

    try {
      const [embedding] = await this.embeddingProvider.embedBatch([options.query]);
      queryEmbedding = embedding || [];
    } catch (embedErr) {
      console.warn('Embedding generation error, falling back to lexical code search:', embedErr);
      queryEmbedding = new Array(768).fill(0);
    }

    const vectorResults = await executeVectorSearch({
      repositoryId: options.repositoryId,
      commitSha: options.commitSha,
      query: options.query,
      embedding: queryEmbedding,
      topK,
      minSimilarity: options.minSimilarity ?? 0.05,
    });

    const chunks: RetrievedChunk[] = vectorResults.map((r) => ({
      chunkId: r.id,
      filePath: r.filePath,
      startLine: r.startLine,
      endLine: r.endLine,
      content: r.content,
      similarity: r.similarity,
    }));

    if (options.includeGraphNeighbors && chunks.length > 0 && options.commitSha) {
      try {
        const seedIds = chunks.slice(0, 3).map((c) => c.chunkId);
        const neighbors = await executeGraphNeighborhoodTraversal({
          repositoryId: options.repositoryId,
          commitSha: options.commitSha,
          seedChunkIds: seedIds,
          maxDepth: 1,
          limit: 4,
        });

        for (const n of neighbors) {
          if (!chunks.some((c) => c.chunkId === n.chunkId)) {
            chunks.push({
              chunkId: n.chunkId,
              filePath: n.filePath,
              startLine: n.startLine,
              endLine: n.endLine,
              content: n.content,
              similarity: 0.5,
              relationshipType: n.relationType,
              relationshipDescription: `${n.relationType} ${n.symbolName} (${n.direction})`,
            });
          }
        }
      } catch {
        // If graph traversal fails or has no edges, continue with vector results
      }
    }

    return {
      chunks,
      latencyMs: Math.round(performance.now() - start),
    };
  }
}
