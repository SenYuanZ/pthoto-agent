import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Document } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { SimpleVectorStore } from './local-vector-store';
import { seedDocuments } from './data/seed-documents';
import customDocuments from './data/custom-documents.json';
import { JsonStore } from '../common/json-store';

type DocOrigin = 'builtin' | 'custom' | 'upload';

interface UploadRecord {
  source: string;
  category: string;
  content: string;
  origin?: DocOrigin;
}

@Injectable()
export class KnowledgeService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeService.name);
  private vectorStore: SimpleVectorStore;
  private documentChunks: Document[] = [];
  private uploads: UploadRecord[] = [];
  private chunkCounter = 0;

  constructor(
    private configService: ConfigService,
    private jsonStore: JsonStore,
  ) {}

  async onModuleInit() {
    await this.initialize();
  }

  async initialize() {
    this.vectorStore = new SimpleVectorStore();
    this.documentChunks = [];
    this.chunkCounter = 0;
    this.uploads = await this.jsonStore.read<UploadRecord[]>('uploads', []);

    this.logger.log('Loading seed + custom + uploaded documents...');
    for (const doc of this.mergedSources()) {
      await this.addSourceChunks(doc.content, doc.source, doc.category);
    }
    await this.persistUploads();

    this.logger.log(
      `Knowledge ready: ${this.documentChunks.length} chunks, ${seedDocuments.length} seed docs, ${customDocuments.length} custom docs, ${this.uploads.length} uploads`,
    );
  }

  /**
   * Merge the three knowledge layers into one ordered source list:
   * built-in seeds -> custom-documents.json -> runtime uploads.json.
   * Later layers override earlier ones with the same source name, so an
   * edited document replaces the built-in copy instead of duplicating it.
   * Each record carries the origin of the layer it came from.
   */
  private mergedSources(): UploadRecord[] {
    const map = new Map<string, UploadRecord>();
    for (const doc of seedDocuments) {
      map.set(doc.metadata.source, {
        source: doc.metadata.source,
        category: doc.metadata.category,
        content: doc.content,
        origin: 'builtin',
      });
    }
    for (const doc of customDocuments) {
      map.set(doc.source, { ...doc, origin: 'custom' });
    }
    for (const up of this.uploads) {
      map.set(up.source, { ...up, origin: 'upload' });
    }
    return Array.from(map.values());
  }

  private get splitter(): RecursiveCharacterTextSplitter {
    const chunkSize = this.configService.get<number>('rag.chunkSize');
    const chunkOverlap = this.configService.get<number>('rag.chunkOverlap');
    return new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ['\n## ', '\n**', '\n- ', '\n\n', '\n', '。', '，', ' '],
    });
  }

  /**
   * Split content into chunks, tag each with a stable chunkId, then add to the
   * in-memory store. Returns the number of chunks created.
   */
  private async addSourceChunks(
    content: string,
    source: string,
    category: string,
  ): Promise<number> {
    const splitDocs = await this.splitter.createDocuments(
      [content],
      [{ source, category }],
    );
    const docs = splitDocs.map((d) => ({
      ...d,
      metadata: {
        ...d.metadata,
        source,
        category,
        chunkId: `${source}#c${this.chunkCounter++}`,
      },
    }));
    this.documentChunks.push(...docs);
    await this.vectorStore.addDocuments(docs);
    return docs.length;
  }

  private async rebuildVectorStore() {
    this.vectorStore = new SimpleVectorStore();
    if (this.documentChunks.length > 0) {
      await this.vectorStore.addDocuments(this.documentChunks);
    }
  }

  private async persistUploads() {
    await this.jsonStore.write('uploads', this.uploads);
  }

  getVectorStore(): SimpleVectorStore {
    return this.vectorStore;
  }

  async addDocument(content: string, source: string, category = '用户上传') {
    this.uploads.push({ source, category, content });
    await this.persistUploads();
    const chunkCount = await this.addSourceChunks(content, source, category);
    this.logger.log(
      `Added document "${source}" split into ${chunkCount} chunks`,
    );
    return { chunkCount, source, category };
  }

  listDocuments(): {
    source: string;
    category: string;
    chunkCount: number;
    origin: DocOrigin;
  }[] {
    const originMap = new Map<string, DocOrigin>();
    for (const doc of this.mergedSources()) {
      originMap.set(doc.source, doc.origin || 'upload');
    }
    const sourceMap = new Map<string, { category: string; count: number }>();
    this.documentChunks.forEach((doc) => {
      const source = doc.metadata.source as string;
      const category = doc.metadata.category as string;
      const existing = sourceMap.get(source) || { category, count: 0 };
      existing.count++;
      sourceMap.set(source, existing);
    });
    return Array.from(sourceMap.entries()).map(([source, info]) => ({
      source,
      category: info.category,
      chunkCount: info.count,
      origin: originMap.get(source) || 'builtin',
    }));
  }

  getDocumentCount(): number {
    return this.documentChunks.length;
  }

  getChunks(source: string): { chunkId: string; text: string }[] {
    return this.documentChunks
      .filter((d) => d.metadata.source === source)
      .map((d) => ({
        chunkId: d.metadata.chunkId as string,
        text: d.pageContent,
      }));
  }

  /**
   * Full original content for a source, so the UI can prefill an editor.
   * Check the layers in override order: runtime uploads first, then the
   * custom JSON file, then built-in seeds.
   */
  getOriginal(source: string): string | null {
    const upload = this.uploads.find((u) => u.source === source);
    if (upload) return upload.content;
    const custom = customDocuments.find((d) => d.source === source);
    if (custom) return custom.content;
    const seed = seedDocuments.find((d) => d.metadata.source === source);
    if (seed) return seed.content;
    return null;
  }

  async removeDocument(source: string): Promise<void> {
    const before = this.documentChunks.length;
    this.documentChunks = this.documentChunks.filter(
      (d) => d.metadata.source !== source,
    );
    this.uploads = this.uploads.filter((u) => u.source !== source);
    if (this.documentChunks.length !== before) {
      await this.rebuildVectorStore();
    }
    await this.persistUploads();
    this.logger.log(`Removed source "${source}"`);
  }

  async updateDocument(
    source: string,
    content: string,
    category?: string,
  ): Promise<number> {
    const prevCategory = this.uploads.find((u) => u.source === source)?.category;
    this.documentChunks = this.documentChunks.filter(
      (d) => d.metadata.source !== source,
    );
    this.uploads = this.uploads.filter((u) => u.source !== source);
    const cat = category || prevCategory || '知识编辑';
    this.uploads.push({ source, category: cat, content });
    await this.persistUploads();
    await this.rebuildVectorStore();
    const chunkCount = await this.addSourceChunks(content, source, cat);
    this.logger.log(`Updated source "${source}" -> ${chunkCount} chunks`);
    return chunkCount;
  }

  async reindex() {
    // Back up runtime uploads before clearing them, so a mistaken rebuild
    // can be recovered from storage/uploads.backup-<ts>.json.
    if (this.uploads.length > 0) {
      const backupKey = `uploads.backup-${Date.now()}`;
      await this.jsonStore.write(backupKey, this.uploads);
      this.logger.log(
        `Backed up ${this.uploads.length} upload(s) to storage/${backupKey}.json`,
      );
    }
    this.uploads = [];
    await this.persistUploads();
    this.documentChunks = [];
    this.vectorStore = new SimpleVectorStore();
    this.chunkCounter = 0;
    for (const doc of seedDocuments) {
      await this.addSourceChunks(doc.content, doc.metadata.source, doc.metadata.category);
    }
    for (const doc of customDocuments) {
      await this.addSourceChunks(doc.content, doc.source, doc.category);
    }
    this.logger.log(
      `Knowledge base reindexed (seed + custom kept, uploads cleared): ${this.documentChunks.length} chunks`,
    );
  }
}