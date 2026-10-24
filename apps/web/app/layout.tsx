import type { Metadata } from 'next';
import Link from 'next/link';
import { Cpu, Github } from 'lucide-react';
import './globals.css';
import '@livekit/components-styles';

export const metadata: Metadata = {
  title: 'Agentic Intelligence | AI Voice Agent & Codebase RAG',
  description: 'Self-hosted AI Voice Agent with GitHub repository RAG and exact line citations.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
        <header className="border-b border-slate-800 bg-[#0e1320]/80 backdrop-blur sticky top-0 z-40">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform">
                <Cpu className="w-4 h-4" />
              </div>
              <span className="font-bold text-base tracking-tight text-white group-hover:text-blue-400 transition-colors">
                Agentic<span className="text-blue-500 font-normal">.Intelligence</span>
              </span>
            </Link>

            <div className="flex items-center gap-4 text-xs font-medium">
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-950/60 border border-emerald-800/80 text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LiveKit SFU Active
              </span>

              <a
                href="https://github.com"
                target="_blank"
                rel="noreferrer"
                className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
              >
                <Github className="w-4 h-4" />
              </a>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col">{children}</main>
      </body>
    </html>
  );
}
