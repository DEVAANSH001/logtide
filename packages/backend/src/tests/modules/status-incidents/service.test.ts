import { describe, it, expect, beforeEach } from 'vitest';
import { StatusIncidentService } from '../../../modules/status-incidents/service.js';
import { createTestContext } from '../../helpers/index.js';

let service: StatusIncidentService;
let ctx: Awaited<ReturnType<typeof createTestContext>>;

beforeEach(async () => {
  service = new StatusIncidentService();
  ctx = await createTestContext();
});

describe('StatusIncidentService.create', () => {
  it('creates an incident with defaults', async () => {
    const incident = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'DB outage',
      createdBy: ctx.user.id,
    });

    expect(incident.id).toBeDefined();
    expect(incident.title).toBe('DB outage');
    expect(incident.status).toBe('investigating');
    expect(incident.severity).toBe('minor');
    expect(incident.resolvedAt).toBeNull();
  });

  it('creates an incident with explicit status and severity', async () => {
    const incident = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Critical failure',
      status: 'identified',
      severity: 'critical',
      createdBy: ctx.user.id,
    });

    expect(incident.status).toBe('identified');
    expect(incident.severity).toBe('critical');
  });

  it('creates an incident with an initial message', async () => {
    const incident = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'With message',
      message: 'We are investigating',
      createdBy: ctx.user.id,
    });

    const updates = await service.getUpdates(incident.id);
    expect(updates).toHaveLength(1);
    expect(updates[0].message).toBe('We are investigating');
    expect(updates[0].status).toBe('investigating');
  });
});

describe('StatusIncidentService.list', () => {
  it('lists incidents for a project', async () => {
    await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'I1',
      createdBy: ctx.user.id,
    });
    await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'I2',
      createdBy: ctx.user.id,
    });

    const incidents = await service.list(ctx.project.id, ctx.organization.id);
    expect(incidents.length).toBe(2);
  });

  it('returns empty array when no incidents', async () => {
    const incidents = await service.list(ctx.project.id, ctx.organization.id);
    expect(incidents).toHaveLength(0);
  });

  it('does not return incidents from other projects', async () => {
    const { createTestProject } = await import('../../helpers/factories.js');
    const otherProject = await createTestProject({ organizationId: ctx.organization.id, userId: ctx.user.id });

    await service.create({
      organizationId: ctx.organization.id,
      projectId: otherProject.id,
      title: 'Other project',
      createdBy: ctx.user.id,
    });

    const incidents = await service.list(ctx.project.id, ctx.organization.id);
    expect(incidents).toHaveLength(0);
  });
});

describe('StatusIncidentService.getById', () => {
  it('returns incident by id', async () => {
    const created = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Find me',
      createdBy: ctx.user.id,
    });

    const found = await service.getById(created.id, ctx.organization.id);
    expect(found).not.toBeNull();
    expect(found!.title).toBe('Find me');
  });

  it('returns null for unknown id', async () => {
    const found = await service.getById('00000000-0000-0000-0000-000000000000', ctx.organization.id);
    expect(found).toBeNull();
  });
});

describe('StatusIncidentService.update', () => {
  it('updates title and severity', async () => {
    const incident = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Old title',
      createdBy: ctx.user.id,
    });

    const updated = await service.update(incident.id, ctx.organization.id, {
      title: 'New title',
      severity: 'major',
    });

    expect(updated!.title).toBe('New title');
    expect(updated!.severity).toBe('major');
  });

  it('sets resolvedAt when status becomes resolved', async () => {
    const incident = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Resolving',
      createdBy: ctx.user.id,
    });

    const updated = await service.update(incident.id, ctx.organization.id, { status: 'resolved' });
    expect(updated!.status).toBe('resolved');
    expect(updated!.resolvedAt).not.toBeNull();
  });

  it('clears resolvedAt when re-opening', async () => {
    const incident = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Reopen',
      createdBy: ctx.user.id,
    });

    await service.update(incident.id, ctx.organization.id, { status: 'resolved' });
    const reopened = await service.update(incident.id, ctx.organization.id, { status: 'investigating' });
    expect(reopened!.resolvedAt).toBeNull();
  });

  it('returns null for unknown id', async () => {
    const result = await service.update('00000000-0000-0000-0000-000000000000', ctx.organization.id, {
      title: 'x',
    });
    expect(result).toBeNull();
  });
});

describe('StatusIncidentService.delete', () => {
  it('deletes an incident', async () => {
    const incident = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Delete me',
      createdBy: ctx.user.id,
    });

    const deleted = await service.delete(incident.id, ctx.organization.id);
    expect(deleted).toBe(true);

    const found = await service.getById(incident.id, ctx.organization.id);
    expect(found).toBeNull();
  });

  it('returns false for unknown id', async () => {
    const result = await service.delete('00000000-0000-0000-0000-000000000000', ctx.organization.id);
    expect(result).toBe(false);
  });
});

describe('StatusIncidentService.addUpdate', () => {
  it('adds an update and changes incident status', async () => {
    const incident = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'In progress',
      createdBy: ctx.user.id,
    });

    const update = await service.addUpdate(incident.id, ctx.organization.id, {
      status: 'identified',
      message: 'Root cause found',
      createdBy: ctx.user.id,
    });

    expect(update.message).toBe('Root cause found');
    expect(update.status).toBe('identified');

    const refreshed = await service.getById(incident.id, ctx.organization.id);
    expect(refreshed!.status).toBe('identified');
  });

  it('sets resolvedAt on incident when status is resolved', async () => {
    const incident = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Resolve via update',
      createdBy: ctx.user.id,
    });

    await service.addUpdate(incident.id, ctx.organization.id, {
      status: 'resolved',
      message: 'All clear',
      createdBy: ctx.user.id,
    });

    const refreshed = await service.getById(incident.id, ctx.organization.id);
    expect(refreshed!.resolvedAt).not.toBeNull();
  });

  it('throws for non-existent incident', async () => {
    await expect(
      service.addUpdate('00000000-0000-0000-0000-000000000000', ctx.organization.id, {
        status: 'monitoring',
        message: 'test',
        createdBy: ctx.user.id,
      })
    ).rejects.toThrow('Incident not found');
  });
});

describe('StatusIncidentService.getUpdates', () => {
  it('returns updates ordered by time asc', async () => {
    const incident = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Multi update',
      message: 'First',
      createdBy: ctx.user.id,
    });

    await service.addUpdate(incident.id, ctx.organization.id, {
      status: 'identified',
      message: 'Second',
      createdBy: ctx.user.id,
    });

    const updates = await service.getUpdates(incident.id);
    expect(updates.length).toBe(2);
    expect(updates[0].message).toBe('First');
    expect(updates[1].message).toBe('Second');
  });
});
