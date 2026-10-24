'use client';

import React from 'react';
import { FileCode } from 'lucide-react';

interface CitationBadgeProps {
  filePath: string;
  startLine: number;
  endLine: number;
  onClick?: (filePath: string, startLine: number, endLine: number) => void;
}

export function CitationBadge({ filePath, startLine, endLine, onClick }: CitationBadgeProps) {
  const lineLabel = startLine === endLine ? `L${startLine}` : `L${startLine}-${endLine}`;
  const fileName = filePath.split('/').pop() || filePath;

  return (
    <button
      onClick={() => onClick?.(filePath, startLine, endLine)}
      className="inline-flex items-center gap-1 px-2 py-0.5 mx-1 my-0.5 text-xs font-mono rounded bg-blue-950/80 hover:bg-blue-900 border border-blue-600/50 text-blue-300 transition-colors cursor-pointer group"
      title={`${filePath} (${lineLabel})`}
    >
      <FileCode className="w-3 h-3 text-blue-400 group-hover:text-blue-200" />
      <span className="font-semibold">{fileName}</span>
      <span className="text-blue-400/80">#{lineLabel}</span>
    </button>
  );
}
