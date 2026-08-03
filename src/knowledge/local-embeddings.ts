import { Embeddings } from '@langchain/core/embeddings';

/**
 * Simple local embedding using hash-based vectorization.
 * Pure JS implementation - no native dependencies.
 */
export class LocalEmbeddings extends Embeddings {
  private dimension = 384;

  constructor(params?: any) {
    super(params || {});
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w一-鿿\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  private hashToken(token: string, seed: number): number {
    let hash = seed;
    for (let i = 0; i < token.length; i++) {
      hash = ((hash << 5) - hash + token.charCodeAt(i)) | 0;
    }
    return hash;
  }

  private embedText(text: string): number[] {
    const tokens = this.tokenize(text);
    const vector = new Array(this.dimension).fill(0);

    for (const token of tokens) {
      for (let i = 0; i < this.dimension; i++) {
        const hash = this.hashToken(token, i + 1);
        vector[i] += hash > 0 ? 1 : -1;
      }
    }

    // L2 normalize
    const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    if (magnitude > 0) {
      for (let i = 0; i < this.dimension; i++) {
        vector[i] /= magnitude;
      }
    }

    return vector;
  }

  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embedText(text));
  }

  async embedQuery(text: string): Promise<number[]> {
    return this.embedText(text);
  }
}

/**
 * Simple in-memory vector store with cosine similarity.
 * No native dependencies required.
 */
export interface VectorStoreEntry {
  id: string;
  embedding: number[];
  document: any;
}

export class SimpleVectorStore {
  private entries: VectorStoreEntry[] = [];

  constructor(
    private embeddings: LocalEmbeddings,
    private numDimensions: number = 384,
  ) {}

  async addDocuments(documents: any[]): Promise<void> {
    const texts = documents.map((doc) => doc.pageContent);
    const embeddings = await this.embeddings.embedDocuments(texts);

    documents.forEach((doc, i) => {
      this.entries.push({
        id: `doc_${this.entries.length}`,
        embedding: embeddings[i],
        document: doc,
      });
    });
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  async similaritySearch(query: string, k: number = 4): Promise<any[]> {
    const queryEmbedding = await this.embeddings.embedQuery(query);

    const scores = this.entries.map((entry) => ({
      document: entry.document,
      score: this.cosineSimilarity(queryEmbedding, entry.embedding),
    }));

    scores.sort((a, b) => b.score - a.score);

    return scores.slice(0, k).map((s) => s.document);
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
  }
}
