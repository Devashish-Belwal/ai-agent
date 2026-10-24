export class QueryRewriter {
  static shouldRewrite(question: string, chunksCount: number): boolean {
    if (chunksCount === 0) return true;
    const lower = question.toLowerCase();
    return (
      lower.includes('where is') ||
      lower.includes('how does') ||
      lower.includes('find the') ||
      lower.includes('auth') ||
      lower.includes('flow')
    );
  }

  static generateKeywords(question: string): string[] {
    const rawTokens = question.match(/[a-zA-Z0-9_]{3,}/g) || [];
    const stopWords = new Set(['how', 'does', 'where', 'what', 'the', 'and', 'for', 'with', 'from', 'this', 'that']);
    return rawTokens.filter((t) => !stopWords.has(t.toLowerCase()));
  }
}
