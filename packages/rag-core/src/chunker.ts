import crypto from 'node:crypto';
import type { ExtractedFile } from './git-service.js';

export interface CodeChunk {
  id: string;
  repositoryId: string;
  commitSha: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  content: string;
  contentHash: string;
  tokenCountEst: number;
}

export interface ChunkingOptions {
  targetChunkLines?: number;
  overlapLines?: number;
}

const DEFAULT_TARGET_LINES = 60;
const DEFAULT_OVERLAP_LINES = 12;

export function computeChunkHash(filePath: string, startLine: number, endLine: number, content: string): string {
  return crypto
    .createHash('sha256')
    .update(`${filePath}:${startLine}:${endLine}:${content}`)
    .digest('hex');
}

function isCodeBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return true;
  if (/^(export\s+)?(async\s+)?function\b/.test(trimmed)) return true;
  if (/^(export\s+)?(default\s+)?(class|interface|type|enum|struct)\b/.test(trimmed)) return true;
  if (/^(const|let|var)\s+[a-zA-Z0-9_$]+\s*=\s*(async\s*)?\([^)]*\)\s*=>/.test(trimmed)) return true;
  if (/^(def\s+|class\s+|fn\s+|func\s+|pub\s+fn\b)/.test(trimmed)) return true;
  if (trimmed === '}' || trimmed === '};') return true;
  return false;
}

export function chunkFile(
  file: ExtractedFile,
  repositoryId: string,
  commitSha: string,
  options?: ChunkingOptions
): CodeChunk[] {
  const rawContent = file.content;
  if (!rawContent || rawContent.trim() === '') {
    return [];
  }

  const targetLines = options?.targetChunkLines ?? DEFAULT_TARGET_LINES;
  const overlapLines = options?.overlapLines ?? DEFAULT_OVERLAP_LINES;

  const lines = rawContent.split('\n');
  const totalLines = lines.length;

  if (totalLines === 0) {
    return [];
  }

  if (totalLines <= targetLines) {
    const chunkContent = lines.join('\n');
    const startLine = 1;
    const endLine = totalLines;
    const contentHash = computeChunkHash(file.filePath, startLine, endLine, chunkContent);

    return [
      {
        id: crypto.randomUUID(),
        repositoryId,
        commitSha,
        filePath: file.filePath,
        language: file.language,
        startLine,
        endLine,
        content: chunkContent,
        contentHash,
        tokenCountEst: Math.round(chunkContent.length / 4),
      },
    ];
  }

  const chunks: CodeChunk[] = [];
  let currentStart = 0;

  while (currentStart < totalLines) {
    let idealEnd = Math.min(currentStart + targetLines, totalLines);

    if (idealEnd < totalLines) {
      let boundaryFound = -1;
      const searchEnd = Math.min(idealEnd + 8, totalLines);

      for (let i = idealEnd; i <= searchEnd; i++) {
        if (i < totalLines && isCodeBoundary(lines[i])) {
          boundaryFound = i;
          break;
        }
      }

      if (boundaryFound === -1) {
        const searchStart = Math.max(idealEnd - 8, currentStart + 10);
        for (let i = idealEnd - 1; i >= searchStart; i--) {
          if (isCodeBoundary(lines[i])) {
            boundaryFound = i;
            break;
          }
        }
      }

      if (boundaryFound !== -1) {
        idealEnd = boundaryFound;
      }
    }

    const chunkLines = lines.slice(currentStart, idealEnd);
    const chunkContent = chunkLines.join('\n');
    const startLine = currentStart + 1;
    const endLine = idealEnd;
    const contentHash = computeChunkHash(file.filePath, startLine, endLine, chunkContent);

    chunks.push({
      id: crypto.randomUUID(),
      repositoryId,
      commitSha,
      filePath: file.filePath,
      language: file.language,
      startLine,
      endLine,
      content: chunkContent,
      contentHash,
      tokenCountEst: Math.round(chunkContent.length / 4),
    });

    if (idealEnd >= totalLines) {
      break;
    }

    currentStart = Math.max(idealEnd - overlapLines, currentStart + 1);
  }

  return chunks;
}
