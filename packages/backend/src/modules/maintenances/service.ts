import { db } from '../../database/connection.js';
import type { MaintenanceStatus } from '../../database/types.js';

export interface Maintenance {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: MaintenanceStatus;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart: Date | null;
  actualEnd: Date | null;
  autoUpdateStatus: boolean;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMaintenanceInput {
  organizationId: string;
  projectId: string;
  title: string;
  description?: string;
  scheduledStart: Date;
  scheduledEnd: Date;
  autoUpdateStatus?: boolean;
  createdBy: string;
}

export interface UpdateMaintenanceInput {
  title?: string;
  description?: string;
  status?: MaintenanceStatus;
  scheduledStart?: Date;
  scheduledEnd?: Date;
  autoUpdateStatus?: boolean;
}

export class MaintenanceService {
  async list(projectId: string, organizationId: string): Promise<Maintenance[]> {
    const rows = await db
      .selectFrom('scheduled_maintenances')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('organization_id', '=', organizationId)
      .orderBy('scheduled_start', 'desc')
      .execute();

    return rows.map(this.mapMaintenance);
  }

  async getById(id: string, organizationId: string): Promise<Maintenance | null> {
    const row = await db
      .selectFrom('scheduled_maintenances')
      .selectAll()
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    return row ? this.mapMaintenance(row) : null;
  }

  async create(input: CreateMaintenanceInput): Promise<Maintenance> {
    const row = await db
      .insertInto('scheduled_maintenances')
      .values({
        organization_id: input.organizationId,
        project_id: input.projectId,
        title: input.title,
        description: input.description || null,
        scheduled_start: input.scheduledStart,
        scheduled_end: input.scheduledEnd,
        auto_update_status: input.autoUpdateStatus ?? true,
        created_by: input.createdBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapMaintenance(row);
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateMaintenanceInput,
  ): Promise<Maintenance | null> {
    const now = new Date();
    const row = await db
      .updateTable('scheduled_maintenances')
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.description !== undefined && { description: input.description || null }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.scheduledStart !== undefined && { scheduled_start: input.scheduledStart }),
        ...(input.scheduledEnd !== undefined && { scheduled_end: input.scheduledEnd }),
        ...(input.autoUpdateStatus !== undefined && { auto_update_status: input.autoUpdateStatus }),
        // Track actual start/end times
        ...(input.status === 'in_progress' && { actual_start: now }),
        ...(input.status === 'completed' && { actual_end: now }),
        updated_at: now,
      })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .returningAll()
      .executeTakeFirst();

    return row ? this.mapMaintenance(row) : null;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const result = await db
      .deleteFrom('scheduled_maintenances')
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    return Number(result.numDeletedRows || 0) > 0;
  }

  /**
   * Worker: transition scheduled → in_progress and in_progress → completed
   */
  async processMaintenanceTransitions(): Promise<void> {
    const now = new Date();

    // Only auto-transition maintenances with auto_update_status enabled
    // scheduled → in_progress: when scheduled_start has passed
    await db
      .updateTable('scheduled_maintenances')
      .set({ status: 'in_progress', actual_start: now, updated_at: now })
      .where('status', '=', 'scheduled')
      .where('auto_update_status', '=', true)
      .where('scheduled_start', '<=', now)
      .execute();

    // in_progress → completed: when scheduled_end has passed
    await db
      .updateTable('scheduled_maintenances')
      .set({ status: 'completed', actual_end: now, updated_at: now })
      .where('status', '=', 'in_progress')
      .where('auto_update_status', '=', true)
      .where('scheduled_end', '<=', now)
      .execute();
  }

  /**
   * Get project IDs that currently have active maintenance with auto_update_status
   * Used by monitor service to skip checks during maintenance
   */
  async getProjectsUnderMaintenance(): Promise<Set<string>> {
    const rows = await db
      .selectFrom('scheduled_maintenances')
      .select('project_id')
      .where('status', '=', 'in_progress')
      .where('auto_update_status', '=', true)
      .execute();

    return new Set(rows.map((r) => r.project_id));
  }

  private mapMaintenance(row: any): Maintenance {
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      title: row.title,
      description: row.description,
      status: row.status,
      scheduledStart: new Date(row.scheduled_start),
      scheduledEnd: new Date(row.scheduled_end),
      actualStart: row.actual_start ? new Date(row.actual_start) : null,
      actualEnd: row.actual_end ? new Date(row.actual_end) : null,
      autoUpdateStatus: row.auto_update_status,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}

export const maintenanceService = new MaintenanceService();
