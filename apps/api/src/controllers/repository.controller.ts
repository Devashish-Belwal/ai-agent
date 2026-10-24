import type { Request, Response } from 'express';
import { prisma } from '@workspace/database';
import { RegisterRepositorySchema } from '@workspace/protocol';
import { enqueueRepositoryIngestion } from '../services/ingestion-queue.js';

export class RepositoryController {
  static async register(req: Request, res: Response) {
    try {
      const parsed = RegisterRepositorySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { url, defaultBranch } = parsed.data;
      const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
      if (!match) {
        return res.status(400).json({ error: 'Invalid GitHub URL' });
      }

      const owner = match[1];
      const name = match[2].replace(/\.git$/, '');

      let repo = await prisma.repository.findUnique({ where: { url } });

      if (!repo) {
        repo = await prisma.repository.create({
          data: {
            url,
            owner,
            name,
            defaultBranch,
            status: 'PENDING',
          },
        });
      }

      const job = await enqueueRepositoryIngestion(repo.id, repo.url, defaultBranch);

      return res.status(201).json({
        repository: {
          ...repo,
          totalSizeBytes: Number(repo.totalSizeBytes),
        },
        job,
      });
    } catch (err: any) {
      console.error('Failed to register repository:', err);
      return res.status(500).json({ error: err.message || 'Internal server error' });
    }
  }

  static async list(_req: Request, res: Response) {
    try {
      const repos = await prisma.repository.findMany({
        orderBy: { updatedAt: 'desc' },
      });

      return res.json({
        repositories: repos.map((r) => ({
          ...r,
          totalSizeBytes: Number(r.totalSizeBytes),
        })),
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getById(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const repo = await prisma.repository.findUnique({
        where: { id },
        include: {
          ingestionJobs: {
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
      });

      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      return res.json({
        repository: {
          ...repo,
          totalSizeBytes: Number(repo.totalSizeBytes),
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }

  static async getFile(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const filePath = req.query.path as string;

      if (!filePath) {
        return res.status(400).json({ error: 'File path required' });
      }

      const cleanPath = filePath.replace(/^[./\\]+/, '');

      // 1. Try exact match in indexed files
      let file = await prisma.indexedFile.findFirst({
        where: {
          repositoryId: id,
          filePath,
        },
      });

      // 2. Try endsWith match (e.g. 'matchmaking.ts' -> 'apps/web/src/actions/matchmaking.ts')
      if (!file) {
        file = await prisma.indexedFile.findFirst({
          where: {
            repositoryId: id,
            filePath: { endsWith: cleanPath },
          },
        });
      }

      // 3. Try contains match
      if (!file) {
        file = await prisma.indexedFile.findFirst({
          where: {
            repositoryId: id,
            filePath: { contains: cleanPath },
          },
        });
      }

      const targetPath = file ? file.filePath : cleanPath;

      // Retrieve chunks for this file
      let chunks = await prisma.codeChunk.findMany({
        where: { repositoryId: id, filePath: targetPath },
        orderBy: { startLine: 'asc' },
      });

      if (chunks.length === 0) {
        // Fallback: search chunks by contains if targetPath was not exact
        chunks = await prisma.codeChunk.findMany({
          where: {
            repositoryId: id,
            filePath: { contains: cleanPath },
          },
          orderBy: { startLine: 'asc' },
        });
      }

      if (chunks.length === 0 && !file) {
        return res.status(404).json({ error: `File not found: ${filePath}` });
      }

      const fullContent = chunks.length > 0
        ? chunks.map((c) => c.content).join('\n')
        : '// No content chunks available for this file.';

      const language = file?.language || chunks[0]?.language || 'typescript';
      const actualPath = file?.filePath || chunks[0]?.filePath || filePath;

      return res.json({
        filePath: actualPath,
        content: fullContent,
        language,
        lineCount: file?.lineCount || chunks.length * 50,
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
