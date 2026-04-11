/**
 * Source Maps Service
 *
 * Handles CRUD operations for source map metadata (DB) and files (storage).
 */

import type { Kysely } from 'kysely';
import type { Database } from '../../database/types.js';
import type { SourceMapStorage } from './storage.js';
import path from 'node:path';

export interface SourceMapRecord {
  id: string;
  projectId: string;
  organizationId: string;
  release: string;
  fileName: string;
  fileSize: number;
  storagePath: string;
  uploadedAt: Date;
}

export class SourceMapsService {
  constructor(
    private db: Kysely<Database>,
    private storage: SourceMapStorage,
  ) {}

  /**
   * Store a source map file. Upserts on (project_id, release, file_name).
   */
  async storeMap(params: {
    projectId: string;
    organizationId: string;
    release: string;
    fileName: string;
    content: Buffer;
  }): Promise<SourceMapRecord> {
    const { projectId, organizationId, release, fileName, content } = params;

    // Sanitize file name - only basename allowed
    const safeName = path.basename(fileName);
    if (safeName !== fileName || fileName.includes('..')) {
      throw new Error('Invalid file name: must not contain path separators');
    }

    // Store file on disk
    const storagePath = await this.storage.store(projectId, release, safeName, content);

    // Upsert metadata in DB
    const result = await this.db
      .insertInto('sourcemaps')
      .values({
        project_id: projectId,
        organization_id: organizationId,
        release,
        file_name: safeName,
        file_size: content.length,
        storage_path: storagePath,
      })
      .onConflict((oc) =>
        oc.columns(['project_id', 'release', 'file_name']).doUpdateSet({
          file_size: content.length,
          storage_path: storagePath,
          uploaded_at: new Date(),
        })
      )
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapRow(result);
  }

  /**
   * Get the raw source map content for a specific file.
   */
  async getMapContent(projectId: string, release: string, fileName: string): Promise<Buffer | null> {
    return this.storage.retrieve(projectId, release, fileName);
  }

  /**
   * List source maps for a project, optionally filtered by release.
   */
  async listMaps(projectId: string, release?: string): Promise<SourceMapRecord[]> {
    let query = this.db
      .selectFrom('sourcemaps')
      .selectAll()
      .where('project_id', '=', projectId)
      .orderBy('uploaded_at', 'desc');

    if (release) {
      query = query.where('release', '=', release);
    }

    const rows = await query.execute();
    return rows.map(this.mapRow);
  }

  /**
   * Delete all source maps for a release (or a specific file).
   */
  async deleteMaps(projectId: string, release: string, fileName?: string): Promise<number> {
    // Get storage paths before deleting from DB
    let query = this.db
      .selectFrom('sourcemaps')
      .select(['file_name'])
      .where('project_id', '=', projectId)
      .where('release', '=', release);

    if (fileName) {
      query = query.where('file_name', '=', fileName);
    }

    const rows = await query.execute();

    if (rows.length === 0) return 0;

    // Delete from DB
    let deleteQuery = this.db
      .deleteFrom('sourcemaps')
      .where('project_id', '=', projectId)
      .where('release', '=', release);

    if (fileName) {
      deleteQuery = deleteQuery.where('file_name', '=', fileName);
    }

    await deleteQuery.execute();

    // Delete from storage (best effort - orphaned files are acceptable)
    if (fileName) {
      await this.storage.delete(projectId, release, fileName).catch(() => {});
    } else {
      await this.storage.delete(projectId, release).catch(() => {});
    }

    return rows.length;
  }

  /**
   * Find a source map by matching a JS file name from a stack frame.
   * Tries exact match first (e.g., "main.abc123.js.map"), then basename.
   */
  async findMap(projectId: string, release: string, jsFileName: string): Promise<Buffer | null> {
    // The stack frame has a file path like "/assets/main.abc123.js" or "https://example.com/assets/main.abc123.js"
    // The source map is stored as "main.abc123.js.map"
    const basename = path.basename(jsFileName).replace(/\?.*$/, '');
    const mapName = basename + '.map';

    return this.getMapContent(projectId, release, mapName);
  }

  private mapRow(row: any): SourceMapRecord {
    return {
      id: row.id,
      projectId: row.project_id,
      organizationId: row.organization_id,
      release: row.release,
      fileName: row.file_name,
      fileSize: row.file_size,
      storagePath: row.storage_path,
      uploadedAt: row.uploaded_at,
    };
  }
}
