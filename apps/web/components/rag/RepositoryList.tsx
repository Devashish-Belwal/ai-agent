'use client';

import React from 'react';
import Link from 'next/link';
import { GitBranch, FileCode, Database, ArrowRight, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

interface Repository {
  id: string;
  url: string;
  owner: string;
  name: string;
  defaultBranch: string;
  status: 'PENDING' | 'INDEXING' | 'READY' | 'ERROR';
  fileCount: number;
  chunkCount: number;
  updatedAt: string;
}

interface RepositoryListProps {
  repositories: Repository[];
}

export function RepositoryList({ repositories }: RepositoryListProps) {
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
                      : 'bg-rose-950/60 border-rose-800/80 text-rose-300'
                  }`}
                >
                  {isReady && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                  {isIndexing && <Loader2 className="w-3 h-3 animate-spin text-amber-400" />}
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

            <div className="pt-5 mt-5 border-t border-slate-800/60 flex items-center justify-between">
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
              ) : (
                <span className="text-xs text-slate-500 italic">Processing...</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
