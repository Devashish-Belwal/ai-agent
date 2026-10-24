import type { Request, Response } from 'express';
import { prisma } from '@workspace/database';
import {
  RetrievalService,
  GeminiEmbeddingProvider,
  OpenAIEmbeddingProvider,
  MockEmbeddingProvider,
} from '@workspace/rag-core';
import { environment } from '../config/environment.js';

export class RetrievalController {
  static async search(req: Request, res: Response) {
    try {
      const { repositoryId, query, topK = 5 } = req.body;
      if (!repositoryId || !query) {
        return res.status(400).json({ error: 'repositoryId and query are required' });
      }

      const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      const embedProvider = environment.GEMINI_API_KEY
        ? new GeminiEmbeddingProvider(environment.GEMINI_API_KEY)
        : environment.OPENAI_API_KEY
        ? new OpenAIEmbeddingProvider(environment.OPENAI_API_KEY)
        : new MockEmbeddingProvider(768);

      const retriever = new RetrievalService(embedProvider);
      const result = await retriever.retrieve({
        repositoryId,
        commitSha: repo.currentCommitSha || undefined,
        query,
        topK,
        includeGraphNeighbors: true,
      });

      return res.json({
        chunks: result.chunks,
        latencyMs: result.latencyMs,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async traceSymbol(req: Request, res: Response) {
    try {
      const { repositoryId, symbolName } = req.body;
      if (!repositoryId || !symbolName) {
        return res.status(400).json({ error: 'repositoryId and symbolName are required' });
      }

      const edges = await prisma.codeEdge.findMany({
        where: {
          repositoryId,
          symbolName: {
            contains: symbolName,
            mode: 'insensitive',
          },
        },
        take: 10,
      });

      return res.json({ edges });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async readFileRange(req: Request, res: Response) {
    try {
      const { repositoryId, filePath, startLine, endLine } = req.query;
      if (!repositoryId || !filePath) {
        return res.status(400).json({ error: 'repositoryId and filePath required' });
      }

      const start = parseInt(startLine as string, 10) || 1;
      const end = parseInt(endLine as string, 10) || (start + 50);

      let chunks = await prisma.codeChunk.findMany({
        where: {
          repositoryId: repositoryId as string,
          filePath: filePath as string,
        },
        orderBy: { startLine: 'asc' },
      });

      if (chunks.length === 0) {
        const cleanPath = (filePath as string).replace(/^[./\\]+/, '');
        chunks = await prisma.codeChunk.findMany({
          where: {
            repositoryId: repositoryId as string,
            filePath: { contains: cleanPath },
          },
          orderBy: { startLine: 'asc' },
        });
      }

      if (chunks.length === 0) {
        return res.status(404).json({ error: 'File chunks not found' });
      }

      const fullContent = chunks.map((c) => c.content).join('\n');
      const lines = fullContent.split('\n');
      const sliced = lines.slice(Math.max(0, start - 1), Math.min(lines.length, end)).join('\n');

      return res.json({
        filePath,
        startLine: start,
        endLine: end,
        content: sliced,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
