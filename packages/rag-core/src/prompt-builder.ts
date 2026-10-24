import type { RetrievedChunk } from './citation-validator.js';

export interface PromptMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export const DEFAULT_SYSTEM_PROMPT = `You are an expert codebase intelligence assistant. Your mission is to provide accurate, concise, evidence-backed answers explaining the provided repository source code.

STRICT OPERATIONAL RULES:
1. GROUNDING RULE: You must base your answer EXCLUSIVELY on the code snippets provided inside the <code_context> block. Do not extrapolate, guess, or invent code, files, or functions that are not explicitly present.
2. CITATION RULE: For every substantive claim, function explanation, or file reference, you MUST cite the exact source file and line range using the format: [filepath#Lstart-Lend] (e.g., [src/auth/jwt.ts#L10-L25]).
3. ABSTENTION RULE: If the provided <code_context> does not contain sufficient evidence to completely and accurately answer the user's question, you MUST explicitly abstain by stating:
   "I cannot answer this question based on the provided codebase context because [brief reason]."
4. CODE RELATIONSHIPS: When code chunks include relation attributes (e.g. 'Called by...', 'Imports...'), use these architectural connections to trace cross-file execution flows.
5. CONCISENESS & VOICE CLARITY: Be direct, structured, and avoid conversational fluff. Focus directly on the code architecture and functionality.`;

export class PromptBuilder {
  private systemPrompt: string;
  private maxTokens: number;

  constructor(systemPrompt = DEFAULT_SYSTEM_PROMPT, maxTokens = 4000) {
    this.systemPrompt = systemPrompt;
    this.maxTokens = maxTokens;
  }

  buildPrompt(
    question: string,
    chunks: RetrievedChunk[],
    commitSha?: string
  ): {
    messages: PromptMessage[];
    includedChunks: RetrievedChunk[];
  } {
    const includedChunks: RetrievedChunk[] = [];
    let accumulatedTokens = 0;

    for (const chunk of chunks) {
      const estimatedTokens = Math.round(chunk.content.length / 4);
      if (accumulatedTokens + estimatedTokens > this.maxTokens && includedChunks.length > 0) {
        break;
      }
      includedChunks.push(chunk);
      accumulatedTokens += estimatedTokens;
    }

    let codeContextXml = '<code_context>\n';
    if (includedChunks.length === 0) {
      codeContextXml += '  <!-- No relevant code chunks found -->\n';
    } else {
      for (const chunk of includedChunks) {
        const relationAttr = chunk.relationshipDescription ? ` relation="${chunk.relationshipDescription}"` : '';
        codeContextXml += `  <code_chunk file="${chunk.filePath}" lines="${chunk.startLine}-${chunk.endLine}"${relationAttr}>\n`;
        codeContextXml += chunk.content;
        codeContextXml += '\n  </code_chunk>\n';
      }
    }
    codeContextXml += '</code_context>';

    const commitInfo = commitSha ? ` (Commit: ${commitSha})` : '';
    const userPrompt = `Codebase Context${commitInfo}:\n\n${codeContextXml}\n\nUser Question: ${question}\n\nProvide a grounded response with exact citations formatted as [filepath#Lstart-Lend].`;

    return {
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      includedChunks,
    };
  }
}
