import yaml from 'js-yaml';
import { sql } from 'kysely';
import { db } from '../../database/index.js';
import type { Pipeline, CreatePipelineInput, UpdatePipelineInput, PipelineStep } from './types.js';

interface CacheEntry { pipeline: Pipeline | null; expiresAt: number }

export class PipelineService {
  private cache = new Map<string, CacheEntry>();
  private cacheTTL = 5 * 60 * 1000;

  private mapRow(row: Record<string, unknown>): Pipeline {
    return {
      id: row.id as string,
      organizationId: row.organization_id as string,
      projectId: row.project_id as string | null,
      name: row.name as string,
      description: row.description as string | null,
      enabled: row.enabled as boolean,
      steps: (row.steps as PipelineStep[]) ?? [],
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  async create(input: CreatePipelineInput): Promise<Pipeline> {
    const row = await db
      .insertInto('log_pipelines')
      .values({
        organization_id: input.organizationId,
        project_id: input.projectId ?? null,
        name: input.name,
        description: input.description ?? null,
        enabled: input.enabled ?? true,
        steps: JSON.stringify(input.steps) as unknown as Record<string, unknown>[],
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    this.invalidateCache(input.organizationId);
    return this.mapRow(row as unknown as Record<string, unknown>);
  }

  async update(id: string, organizationId: string, input: UpdatePipelineInput): Promise<Pipeline> {
    const updates: Record<string, unknown> = { updated_at: new Date() };
    if (input.name !== undefined) updates.name = input.name;
    if (input.description !== undefined) updates.description = input.description;
    if (input.enabled !== undefined) updates.enabled = input.enabled;
    if (input.steps !== undefined) updates.steps = JSON.stringify(input.steps);

    const row = await db
      .updateTable('log_pipelines')
      .set(updates)
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .returningAll()
      .executeTakeFirstOrThrow();
    this.invalidateCache(organizationId);
    return this.mapRow(row as unknown as Record<string, unknown>);
  }

  async delete(id: string, organizationId: string): Promise<void> {
    await db
      .deleteFrom('log_pipelines')
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
    this.invalidateCache(organizationId);
  }

  async listForOrg(organizationId: string): Promise<Pipeline[]> {
    const rows = await db
      .selectFrom('log_pipelines')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('created_at', 'asc')
      .execute();
    return rows.map((r) => this.mapRow(r as unknown as Record<string, unknown>));
  }

  async getById(id: string, organizationId: string): Promise<Pipeline | null> {
    const row = await db
      .selectFrom('log_pipelines')
      .selectAll()
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();
    return row ? this.mapRow(row as unknown as Record<string, unknown>) : null;
  }

  /** Used by the BullMQ job - cached. Project pipeline takes priority over org-wide. */
  async getForProject(projectId: string, organizationId: string): Promise<Pipeline | null> {
    const cacheKey = `${organizationId}:${projectId}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) return cached.pipeline;

    // Project-specific first, then org-wide fallback
    const row = await db
      .selectFrom('log_pipelines')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .where('enabled', '=', true)
      .where((eb) =>
        eb.or([
          eb('project_id', '=', projectId),
          eb('project_id', 'is', null),
        ])
      )
      .orderBy(sql`project_id IS NULL`, 'asc') // false (not null = project-specific) sorts before true (null = org-wide)
      .executeTakeFirst();

    const pipeline = row ? this.mapRow(row as unknown as Record<string, unknown>) : null;
    this.cache.set(cacheKey, { pipeline, expiresAt: Date.now() + this.cacheTTL });
    return pipeline;
  }

  async importFromYaml(yamlText: string, organizationId: string, projectId: string | null): Promise<Pipeline> {
    let doc: unknown;
    try {
      doc = yaml.load(yamlText);
    } catch (e: unknown) {
      throw new Error(`Invalid YAML: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!doc || typeof doc !== 'object') throw new Error('YAML must be a mapping object');
    const docObj = doc as Record<string, unknown>;
    if (!docObj.name) throw new Error('Pipeline YAML must have a "name" field');
    if (!Array.isArray(docObj.steps)) throw new Error('Pipeline YAML must have a "steps" array');

    // Upsert: delete existing if any, then create
    await db
      .deleteFrom('log_pipelines')
      .where('organization_id', '=', organizationId)
      .where((eb) =>
        projectId ? eb('project_id', '=', projectId) : eb('project_id', 'is', null)
      )
      .execute();

    return this.create({
      organizationId,
      projectId,
      name: docObj.name as string,
      description: typeof docObj.description === 'string' ? docObj.description : undefined,
      enabled: typeof docObj.enabled === 'boolean' ? docObj.enabled : true,
      steps: docObj.steps as PipelineStep[],
    });
  }

  invalidateCache(organizationId: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(organizationId + ':')) this.cache.delete(key);
    }
  }
}

export const pipelineService = new PipelineService();
