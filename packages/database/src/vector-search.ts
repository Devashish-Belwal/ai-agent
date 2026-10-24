import { getDatabaseClient } from './client.js';

export interface VectorSearchResult {
  id: string;
  repositoryId: string;
  commitSha: string;
  filePath: string;
  language: string;
  startLine: number;
  endLine: number;
  content: string;
  similarity: number;
}

export async function executeVectorSearch(params: {
  repositoryId: string;
  commitSha?: string;
  query?: string;
  embedding: number[];
  topK?: number;
  minSimilarity?: number;
}): Promise<VectorSearchResult[]> {
  const sql = getDatabaseClient();
  const topK = params.topK ?? 8;
  const minSimilarity = params.minSimilarity ?? 0.05;
  const vectorStr = `[${params.embedding.join(',')}]`;

  // 1. Vector cosine similarity search
  let vectorRows: VectorSearchResult[] = [];
  if (params.commitSha) {
    vectorRows = await sql<VectorSearchResult[]>`
      SELECT 
        id,
        repository_id AS "repositoryId",
        commit_sha AS "commitSha",
        file_path AS "filePath",
        language,
        start_line AS "startLine",
        end_line AS "endLine",
        content,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM code_chunks
      WHERE repository_id = ${params.repositoryId}::uuid
        AND commit_sha = ${params.commitSha}
        AND embedding IS NOT NULL
        AND (1 - (embedding <=> ${vectorStr}::vector)) >= ${minSimilarity}
      ORDER BY embedding <=> ${vectorStr}::vector ASC
      LIMIT ${topK};
    `;
  } else {
    vectorRows = await sql<VectorSearchResult[]>`
      SELECT 
        id,
        repository_id AS "repositoryId",
        commit_sha AS "commitSha",
        file_path AS "filePath",
        language,
        start_line AS "startLine",
        end_line AS "endLine",
        content,
        1 - (embedding <=> ${vectorStr}::vector) AS similarity
      FROM code_chunks
      WHERE repository_id = ${params.repositoryId}::uuid
        AND embedding IS NOT NULL
        AND (1 - (embedding <=> ${vectorStr}::vector)) >= ${minSimilarity}
      ORDER BY embedding <=> ${vectorStr}::vector ASC
      LIMIT ${topK};
    `;
  }

  // 2. Lexical / Keyword matching for terms and filenames in the query
  const keywordRows: VectorSearchResult[] = [];
  if (params.query && params.query.trim()) {
    const rawTokens = params.query.match(/[a-zA-Z0-9_.-]{3,}/g) || [];
    const stopWords = new Set(['how', 'does', 'where', 'what', 'the', 'and', 'for', 'with', 'from', 'this', 'that', 'explain']);
    const keywords = rawTokens.filter((t) => !stopWords.has(t.toLowerCase())).slice(0, 3);

    for (const kw of keywords) {
      const termPattern = `%${kw}%`;
      const kwMatches = await sql<VectorSearchResult[]>`
        SELECT 
          id,
          repository_id AS "repositoryId",
          commit_sha AS "commitSha",
          file_path AS "filePath",
          language,
          start_line AS "startLine",
          end_line AS "endLine",
          content,
          0.85 AS similarity
        FROM code_chunks
        WHERE repository_id = ${params.repositoryId}::uuid
          AND (file_path ILIKE ${termPattern} OR content ILIKE ${termPattern})
        LIMIT 4;
      `;
      keywordRows.push(...kwMatches);
    }
  }

  // 3. Merge and deduplicate (keyword matches prioritized if high relevance)
  const combinedMap = new Map<string, VectorSearchResult>();
  for (const row of [...keywordRows, ...vectorRows]) {
    if (!combinedMap.has(row.id)) {
      combinedMap.set(row.id, row);
    }
  }

  return Array.from(combinedMap.values()).slice(0, topK);
}
