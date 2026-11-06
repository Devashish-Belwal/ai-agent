'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { GitBranch, FileCode, Database, ArrowRight, Loader2, CheckCircle2, AlertCircle, Square } from 'lucide-react';
import { stopRepositoryIndexing } from '../../lib/api-client';

interface Repository {
  id: string;
  url: string;
  owner: string;
  name: string;
  defaultBranch: string;
  status: 'PENDING' | 'INDEXING' | 'READY' | 'ERROR' | 'STOPPED';
  fileCount: number;
  chunkCount: number;
  updatedAt: string;
}

interface RepositoryListProps {
  repositories: Repository[];
  onRepoUpdated?: () => void;
}

export function RepositoryList({ repositories, onRepoUpdated }: RepositoryListProps) {
  const [stoppingMap, setStoppingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string>>({});

  const handleStop = async (repoId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      setStoppingMap((prev) => ({ ...prev, [repoId]: true }));
      setErrorMap((prev) => {
        const next = { ...prev };
        delete next[repoId];
        return next;
      });

      await stopRepositoryIndexing(repoId);
      onRepoUpdated?.();
    } catch (err: any) {
      setErrorMap((prev) => ({
        ...prev,
        [repoId]: err.message || 'Failed to stop indexing',
      }));
    } finally {
      setStoppingMap((prev) => ({ ...prev, [repoId]: false }));
    }
  };

  if (repositories.length === 0) {
    return (
      <div className="text-center py-16 px-4 border border-dashed border-slate-800 rounded-3xl bg-[#0d121f]">
        <Database className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <h3 className="text-base font-semibold text-slate-200">No repositories indexed yet</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-sm mx-auto">
          Click &quot;Index Repository&quot; above to clone a GitHub repo, extract AST chunks, and start querying with voice or chat.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
      {repositories.map((repo) => {
        const isReady = repo.status === 'READY';
        const isIndexing = repo.status === 'INDEXING' || repo.status === 'PENDING';
        const isStopped = repo.status === 'STOPPED';
        const isStopping = Boolean(stoppingMap[repo.id]);

        return (
          <div
            key={repo.id}
            className="flex flex-col justify-between p-5 rounded-2xl bg-[#111726] border border-slate-800/80 hover:border-slate-700 transition shadow-sm group"
          >
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-mono text-slate-400">{repo.owner}</span>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                    isReady
                      ? 'bg-emerald-950/60 border-emerald-800/80 text-emerald-300'
                      : isIndexing
                      ? 'bg-amber-950/60 border-amber-800/80 text-amber-300'
                      : isStopped
                      ? 'bg-slate-800/80 border-slate-700/80 text-slate-400'
                      : 'bg-rose-950/60 border-rose-800/80 text-rose-300'
                  }`}
                >
                  {isReady && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                  {isIndexing && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
                  {isStopped && <Square className="w-3 h-3 fill-current text-slate-400" />}
                  {repo.status === 'ERROR' && <AlertCircle className="w-3 h-3 text-rose-400" />}
                  {repo.status}
                </span>
              </div>

              <h4 className="text-base font-bold text-slate-100 group-hover:text-blue-400 transition-colors">
                {repo.name}
              </h4>

              <div className="flex items-center gap-4 mt-4 text-xs text-slate-400">
                <div className="flex items-center gap-1">
                  <GitBranch className="w-3.5 h-3.5 text-slate-500" />
                  <span>{repo.defaultBranch}</span>
                </div>
                <div className="flex items-center gap-1">
                  <FileCode className="w-3.5 h-3.5 text-slate-500" />
                  <span>{repo.fileCount} files</span>
                </div>
                <div className="flex items-center gap-1">
                  <Database className="w-3.5 h-3.5 text-slate-500" />
                  <span>{repo.chunkCount} chunks</span>
                </div>
              </div>
            </div>

            <div className="pt-5 mt-5 border-t border-slate-800/60">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-500">
                  Updated {new Date(repo.updatedAt).toLocaleDateString()}
                </span>

                {isReady ? (
                  <Link
                    href={`/chat/${repo.id}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600 border border-blue-500/40 text-blue-300 hover:text-white text-xs font-semibold transition"
                  >
                    <span>Open Intelligence</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                ) : isIndexing ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => handleStop(repo.id, e)}
                      disabled={isStopping}
                      aria-label={`Stop indexing ${repo.name}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 active:bg-rose-600/40 border border-rose-500/30 hover:border-rose-500/60 text-rose-300 hover:text-rose-200 text-xs font-semibold transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      title="Stop indexing this repository"
                    >
                      {isStopping ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-rose-300" />
                      ) : (
                        <Square className="w-3 h-3 fill-rose-400 text-rose-400" />
                      )}
                      <span>{isStopping ? 'Stopping...' : 'Stop'}</span>
                    </button>
                  </div>
                ) : isStopped ? (
                  <span className="text-xs text-slate-400 italic">Indexing stopped</span>
                ) : (
                  <span className="text-xs text-rose-400 italic">Indexing failed</span>
                )}
              </div>

              {errorMap[repo.id] && (
                <p className="text-[11px] text-rose-400 mt-2 text-right">
                  {errorMap[repo.id]}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
