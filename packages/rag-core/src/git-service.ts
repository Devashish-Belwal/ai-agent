import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface ExtractedFile {
  filePath: string;
  content: string;
  sizeBytes: number;
  lineCount: number;
  language: string;
}

export interface ExtractedRepository {
  commitSha: string;
  files: ExtractedFile[];
  totalBytes: number;
  fileCount: number;
}

export interface FetchOptions {
  repoUrl: string;
  commitSha?: string;
  branch?: string;
  maxFiles?: number;
  maxTotalBytes?: number;
  timeoutMs?: number;
  tempBaseDir?: string;
}

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.github',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  'coverage',
  'vendor',
  'target',
  '.turbo',
  '.cache',
]);

const IGNORED_FILES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'bun.lock',
  'Cargo.lock',
  'Gemfile.lock',
  'composer.lock',
]);

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.py': 'python',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.cs': 'csharp',
  '.sql': 'sql',
  '.json': 'json',
  '.md': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.html': 'html',
  '.css': 'css',
  '.sh': 'shell',
  '.bash': 'shell',
};

export const MAX_FILE_SIZE_BYTES = 500 * 1024;
export const DEFAULT_MAX_REPO_BYTES = 100 * 1024 * 1024;
export const DEFAULT_MAX_FILES = 2000;
export const DEFAULT_GIT_TIMEOUT_MS = 60000;

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_LANGUAGE_MAP[ext] || 'plaintext';
}

export function isTextFileSupported(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ext in EXTENSION_LANGUAGE_MAP;
}

export class GitService {
  static async resolveRemoteCommit(
    repoUrl: string,
    branch?: string,
    timeoutMs = 15000
  ): Promise<{ commitSha: string; resolvedBranch: string }> {
    const targetRef = branch ? branch.replace(/^refs\/heads\//, '') : 'HEAD';

    try {
      const { stdout } = await execFileAsync(
        'git',
        ['ls-remote', repoUrl, targetRef === 'HEAD' ? 'HEAD' : `refs/heads/${targetRef}`],
        { timeout: timeoutMs }
      );

      const lines = stdout.trim().split('\n');
      if (!lines[0] || !lines[0].trim()) {
        const { stdout: fallbackOut } = await execFileAsync(
          'git',
          ['ls-remote', repoUrl, 'HEAD'],
          { timeout: timeoutMs }
        );
        const fallbackSha = fallbackOut.trim().split(/\s+/)[0];
        if (!fallbackSha || !/^[0-9a-fA-F]{40}$/.test(fallbackSha)) {
          throw new Error(`Branch '${targetRef}' not found and HEAD commit could not be resolved.`);
        }
        return { commitSha: fallbackSha, resolvedBranch: 'HEAD' };
      }

      const commitSha = lines[0].trim().split(/\s+/)[0];
      if (!commitSha || !/^[0-9a-fA-F]{40}$/.test(commitSha)) {
        throw new Error(`Invalid commit SHA returned by git: ${lines[0]}`);
      }

      return { commitSha, resolvedBranch: targetRef };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`Git remote resolution timed out after ${timeoutMs}ms`);
      }
      throw err;
    }
  }

  static async fetchAndExtract(options: FetchOptions): Promise<ExtractedRepository> {
    const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;
    const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_REPO_BYTES;
    const timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;

    let commitSha = options.commitSha;
    if (!commitSha) {
      const resolved = await GitService.resolveRemoteCommit(options.repoUrl, options.branch, 15000);
      commitSha = resolved.commitSha;
    }

    const tempDir = await fs.promises.mkdtemp(path.join(options.tempBaseDir || os.tmpdir(), 'rag-repo-'));

    try {
      await execFileAsync('git', ['init', tempDir], { timeout: timeoutMs });
      await execFileAsync('git', ['-C', tempDir, 'remote', 'add', 'origin', options.repoUrl], { timeout: timeoutMs });
      
      const targetBranch = options.branch || 'main';
      await execFileAsync(
        'git',
        ['-C', tempDir, 'fetch', '--depth', '1', 'origin', targetBranch],
        { timeout: timeoutMs }
      );
      await execFileAsync('git', ['-C', tempDir, 'checkout', 'FETCH_HEAD'], { timeout: timeoutMs });

      const files: ExtractedFile[] = [];
      let totalBytes = 0;

      async function scanDirectory(currentDir: string, relativeDir: string) {
        const entries = await fs.promises.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);
          const relPath = path.join(relativeDir, entry.name).replace(/\\/g, '/');

          if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) {
              await scanDirectory(fullPath, relPath);
            }
          } else if (entry.isFile()) {
            if (IGNORED_FILES.has(entry.name) || !isTextFileSupported(relPath)) {
              continue;
            }

            const stat = await fs.promises.stat(fullPath);
            if (stat.size > MAX_FILE_SIZE_BYTES) {
              continue;
            }

            if (totalBytes + stat.size > maxTotalBytes || files.length >= maxFiles) {
              break;
            }

            try {
              const content = await fs.promises.readFile(fullPath, 'utf-8');
              const lineCount = content.split('\n').length;
              files.push({
                filePath: relPath,
                content,
                sizeBytes: stat.size,
                lineCount,
                language: detectLanguage(relPath),
              });
              totalBytes += stat.size;
            } catch {
              // Skip binary or unreadable files
            }
          }
        }
      }

      await scanDirectory(tempDir, '');

      return {
        commitSha,
        files,
        totalBytes,
        fileCount: files.length,
      };
    } finally {
      try {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
      } catch {
        // Ignored cleanup errors
      }
    }
  }
}
