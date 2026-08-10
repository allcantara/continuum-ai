import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

const LOCK_DIR_NAME = '.lock';
const MAX_RETRIES = 50;
const RETRY_DELAY_MS = 100;

export class DirectoryLock {
  constructor(private readonly lockPath: string) {}

  static forDirectory(directory: string): DirectoryLock {
    return new DirectoryLock(join(directory, LOCK_DIR_NAME));
  }

  async acquire(): Promise<void> {
    for (var attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await mkdir(this.lockPath);
        return;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
          throw error;
        }
        await sleep(RETRY_DELAY_MS);
      }
    }
    throw new Error(`Failed to acquire lock at ${this.lockPath} after ${MAX_RETRIES} attempts`);
  }

  async release(): Promise<void> {
    try {
      await rm(this.lockPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }
  }

  async withLock<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      await this.release();
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
