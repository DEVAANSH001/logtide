/**
 * Source Map Storage Abstraction
 *
 * Interface + filesystem implementation for storing source map files.
 * The abstraction allows adding S3/GCS implementations later.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface SourceMapEntry {
  release: string;
  fileName: string;
  size: number;
  uploadedAt: Date;
}

export interface SourceMapStorage {
  store(projectId: string, release: string, fileName: string, content: Buffer): Promise<string>;
  retrieve(projectId: string, release: string, fileName: string): Promise<Buffer | null>;
  delete(projectId: string, release: string, fileName?: string): Promise<void>;
}

export class FilesystemStorage implements SourceMapStorage {
  constructor(private basePath: string) {}

  private getDir(projectId: string, release: string): string {
    // Sanitize release to prevent path traversal (../ etc)
    const safeRelease = path.basename(release);
    return path.join(this.basePath, projectId, safeRelease);
  }

  private getFilePath(projectId: string, release: string, fileName: string): string {
    // Sanitize: only use basename to prevent path traversal
    const safeName = path.basename(fileName);
    return path.join(this.getDir(projectId, release), safeName);
  }

  async store(projectId: string, release: string, fileName: string, content: Buffer): Promise<string> {
    const filePath = this.getFilePath(projectId, release, fileName);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return filePath;
  }

  async retrieve(projectId: string, release: string, fileName: string): Promise<Buffer | null> {
    const filePath = this.getFilePath(projectId, release, fileName);
    try {
      return await fs.readFile(filePath);
    } catch {
      return null;
    }
  }

  async delete(projectId: string, release: string, fileName?: string): Promise<void> {
    if (fileName) {
      const filePath = this.getFilePath(projectId, release, fileName);
      try {
        await fs.unlink(filePath);
      } catch {
        // File already gone - fine
      }
    } else {
      // Delete entire release directory
      const dir = this.getDir(projectId, release);
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // Directory already gone - fine
      }
    }
  }
}

/**
 * Create storage instance from environment config.
 * Falls back to a platform-appropriate default path.
 */
export function createStorage(): SourceMapStorage {
  const storagePath = process.env.SOURCEMAP_STORAGE_PATH
    || path.join(os.homedir(), '.logtide', 'sourcemaps');

  return new FilesystemStorage(storagePath);
}
