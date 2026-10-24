export interface RetrievedChunk {
  chunkId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  similarity: number;
  relationshipType?: string;
  relationshipDescription?: string;
}

export interface ValidatedCitation {
  filePath: string;
  startLine: number;
  endLine: number;
  snippet?: string;
  verified: boolean;
  chunkId?: string;
  similarityScore?: number;
  unverifiedReason?: string;
}

export class CitationValidator {
  static validate(generatedText: string, retrievedChunks: RetrievedChunk[]): ValidatedCitation[] {
    const rawCitations: Array<{ filePath: string; startLine: number; endLine: number }> = [];

    const hashRegex = /\[([a-zA-Z0-9_./\\-]+)#L?(\d+)(?:-L?(\d+))?\]/g;
    let match: RegExpExecArray | null;

    while ((match = hashRegex.exec(generatedText)) !== null) {
      const filePath = match[1].replace(/\\/g, '/');
      const startLine = parseInt(match[2], 10);
      const endLine = match[3] ? parseInt(match[3], 10) : startLine;
      rawCitations.push({ filePath, startLine, endLine });
    }

    const colonRegex = /\[([a-zA-Z0-9_./\\-]+):(\d+)(?:-(\d+))?\]/g;
    while ((match = colonRegex.exec(generatedText)) !== null) {
      const filePath = match[1].replace(/\\/g, '/');
      const startLine = parseInt(match[2], 10);
      const endLine = match[3] ? parseInt(match[3], 10) : startLine;
      const alreadyCaptured = rawCitations.some(
        (c) => c.filePath === filePath && c.startLine === startLine && c.endLine === endLine
      );
      if (!alreadyCaptured) {
        rawCitations.push({ filePath, startLine, endLine });
      }
    }

    const validated: ValidatedCitation[] = [];
    const seen = new Set<string>();

    for (const citation of rawCitations) {
      const key = `${citation.filePath}:${citation.startLine}-${citation.endLine}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const candidateChunk = retrievedChunks.find((c) => {
        const pathMatches = c.filePath === citation.filePath || c.filePath.endsWith(citation.filePath);
        if (!pathMatches) return false;

        const overlaps = Math.max(citation.startLine, c.startLine) <= Math.min(citation.endLine, c.endLine);
        return overlaps;
      });

      if (candidateChunk) {
        const lines = candidateChunk.content.split('\n');
        const relStart = Math.max(0, citation.startLine - candidateChunk.startLine);
        const relEnd = Math.min(lines.length, citation.endLine - candidateChunk.startLine + 1);
        const snippet = lines.slice(relStart, relEnd).join('\n').slice(0, 300);

        validated.push({
          filePath: candidateChunk.filePath,
          startLine: citation.startLine,
          endLine: citation.endLine,
          verified: true,
          chunkId: candidateChunk.chunkId,
          snippet,
          similarityScore: candidateChunk.similarity,
        });
      } else {
        validated.push({
          filePath: citation.filePath,
          startLine: citation.startLine,
          endLine: citation.endLine,
          verified: false,
          unverifiedReason: `Cited line range outside retrieved chunks`,
        });
      }
    }

    return validated;
  }
}
