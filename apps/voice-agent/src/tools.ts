import { llm } from '@livekit/agents';
import { z } from 'zod';

const API_BASE_URL = (process.env.API_URL || 'http://localhost:4000').replace(/\/+$/, '');

export function createRagTools(options: {
  repositoryId?: string;
  publishCitation?: (citation: { filePath: string; startLine: number; endLine: number; snippet?: string }) => void;
  publishActivity?: (activity: string) => void;
}) {
  return [
    llm.tool({
      name: 'searchCodebase',
      description: 'Search the repository codebase semantically for relevant code chunks and functions.',
      parameters: z.object({
        query: z.string().describe('The code search query or concept to find, e.g. "authentication JWT verification"'),
      }),
      execute: async ({ query }) => {
        try {
          if (!options.repositoryId) {
            return 'No repository selected for this voice session.';
          }

          options.publishActivity?.(`Searching codebase for "${query}"...`);

          const res = await fetch(`${API_BASE_URL}/api/v1/retrieval/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repositoryId: options.repositoryId,
              query,
              topK: 3,
            }),
          });

          if (!res.ok) {
            return `Failed to search codebase: HTTP ${res.status}`;
          }

          const data = (await res.json()) as { chunks: Array<{ filePath: string; startLine: number; endLine: number; content: string }> };
          if (!data.chunks || data.chunks.length === 0) {
            return 'No relevant code chunks found in repository.';
          }

          // Broadcast citation to web frontend code viewer drawer
          const topChunk = data.chunks[0];
          options.publishCitation?.({
            filePath: topChunk.filePath,
            startLine: topChunk.startLine,
            endLine: topChunk.endLine,
            snippet: topChunk.content.slice(0, 200),
          });

          return data.chunks
            .map(
              (c) =>
                `File: ${c.filePath} (lines ${c.startLine}-${c.endLine}):\n${c.content.slice(0, 300)}`
            )
            .join('\n---\n');
        } catch (err: any) {
          return `Error executing codebase search: ${err.message}`;
        }
      },
    }),

    llm.tool({
      name: 'explainSymbol',
      description: 'Trace symbol declarations, callers, and import relationships across the codebase.',
      parameters: z.object({
        symbolName: z.string().describe('The name of the function, class, or symbol, e.g. "AuthService"'),
      }),
      execute: async ({ symbolName }) => {
        try {
          if (!options.repositoryId) return 'No repository selected.';

          options.publishActivity?.(`Tracing symbol "${symbolName}"...`);

          const res = await fetch(`${API_BASE_URL}/api/v1/retrieval/symbol`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repositoryId: options.repositoryId,
              symbolName,
            }),
          });

          if (!res.ok) return `Failed to trace symbol: HTTP ${res.status}`;

          const data = (await res.json()) as { edges: Array<{ relationType: string; symbolName: string; sourceFile: string; targetFile: string }> };
          if (!data.edges || data.edges.length === 0) {
            return `No relationship edges found for symbol '${symbolName}'.`;
          }

          return data.edges
            .map((e) => `${e.sourceFile} -> ${e.relationType} '${e.symbolName}' in ${e.targetFile}`)
            .join('\n');
        } catch (err: any) {
          return `Error tracing symbol: ${err.message}`;
        }
      },
    }),

    llm.tool({
      name: 'readFileRange',
      description: 'Read the exact source code lines from a specific file.',
      parameters: z.object({
        filePath: z.string().describe('Relative file path in repository'),
        startLine: z.number().int().describe('Starting line number'),
        endLine: z.number().int().describe('Ending line number'),
      }),
      execute: async ({ filePath, startLine, endLine }) => {
        try {
          if (!options.repositoryId) return 'No repository selected.';

          const fileName = filePath.split('/').pop() || filePath;
          options.publishActivity?.(`Reading ${fileName} (lines ${startLine}-${endLine})...`);

          const res = await fetch(
            `${API_BASE_URL}/api/v1/retrieval/file-range?repositoryId=${options.repositoryId}&filePath=${encodeURIComponent(filePath)}&startLine=${startLine}&endLine=${endLine}`
          );

          if (!res.ok) return `Failed to read file: HTTP ${res.status}`;

          const data = (await res.json()) as { content: string };
          options.publishCitation?.({
            filePath,
            startLine,
            endLine,
          });

          return data.content || 'File range is empty.';
        } catch (err: any) {
          return `Error reading file: ${err.message}`;
        }
      },
    }),
  ];
}
