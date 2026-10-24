'use client';

import React, { useState, useEffect } from 'react';
import { Plus, Sparkles, Database, Layers, Radio } from 'lucide-react';
import { fetchRepositories } from '../lib/api-client';
import { RepositoryList } from '../components/rag/RepositoryList';
import { RegisterModal } from '../components/rag/RegisterModal';

export default function HomePage() {
  const [repositories, setRepositories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const loadRepos = async () => {
    try {
      setLoading(true);
      const data = await fetchRepositories();
      setRepositories(data.repositories || []);
    } catch {
      // API might be spinning up
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepos();
    const interval = setInterval(loadRepos, 5000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 w-full flex-1 flex flex-col">
      {/* Hero Section */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-slate-800">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-950/80 border border-blue-600/40 text-blue-300 text-xs font-medium mb-3">
            <Radio className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
            LiveKit WebRTC Voice Agent + AST Codebase RAG
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Repository Intelligence & Voice Agent
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Query GitHub repositories through conversational voice or interactive chat. Grounded in AST code chunks, vector cosine embeddings, and verified line-level source code citations.
          </p>
        </div>

        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold shadow-lg shadow-blue-600/20 transition-all hover:scale-[1.02] shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Index Repository</span>
        </button>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-8">
        <div className="p-4 rounded-xl bg-[#0f1422] border border-slate-800/80 flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-blue-950/60 border border-blue-700/40 text-blue-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Gemini Multimodal Voice</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Real-time WebRTC audio via LiveKit SFU with sub-second voice interactions and tool calling.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0f1422] border border-slate-800/80 flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-purple-950/60 border border-purple-700/40 text-purple-400">
            <Database className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200">pgvector & HNSW Search</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Syntax-aware AST code chunking with 768-dim embeddings indexed natively in PostgreSQL.
            </p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-[#0f1422] border border-slate-800/80 flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-700/40 text-emerald-400">
            <Layers className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-200">Exact Line Citations</h4>
            <p className="text-xs text-slate-400 mt-0.5">
              Interactive drawer highlighting exact code line ranges in sync with both text and voice.
            </p>
          </div>
        </div>
      </div>

      {/* Repositories section */}
      <div className="flex-1">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-200">Indexed Repositories</h2>
          <span className="text-xs font-mono text-slate-500">
            {repositories.length} {repositories.length === 1 ? 'Repository' : 'Repositories'}
          </span>
        </div>

        <RepositoryList repositories={repositories} />
      </div>

      <RegisterModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={loadRepos}
      />
    </div>
  );
}
