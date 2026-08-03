import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join } from 'path';

const STORAGE_ROOT = join(process.cwd(), 'storage');

/**
 * Minimal JSON-file key/value store used to persist the in-memory knowledge
 * base and chat history across process restarts. Files live in ./storage
 * (gitignored) as storage/<key>.json.
 */
@Injectable()
export class JsonStore {
  private readonly logger = new Logger(JsonStore.name);

  async read<T>(key: string, fallback: T): Promise<T> {
    const file = join(STORAGE_ROOT, `${key}.json`);
    try {
      const raw = await fs.readFile(file, 'utf-8');
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }

  async write(key: string, data: unknown): Promise<void> {
    await fs.mkdir(STORAGE_ROOT, { recursive: true });
    const file = join(STORAGE_ROOT, `${key}.json`);
    await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf-8');
  }

  get storageRoot(): string {
    return STORAGE_ROOT;
  }
}