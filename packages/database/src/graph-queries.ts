import { getDatabaseClient } from './client.js';
import type { GraphNeighborChunk } from '@workspace/protocol';

export async function executeGraphNeighborhoodTraversal(params: {
  repositoryId: string;
  commitSha: string;
  seedChunkIds: string[];
  maxDepth?: number;
  limit?: number;
}): Promise<GraphNeighborChunk[]> {
  const sql = getDatabaseClient();
  const maxDepth = params.maxDepth ?? 1;
  const limit = params.limit ?? 10;

  if (params.seedChunkIds.length === 0) return [];

  const rows = await sql`
    WITH RECURSIVE graph_walk AS (
      SELECT 
        e.source_chunk_id,
        e.target_chunk_id,
        e.relation_type,
        e.symbol_name,
        'outgoing'::text AS direction,
        1 AS depth
      FROM code_edges e
      WHERE e.repository_id = ${params.repositoryId}::uuid
        AND e.commit_sha = ${params.commitSha}
        AND e.source_chunk_id = ANY(${params.seedChunkIds}::uuid[])

      UNION ALL

      SELECT 
        e.source_chunk_id,
        e.target_chunk_id,
        e.relation_type,
        e.symbol_name,
        'incoming'::text AS direction,
        1 AS depth
      FROM code_edges e
      WHERE e.repository_id = ${params.repositoryId}::uuid
        AND e.commit_sha = ${params.commitSha}
        AND e.target_chunk_id = ANY(${params.seedChunkIds}::uuid[])
    )
    SELECT DISTINCT ON (c.id)
      c.id AS "chunkId",
      c.file_path AS "filePath",
      c.start_line AS "startLine",
      c.end_line AS "endLine",
      c.content,
      gw.relation_type::text AS "relationType",
      gw.symbol_name AS "symbolName",
      gw.direction,
      gw.depth
    FROM graph_walk gw
    JOIN code_chunks c 
      ON (gw.direction = 'outgoing' AND c.id = gw.target_chunk_id)
      OR (gw.direction = 'incoming' AND c.id = gw.source_chunk_id)
    WHERE c.id != ALL(${params.seedChunkIds}::uuid[])
    LIMIT ${limit};
  `;

  return rows.map((r: any) => ({
    chunkId: r.chunkId,
    filePath: r.filePath,
    startLine: Number(r.startLine),
    endLine: Number(r.endLine),
    content: r.content,
    relationType: r.relationType,
    symbolName: r.symbolName,
    direction: r.direction as 'outgoing' | 'incoming',
    depth: Number(r.depth),
  }));
}
