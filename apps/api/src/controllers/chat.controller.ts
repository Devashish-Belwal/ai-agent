import type { Request, Response } from 'express';
import { prisma } from '@workspace/database';
import { SendMessageSchema } from '@workspace/protocol';
import {
  RetrievalService,
  PromptBuilder,
  CitationValidator,
  GeminiEmbeddingProvider,
  OpenAIEmbeddingProvider,
  MockEmbeddingProvider,
} from '@workspace/rag-core';
import { GoogleGenAI } from '@google/genai';
import OpenAI from 'openai';
import { environment } from '../config/environment.js';

export class ChatController {
  static async sendMessage(req: Request, res: Response) {
    try {
      const parsed = SendMessageSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.issues[0].message });
      }

      const { repositoryId, question, conversationId, topK } = parsed.data;

      const repo = await prisma.repository.findUnique({ where: { id: repositoryId } });
      if (!repo) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      // Ensure conversation exists
      let convId = conversationId;
      if (!convId) {
        const conv = await prisma.chatConversation.create({
          data: {
            repositoryId,
            title: question.slice(0, 40) + '...',
          },
        });
        convId = conv.id;
      }

      // Save user message
      await prisma.chatMessage.create({
        data: {
          conversationId: convId,
          role: 'user',
          content: question,
        },
      });

      // 1. Retrieve relevant chunks using hybrid search
      const embedProvider = environment.GEMINI_API_KEY
        ? new GeminiEmbeddingProvider(environment.GEMINI_API_KEY)
        : environment.OPENAI_API_KEY
        ? new OpenAIEmbeddingProvider(environment.OPENAI_API_KEY)
        : new MockEmbeddingProvider(768);

      const retriever = new RetrievalService(embedProvider);
      const { chunks, latencyMs } = await retriever.retrieve({
        repositoryId,
        commitSha: repo.currentCommitSha || undefined,
        query: question,
        topK,
        includeGraphNeighbors: true,
      });

      // 2. Build Prompt
      const promptBuilder = new PromptBuilder();
      const { messages, includedChunks } = promptBuilder.buildPrompt(
        question,
        chunks,
        repo.currentCommitSha || undefined
      );

      // Check SSE request
      const isSse = req.headers.accept === 'text/event-stream';

      if (isSse) {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
          'X-Conversation-Id': convId,
        });

        const sendEvent = (event: any) => {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        };

        let fullAnswer = '';

        if (environment.GEMINI_API_KEY) {
          const ai = new GoogleGenAI({ apiKey: environment.GEMINI_API_KEY });
          const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.0-flash',
            contents: messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
          });

          for await (const chunk of responseStream) {
            const text = chunk.text || '';
            fullAnswer += text;
            sendEvent({ type: 'token', token: text });
          }
        } else if (environment.OPENAI_API_KEY) {
          const openai = new OpenAI({ apiKey: environment.OPENAI_API_KEY });
          const stream = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: messages.map((m) => ({
              role: m.role as 'system' | 'user' | 'assistant',
              content: m.content,
            })),
            stream: true,
          });

          for await (const chunk of stream) {
            const text = chunk.choices[0]?.delta?.content || '';
            fullAnswer += text;
            sendEvent({ type: 'token', token: text });
          }
        } else {
          // Fallback if no LLM API keys configured
          if (includedChunks.length === 0) {
            fullAnswer = `I cannot answer this question based on the provided codebase context because no relevant files or symbols were found for "${question}".`;
          } else {
            fullAnswer = `Based on the repository context:\n` +
              `The requested functionality is defined in [${includedChunks[0].filePath}#L${includedChunks[0].startLine}-L${includedChunks[0].endLine}].\n\n` +
              `Here is the relevant code snippet:\n\`\`\`\n${includedChunks[0].content.slice(0, 300)}\n\`\`\``;
          }
          for (const token of fullAnswer.split(' ')) {
            sendEvent({ type: 'token', token: token + ' ' });
            await new Promise((r) => setTimeout(r, 20));
          }
        }

        // Validate Citations against actual retrieved chunks
        const validatedCitations = CitationValidator.validate(fullAnswer, includedChunks);
        sendEvent({ type: 'citations', citations: validatedCitations });
        sendEvent({
          type: 'meta',
          meta: {
            latencyMs,
            retrievedChunksCount: includedChunks.length,
          },
        });
        sendEvent({ type: 'done' });

        // Save assistant message
        await prisma.chatMessage.create({
          data: {
            conversationId: convId,
            role: 'assistant',
            content: fullAnswer,
            citations: validatedCitations as any,
          },
        });

        return res.end();
      }

      // Non-SSE standard JSON response
      let fullAnswer = '';
      if (environment.GEMINI_API_KEY) {
        const ai = new GoogleGenAI({ apiKey: environment.GEMINI_API_KEY });
        const resp = await ai.models.generateContent({
          model: 'gemini-2.0-flash',
          contents: messages.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n'),
        });
        fullAnswer = resp.text || '';
      } else if (environment.OPENAI_API_KEY) {
        const openai = new OpenAI({ apiKey: environment.OPENAI_API_KEY });
        const resp = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: messages.map((m) => ({
            role: m.role as 'system' | 'user' | 'assistant',
            content: m.content,
          })),
        });
        fullAnswer = resp.choices[0]?.message?.content || '';
      } else {
        if (includedChunks.length === 0) {
          fullAnswer = `I cannot answer this question based on the provided codebase context because no relevant files or symbols were found for "${question}".`;
        } else {
          fullAnswer = `Based on the repository context:\n` +
            `The requested logic is in [${includedChunks[0].filePath}#L${includedChunks[0].startLine}-L${includedChunks[0].endLine}].`;
        }
      }

      const validatedCitations = CitationValidator.validate(fullAnswer, includedChunks);

      await prisma.chatMessage.create({
        data: {
          conversationId: convId,
          role: 'assistant',
          content: fullAnswer,
          citations: validatedCitations as any,
        },
      });

      return res.json({
        conversationId: convId,
        answer: fullAnswer,
        citations: validatedCitations,
        meta: {
          latencyMs,
          retrievedChunksCount: includedChunks.length,
        },
      });
    } catch (err: any) {
      console.error('Chat error:', err);
      if (!res.headersSent) {
        return res.status(500).json({ error: err.message || 'Chat generation failed' });
      }
      res.write(`data: ${JSON.stringify({ type: 'error', error: err.message })}\n\n`);
      return res.end();
    }
  }

  static async getHistory(req: Request, res: Response) {
    try {
      const { repositoryId } = req.params;
      const conversations = await prisma.chatConversation.findMany({
        where: { repositoryId },
        include: {
          messages: {
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { updatedAt: 'desc' },
      });

      return res.json({ conversations });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  }
}
