import { describe, it, expect, beforeEach } from 'vitest';
import { pipelineService } from '../../../modules/log-pipeline/service.js';
import { createTestContext } from '../../helpers/index.js';
import { db } from '../../../database/index.js';

let ctx: Awaited<ReturnType<typeof createTestContext>>;

beforeEach(async () => {
  await db.deleteFrom('log_pipelines').execute();
  await db.deleteFrom('logs').execute();
  await db.deleteFrom('api_keys').execute();
  await db.deleteFrom('organization_members').execute();
  await db.deleteFrom('projects').execute();
  await db.deleteFrom('organizations').execute();
  await db.deleteFrom('sessions').execute();
  await db.deleteFrom('users').execute();

  ctx = await createTestContext();
  pipelineService.invalidateCache(ctx.organization.id);
});

describe('pipelineService.create', () => {
  it('creates a pipeline with steps', async () => {
    const pipeline = await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      name: 'Test Pipeline',
      steps: [{ type: 'parser', parser: 'nginx' }],
    });
    expect(pipeline.id).toBeDefined();
    expect(pipeline.steps).toHaveLength(1);
    expect(pipeline.enabled).toBe(true);
    expect(pipeline.organizationId).toBe(ctx.organization.id);
    expect(pipeline.projectId).toBe(ctx.project.id);
  });

  it('creates an org-wide pipeline when projectId is null', async () => {
    const pipeline = await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: null,
      name: 'Org Pipeline',
      steps: [],
    });
    expect(pipeline.projectId).toBeNull();
    expect(pipeline.name).toBe('Org Pipeline');
  });

  it('enforces unique pipeline per project', async () => {
    await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      name: 'First',
      steps: [],
    });
    await expect(pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      name: 'Second',
      steps: [],
    })).rejects.toThrow();
  });
});

describe('pipelineService.update', () => {
  it('updates name and steps', async () => {
    const created = await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      name: 'Original',
      steps: [],
    });
    const updated = await pipelineService.update(created.id, ctx.organization.id, {
      name: 'Updated',
      steps: [{ type: 'parser', parser: 'json' }],
    });
    expect(updated.name).toBe('Updated');
    expect(updated.steps).toHaveLength(1);
  });

  it('can disable a pipeline', async () => {
    const created = await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: null,
      name: 'Enabled',
      steps: [],
    });
    const updated = await pipelineService.update(created.id, ctx.organization.id, { enabled: false });
    expect(updated.enabled).toBe(false);
  });
});

describe('pipelineService.delete', () => {
  it('deletes a pipeline', async () => {
    const created = await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: null,
      name: 'To Delete',
      steps: [],
    });
    await pipelineService.delete(created.id, ctx.organization.id);
    const found = await pipelineService.getById(created.id, ctx.organization.id);
    expect(found).toBeNull();
  });
});

describe('pipelineService.listForOrg', () => {
  it('lists all pipelines for org', async () => {
    await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: null,
      name: 'Org-wide',
      steps: [],
    });
    await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      name: 'Project-specific',
      steps: [],
    });
    const list = await pipelineService.listForOrg(ctx.organization.id);
    expect(list).toHaveLength(2);
  });
});

describe('pipelineService.getForProject', () => {
  it('returns project pipeline', async () => {
    await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      name: 'P',
      steps: [],
    });
    pipelineService.invalidateCache(ctx.organization.id);
    const p = await pipelineService.getForProject(ctx.project.id, ctx.organization.id);
    expect(p?.name).toBe('P');
  });

  it('falls back to org-wide pipeline when no project pipeline exists', async () => {
    await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: null,
      name: 'Org-wide',
      steps: [],
    });
    pipelineService.invalidateCache(ctx.organization.id);
    const p = await pipelineService.getForProject(ctx.project.id, ctx.organization.id);
    expect(p?.name).toBe('Org-wide');
  });

  it('prefers project pipeline over org-wide', async () => {
    await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: null,
      name: 'Org-wide',
      steps: [],
    });
    await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      name: 'Project-specific',
      steps: [],
    });
    pipelineService.invalidateCache(ctx.organization.id);
    const p = await pipelineService.getForProject(ctx.project.id, ctx.organization.id);
    expect(p?.name).toBe('Project-specific');
  });

  it('returns null when no pipeline configured', async () => {
    const p = await pipelineService.getForProject(ctx.project.id, ctx.organization.id);
    expect(p).toBeNull();
  });

  it('caches result for subsequent calls', async () => {
    await pipelineService.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      name: 'Cached',
      steps: [],
    });
    pipelineService.invalidateCache(ctx.organization.id);
    const first = await pipelineService.getForProject(ctx.project.id, ctx.organization.id);
    // Delete from DB — cache should still return value
    await db.deleteFrom('log_pipelines').execute();
    const second = await pipelineService.getForProject(ctx.project.id, ctx.organization.id);
    expect(first?.name).toBe(second?.name);
  });
});

describe('pipelineService.importFromYaml', () => {
  it('parses valid YAML and creates pipeline', async () => {
    const yamlText = `
name: nginx-pipeline
description: Parse nginx logs
enabled: true
steps:
  - type: parser
    parser: nginx
  - type: geoip
    field: client_ip
    target: geo
`;
    const pipeline = await pipelineService.importFromYaml(yamlText, ctx.organization.id, ctx.project.id);
    expect(pipeline.name).toBe('nginx-pipeline');
    expect(pipeline.description).toBe('Parse nginx logs');
    expect(pipeline.steps).toHaveLength(2);
    expect(pipeline.enabled).toBe(true);
  });

  it('replaces existing pipeline on re-import', async () => {
    const yaml1 = `name: first\nsteps: []`;
    const yaml2 = `name: second\nsteps:\n  - type: parser\n    parser: json`;
    await pipelineService.importFromYaml(yaml1, ctx.organization.id, ctx.project.id);
    const pipeline = await pipelineService.importFromYaml(yaml2, ctx.organization.id, ctx.project.id);
    expect(pipeline.name).toBe('second');
    const list = await pipelineService.listForOrg(ctx.organization.id);
    expect(list).toHaveLength(1);
  });

  it('throws on invalid YAML syntax', async () => {
    await expect(pipelineService.importFromYaml('invalid: [yaml: bad', ctx.organization.id, null))
      .rejects.toThrow();
  });

  it('throws when name is missing', async () => {
    await expect(pipelineService.importFromYaml('steps: []', ctx.organization.id, null))
      .rejects.toThrow('name');
  });

  it('throws when steps is not an array', async () => {
    await expect(pipelineService.importFromYaml('name: test\nsteps: not-an-array', ctx.organization.id, null))
      .rejects.toThrow('steps');
  });
});
