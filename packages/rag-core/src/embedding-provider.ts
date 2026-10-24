import crypto from 'node:crypto';
import type { CodeChunk } from './chunker.js';

export interface EmbeddedChunk {
  chunk: CodeChunk;
  embedding: number[];
}

export interface EmbeddingProvider {
  readonly name: string;
  readonly model: string;
  readonly dimensions: number;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'gemini';
  readonly model: string;
  readonly dimensions: number;
  private apiKey: string;

  constructor(apiKey: string, model = 'text-embedding-004', dimensions = 768) {
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:batchEmbedContents?key=${this.apiKey}`;
    const requests = texts.map((t) => ({
      model: `models/${this.model}`,
      content: { parts: [{ text: t }] },
    }));

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Gemini Embedding API error [${res.status}]: ${errText}`);
    }

    const data = (await res.json()) as { embeddings: Array<{ values: number[] }> };
    return data.embeddings.map((e) => e.values);
  }
}

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'openai';
  readonly model: string;
  readonly dimensions: number;
  private apiKey: string;

  constructor(apiKey: string, model = 'text-embedding-3-small', dimensions = 768) {
    this.apiKey = apiKey;
    this.model = model;
    this.dimensions = dimensions;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const url = 'https://api.openai.com/v1/embeddings';
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        input: texts,
        dimensions: this.dimensions,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`OpenAI Embedding API error [${res.status}]: ${errText}`);
    }

    const data = (await res.json()) as { data: Array<{ embedding: number[]; index: number }> };
    return data.data.sort((a, b) => a.index - b.index).map((item) => item.embedding);
  }
}

export class MockEmbeddingProvider implements EmbeddingProvider {
  readonly name = 'mock';
  readonly model: string;
  readonly dimensions: number;

  constructor(dimensions = 768, model = 'mock-embedding-v1') {
    this.dimensions = dimensions;
    this.model = model;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return texts.map((text) => {
      const vector: number[] = new Array(this.dimensions).fill(0);
      const tokens = text.match(/[a-zA-Z0-9_]{2,}/g) || [text];

      for (const token of tokens) {
        const hash = crypto.createHash('md5').update(token.toLowerCase()).digest();
        const dim1 = hash.readUInt16BE(0) % this.dimensions;
        vector[dim1] += 1.0;
        const dim2 = hash.readUInt16BE(2) % this.dimensions;
        vector[dim2] += 0.5;
      }

      let norm = 0;
      for (let i = 0; i < this.dimensions; i++) norm += vector[i] * vector[i];
      norm = Math.sqrt(norm) || 1;
      for (let i = 0; i < this.dimensions; i++) vector[i] /= norm;

      return vector;
    });
  }
}

export class BatchEmbedder {
  static async embedChunks(
    chunks: CodeChunk[],
    provider: EmbeddingProvider,
    options?: { batchSize?: number; onProgress?: (processed: number, total: number) => void }
  ): Promise<EmbeddedChunk[]> {
    const batchSize = options?.batchSize ?? 30;
    const results: EmbeddedChunk[] = [];

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => `File: ${c.filePath}\n${c.content}`);
      const embeddings = await provider.embedBatch(texts);

      for (let j = 0; j < batch.length; j++) {
        results.push({
          chunk: batch[j],
          embedding: embeddings[j],
        });
      }

      options?.onProgress?.(Math.min(i + batchSize, chunks.length), chunks.length);
    }

    return results;
  }
}
