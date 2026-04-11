import { describe, it, expect, beforeEach } from 'vitest';
import { MaintenanceService } from '../../../modules/maintenances/service.js';
import { createTestContext } from '../../helpers/index.js';
import { db } from '../../../database/index.js';

let service: MaintenanceService;
let ctx: Awaited<ReturnType<typeof createTestContext>>;

beforeEach(async () => {
  service = new MaintenanceService();
  ctx = await createTestContext();
});

describe('MaintenanceService.create', () => {
  it('creates a maintenance window', async () => {
    const start = new Date(Date.now() + 60_000);
    const end = new Date(Date.now() + 3_600_000);

    const m = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Scheduled DB upgrade',
      scheduledStart: start,
      scheduledEnd: end,
      createdBy: ctx.user.id,
    });

    expect(m.id).toBeDefined();
    expect(m.title).toBe('Scheduled DB upgrade');
    expect(m.status).toBe('scheduled');
    expect(m.autoUpdateStatus).toBe(true);
    expect(m.organizationId).toBe(ctx.organization.id);
  });

  it('creates with description and autoUpdateStatus=false', async () => {
    const m = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Manual window',
      description: 'Manual control',
      scheduledStart: new Date(Date.now() + 60_000),
      scheduledEnd: new Date(Date.now() + 3_600_000),
      autoUpdateStatus: false,
      createdBy: ctx.user.id,
    });

    expect(m.description).toBe('Manual control');
    expect(m.autoUpdateStatus).toBe(false);
  });
});

describe('MaintenanceService.list', () => {
  it('lists maintenances for a project', async () => {
    await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'M1',
      scheduledStart: new Date(Date.now() + 60_000),
      scheduledEnd: new Date(Date.now() + 3_600_000),
      createdBy: ctx.user.id,
    });
    await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'M2',
      scheduledStart: new Date(Date.now() + 7_200_000),
      scheduledEnd: new Date(Date.now() + 10_800_000),
      createdBy: ctx.user.id,
    });

    const list = await service.list(ctx.project.id, ctx.organization.id);
    expect(list.length).toBe(2);
  });

  it('returns empty array when no maintenances', async () => {
    const list = await service.list(ctx.project.id, ctx.organization.id);
    expect(list).toHaveLength(0);
  });
});

describe('MaintenanceService.getById', () => {
  it('returns maintenance by id', async () => {
    const created = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Find me',
      scheduledStart: new Date(Date.now() + 60_000),
      scheduledEnd: new Date(Date.now() + 3_600_000),
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

describe('MaintenanceService.update', () => {
  it('updates title', async () => {
    const m = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Old',
      scheduledStart: new Date(Date.now() + 60_000),
      scheduledEnd: new Date(Date.now() + 3_600_000),
      createdBy: ctx.user.id,
    });

    const updated = await service.update(m.id, ctx.organization.id, { title: 'New' });
    expect(updated!.title).toBe('New');
  });

  it('tracks actual_start when status changes to in_progress', async () => {
    const m = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Track start',
      scheduledStart: new Date(Date.now() + 60_000),
      scheduledEnd: new Date(Date.now() + 3_600_000),
      createdBy: ctx.user.id,
    });

    const updated = await service.update(m.id, ctx.organization.id, { status: 'in_progress' });
    expect(updated!.status).toBe('in_progress');
    expect(updated!.actualStart).toBeInstanceOf(Date);
  });

  it('tracks actual_end when status changes to completed', async () => {
    const m = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Track end',
      scheduledStart: new Date(Date.now() + 60_000),
      scheduledEnd: new Date(Date.now() + 3_600_000),
      createdBy: ctx.user.id,
    });

    const updated = await service.update(m.id, ctx.organization.id, { status: 'completed' });
    expect(updated!.status).toBe('completed');
    expect(updated!.actualEnd).toBeInstanceOf(Date);
  });

  it('returns null for unknown maintenance', async () => {
    const result = await service.update(
      '00000000-0000-0000-0000-000000000000',
      ctx.organization.id,
      { title: 'x' }
    );
    expect(result).toBeNull();
  });
});

describe('MaintenanceService.delete', () => {
  it('deletes a maintenance', async () => {
    const m = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Delete me',
      scheduledStart: new Date(Date.now() + 60_000),
      scheduledEnd: new Date(Date.now() + 3_600_000),
      createdBy: ctx.user.id,
    });

    const deleted = await service.delete(m.id, ctx.organization.id);
    expect(deleted).toBe(true);

    const found = await service.getById(m.id, ctx.organization.id);
    expect(found).toBeNull();
  });

  it('returns false for unknown id', async () => {
    const deleted = await service.delete('00000000-0000-0000-0000-000000000000', ctx.organization.id);
    expect(deleted).toBe(false);
  });
});

describe('MaintenanceService.processMaintenanceTransitions', () => {
  it('transitions scheduled → in_progress when start time has passed', async () => {
    const m = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Auto start',
      scheduledStart: new Date(Date.now() - 1000), // already started
      scheduledEnd: new Date(Date.now() + 3_600_000),
      autoUpdateStatus: true,
      createdBy: ctx.user.id,
    });

    await service.processMaintenanceTransitions();

    const updated = await service.getById(m.id, ctx.organization.id);
    expect(updated!.status).toBe('in_progress');
  });

  it('transitions in_progress → completed when end time has passed', async () => {
    const m = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Auto end',
      scheduledStart: new Date(Date.now() - 7_200_000),
      scheduledEnd: new Date(Date.now() - 1000), // already ended
      autoUpdateStatus: true,
      createdBy: ctx.user.id,
    });
    // force to in_progress first
    await service.update(m.id, ctx.organization.id, { status: 'in_progress' });

    await service.processMaintenanceTransitions();

    const updated = await service.getById(m.id, ctx.organization.id);
    expect(updated!.status).toBe('completed');
  });

  it('does not auto-transition when autoUpdateStatus=false', async () => {
    const m = await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Manual only',
      scheduledStart: new Date(Date.now() - 1000),
      scheduledEnd: new Date(Date.now() + 3_600_000),
      autoUpdateStatus: false,
      createdBy: ctx.user.id,
    });

    await service.processMaintenanceTransitions();

    const updated = await service.getById(m.id, ctx.organization.id);
    expect(updated!.status).toBe('scheduled');
  });
});

describe('MaintenanceService.getProjectsUnderMaintenance', () => {
  it('returns projects with active in_progress maintenance', async () => {
    await service.create({
      organizationId: ctx.organization.id,
      projectId: ctx.project.id,
      title: 'Active',
      scheduledStart: new Date(Date.now() - 1000),
      scheduledEnd: new Date(Date.now() + 3_600_000),
      autoUpdateStatus: true,
      createdBy: ctx.user.id,
    });
    await service.processMaintenanceTransitions();

    const projects = await service.getProjectsUnderMaintenance();
    expect(projects.has(ctx.project.id)).toBe(true);
  });

  it('returns empty set when no active maintenance', async () => {
    const projects = await service.getProjectsUnderMaintenance();
    expect(projects.size).toBe(0);
  });
});
