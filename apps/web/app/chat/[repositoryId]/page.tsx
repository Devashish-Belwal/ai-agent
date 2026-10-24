'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Mic, GitBranch, FileCode, Sparkles } from 'lucide-react';
import { fetchRepository } from '../../../lib/api-client';
import { ChatView } from '../../../components/rag/ChatView';
import { CodeViewerDrawer } from '../../../components/rag/CodeViewerDrawer';
import { VoiceAgentModal } from '../../../components/voice/VoiceAgentModal';

export default function RepositoryWorkspacePage({ params }: { params: { repositoryId: string } }) {
  const { repositoryId } = params;
  const [repository, setRepository] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Drawer state
  const [drawerCitation, setDrawerCitation] = useState<{
    filePath: string;
    startLine: number;
    endLine: number;
  } | null>(null);

  // LiveKit Voice Modal state
  const [voiceOpen, setVoiceOpen] = useState(false);

  useEffect(() => {
    fetchRepository(repositoryId)
      .then((res) => {
        setRepository(res.repository);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [repositoryId]);

  const handleOpenCitation = useCallback((filePath: string, startLine: number, endLine: number) => {
    setDrawerCitation({ filePath, startLine, endLine });
  }, []);

  const handleVoiceCitation = useCallback((filePath: string, startLine: number, endLine: number) => {
    setDrawerCitation({ filePath, startLine, endLine });
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-[#090d16]">
      {/* Workspace Top Bar */}
      <div className="h-12 border-b border-slate-800 bg-[#0d121f] px-6 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-slate-100">
              {repository ? `${repository.owner} / ${repository.name}` : 'Loading repository...'}
            </span>
            {repository && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                <GitBranch className="w-3 h-3 text-slate-500" />
                <span>{repository.defaultBranch}</span>
              </div>
            )}
          </div>
        </div>

        {/* LiveKit Voice Assistant Launch Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setVoiceOpen(true)}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold shadow-md shadow-blue-500/20 transition-all hover:scale-105"
          >
            <Mic className="w-3.5 h-3.5 text-white animate-pulse" />
            <span>Talk to Voice Agent</span>
            <Sparkles className="w-3 h-3 text-amber-300" />
          </button>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative">
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          <ChatView repositoryId={repositoryId} onOpenCitation={handleOpenCitation} />
        </div>

        {/* Code Viewer Drawer */}
        {drawerCitation && (
          <CodeViewerDrawer
            repositoryId={repositoryId}
            filePath={drawerCitation.filePath}
            startLine={drawerCitation.startLine}
            endLine={drawerCitation.endLine}
            onClose={() => setDrawerCitation(null)}
          />
        )}
      </div>

      {/* LiveKit Voice Assistant Modal */}
      <VoiceAgentModal
        repositoryId={repositoryId}
        repoName={repository ? `${repository.owner}/${repository.name}` : ''}
        isOpen={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onCitationReceived={handleVoiceCitation}
      />
    </div>
  );
}
