'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles } from 'lucide-react';
import { CitationBadge } from './CitationBadge';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Array<{ filePath: string; startLine: number; endLine: number; verified?: boolean }>;
}

interface ChatViewProps {
  repositoryId: string;
  onOpenCitation: (filePath: string, startLine: number, endLine: number) => void;
}

export function ChatView({ repositoryId, onOpenCitation }: ChatViewProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content:
        '👋 Welcome! Ask me anything about this repository codebase. I will answer using verified semantic citations and code graph intelligence.',
    },
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isStreaming]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userPrompt = input.trim();
    setInput('');

    const userMsgId = `user-${Date.now()}`;
    const assistantMsgId = `assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { id: userMsgId, role: 'user', content: userPrompt },
      { id: assistantMsgId, role: 'assistant', content: '' },
    ]);
    setIsStreaming(true);

    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
      const response = await fetch(`${apiBase}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          repositoryId,
          question: userPrompt,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat request failed: HTTP ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      let citationsList: any[] = [];

      if (reader) {
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const event = JSON.parse(line.replace('data: ', ''));
                if (event.type === 'token') {
                  assistantText += event.token;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: assistantText } : m
                    )
                  );
                } else if (event.type === 'citations') {
                  citationsList = event.citations || [];
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId ? { ...m, citations: citationsList } : m
                    )
                  );
                }
              } catch {
                // Ignore malformed chunks
              }
            }
          }
        }
      }
    } catch (err: any) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, content: `⚠️ Error generating answer: ${err.message}` }
            : m
        )
      );
    } finally {
      setIsStreaming(false);
    }
  };

  // Render message text and replace [file#L1-L2] with interactive CitationBadge components
  const renderMessageContent = (msg: Message) => {
    const text = msg.content;
    const regex = /\[([a-zA-Z0-9_./\\-]+)#L?(\d+)(?:-L?(\d+))?\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(text.substring(lastIndex, match.index));
      }

      const filePath = match[1];
      const startLine = parseInt(match[2], 10);
      const endLine = match[3] ? parseInt(match[3], 10) : startLine;

      parts.push(
        <CitationBadge
          key={`${filePath}-${startLine}-${endLine}-${match.index}`}
          filePath={filePath}
          startLine={startLine}
          endLine={endLine}
          onClick={onOpenCitation}
        />
      );

      lastIndex = regex.lastIndex;
    }

    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex));
    }

    return (
      <div className="space-y-3">
        <div className="whitespace-pre-wrap leading-relaxed">{parts}</div>
        {msg.citations && msg.citations.length > 0 && (
          <div className="pt-2 border-t border-slate-800/80">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Referenced Citations:
            </span>
            <div className="flex flex-wrap gap-1">
              {msg.citations.map((c, i) => (
                <CitationBadge
                  key={i}
                  filePath={c.filePath}
                  startLine={c.startLine}
                  endLine={c.endLine}
                  onClick={onOpenCitation}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0a0e17]">
      {/* Messages list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex gap-3 max-w-3xl ${
              m.role === 'user' ? 'ml-auto flex-row-reverse' : ''
            }`}
          >
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                m.role === 'user' ? 'bg-blue-600' : 'bg-slate-800 border border-slate-700'
              }`}
            >
              {m.role === 'user' ? (
                <User className="w-4 h-4 text-white" />
              ) : (
                <Bot className="w-4 h-4 text-blue-400" />
              )}
            </div>

            <div
              className={`rounded-2xl px-4 py-3 text-sm shadow-sm ${
                m.role === 'user'
                  ? 'bg-blue-600 text-white rounded-tr-none'
                  : 'bg-[#151b28] border border-slate-800/80 text-slate-200 rounded-tl-none'
              }`}
            >
              {renderMessageContent(m)}
            </div>
          </div>
        ))}
        {isStreaming && (
          <div className="flex items-center gap-2 text-xs text-blue-400 font-mono animate-pulse pl-12">
            <Sparkles className="w-3.5 h-3.5" />
            Synthesizing grounded answer with line citations...
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input bar */}
      <form onSubmit={handleSend} className="p-4 border-t border-slate-800 bg-[#0d121c]">
        <div className="flex items-center gap-2 bg-[#131926] border border-slate-700/80 rounded-xl px-4 py-2 focus-within:border-blue-500 transition-colors">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about this repository codebase (e.g. How does auth work?)..."
            disabled={isStreaming}
            className="flex-1 bg-transparent text-sm text-slate-200 placeholder-slate-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="p-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:hover:bg-blue-600 text-white transition-colors"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
