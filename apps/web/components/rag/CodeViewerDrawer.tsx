'use client';

import React, { useEffect, useState, useRef } from 'react';
import { X, Copy, Check, ExternalLink } from 'lucide-react';
import { fetchFileContent } from '../../lib/api-client';

interface CodeViewerDrawerProps {
  repositoryId: string;
  filePath: string | null;
  startLine: number;
  endLine: number;
  onClose: () => void;
}

export function CodeViewerDrawer({
  repositoryId,
  filePath,
  startLine,
  endLine,
  onClose,
}: CodeViewerDrawerProps) {
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const highlightRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!filePath || !repositoryId) return;

    let active = true;
    setLoading(true);

    fetchFileContent(repositoryId, filePath)
      .then((res) => {
        if (active) {
          setContent(res.content || '');
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setContent(`// Failed to load file: ${err.message}`);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [repositoryId, filePath]);

  useEffect(() => {
    if (highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [content, startLine]);

  if (!filePath) return null;

  const lines = content.split('\n');

  const copyCode = () => {
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-[600px] lg:w-[720px] bg-[#0d1117] border-l border-slate-800 shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-[#161b22]">
        <div className="flex items-center gap-2 overflow-hidden">
          <span className="font-mono text-xs text-blue-400 font-semibold truncate">
            {filePath}
          </span>
          <span className="text-xs px-2 py-0.5 rounded bg-blue-950 text-blue-300 font-mono">
            L{startLine}-{endLine}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={copyCode}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition"
            title="Copy entire file"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Code Viewer Body */}
      <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-5">
        {loading ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            Loading file source...
          </div>
        ) : (
          <div className="min-w-max">
            {lines.map((lineText, idx) => {
              const lineNum = idx + 1;
              const isHighlighted = lineNum >= startLine && lineNum <= endLine;
              const isFirstHighlighted = lineNum === startLine;

              return (
                <div
                  key={lineNum}
                  ref={isFirstHighlighted ? highlightRef : undefined}
                  className={`flex items-start group ${
                    isHighlighted ? 'bg-amber-950/40 border-l-2 border-amber-400' : 'hover:bg-slate-800/40'
                  }`}
                >
                  <span
                    className={`w-12 select-none text-right pr-4 shrink-0 font-mono ${
                      isHighlighted ? 'text-amber-400 font-bold' : 'text-slate-600'
                    }`}
                  >
                    {lineNum}
                  </span>
                  <pre className="text-slate-300 overflow-visible whitespace-pre font-mono">
                    {lineText || ' '}
                  </pre>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
