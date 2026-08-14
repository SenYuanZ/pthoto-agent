/**
 * Local BM25 retrieval with CJK-aware n-gram tokenization.
 * Pure JS implementation - no native dependencies, no API calls.
 *
 * Chinese text has no word boundaries, so a plain whitespace splitter would
 * treat each sentence as a single token and matching would effectively never
 * happen. We instead index overlapping character unigrams + bigrams, which
 * makes queries share tokens with documents that contain any of the same
 * characters or character pairs. BM25 (Okapi) with a title boost gives solid
 * lexical ranking on top of that.
 */

const K1 = 1.5;
const B = 0.75;
const TITLE_BOOST = 2;

/** Split text into tokens: ASCII words as-is, CJK runs as unigrams + bigrams. */
export function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const pieces = text
    .toLowerCase()
    .replace(/[^\w一-鿿\s]/g, ' ')
    .split(/\s+/);
  for (const piece of pieces) {
    if (!piece) continue;
    const runs = piece.match(/[一-鿿]+|[^一-鿿]+/g) || [];
    for (const run of runs) {
      if (/[一-鿿]/.test(run)) {
        for (const ch of run) tokens.push(ch);
        if (run.length > 1) {
          for (let i = 0; i < run.length - 1; i++) {
            tokens.push(run.slice(i, i + 2));
          }
        }
      } else {
        tokens.push(run);
      }
    }
  }
  return tokens;
}

export interface VectorStoreEntry {
  id: string;
  tokens: string[];
  document: any;
}

export class SimpleVectorStore {
  private entries: VectorStoreEntry[] = [];
  private numDocs = 0;
  private avgDocLength = 0;
  private totalTokens = 0;
  private docFrequency = new Map<string, number>();

  async addDocuments(documents: any[]): Promise<void> {
    for (const doc of documents) {
      const tokens = tokenize(doc.pageContent);
      this.entries.push({
        id: `doc_${this.entries.length}`,
        tokens,
        document: doc,
      });
      this.totalTokens += tokens.length;
      for (const t of new Set(tokens)) {
        this.docFrequency.set(t, (this.docFrequency.get(t) || 0) + 1);
      }
    }
    this.numDocs = this.entries.length;
    this.avgDocLength = this.totalTokens / (this.numDocs || 1);
  }

  private idf(term: string): number {
    const df = this.docFrequency.get(term) || 0;
    return Math.log(1 + (this.numDocs - df + 0.5) / (df + 0.5));
  }

  private score(queryTokens: string[], entry: VectorStoreEntry): number {
    const tf = new Map<string, number>();
    for (const t of entry.tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }
    // Tokens from the document title (metadata.source) are the strongest
    // retrieval key, e.g. "漫展单灯游场布光" for a lighting question.
    const titleTokens = new Set(
      tokenize((entry.document?.metadata?.source as string) || ''),
    );
    const avgLen = this.avgDocLength || 1;

    let score = 0;
    for (const t of new Set(queryTokens)) {
      const f = tf.get(t) || 0;
      if (!f) continue;
      const base =
        this.idf(t) *
        ((f * (K1 + 1)) / (f + K1 * (1 - B + (B * entry.tokens.length) / avgLen)));
      score += titleTokens.has(t) ? base * TITLE_BOOST : base;
    }
    return score;
  }

  async similaritySearch(query: string, k: number = 4): Promise<any[]> {
    const results = await this.similaritySearchWithScores(query, k);
    return results.map((r) => r.document);
  }

  async similaritySearchWithScores(
    query: string,
    k: number = 4,
  ): Promise<{ document: any; score: number }[]> {
    const queryTokens = tokenize(query);
    const scored = this.entries.map((entry) => ({
      document: entry.document,
      score: this.score(queryTokens, entry),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  asRetriever(k: number = 4) {
    return {
      invoke: async (query: string) => {
        return this.similaritySearch(query, k);
      },
    };
  }

  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
    this.docFrequency.clear();
    this.numDocs = 0;
    this.totalTokens = 0;
    this.avgDocLength = 0;
  }
}
