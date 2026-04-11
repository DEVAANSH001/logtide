import { db } from '../../database/connection.js';
import type { StatusIncidentStatus, StatusIncidentSeverity } from '../../database/types.js';

export interface StatusIncident {
  id: string;
  organizationId: string;
  projectId: string;
  title: string;
  status: StatusIncidentStatus;
  severity: StatusIncidentSeverity;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  resolvedAt: Date | null;
}

export interface StatusIncidentUpdate {
  id: string;
  incidentId: string;
  status: StatusIncidentStatus;
  message: string;
  createdBy: string | null;
  createdAt: Date;
}

export interface CreateStatusIncidentInput {
  organizationId: string;
  projectId: string;
  title: string;
  status?: StatusIncidentStatus;
  severity?: StatusIncidentSeverity;
  message?: string;
  createdBy: string;
}

export interface UpdateStatusIncidentInput {
  title?: string;
  status?: StatusIncidentStatus;
  severity?: StatusIncidentSeverity;
}

export class StatusIncidentService {
  async list(projectId: string, organizationId: string): Promise<StatusIncident[]> {
    const rows = await db
      .selectFrom('status_incidents')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('organization_id', '=', organizationId)
      .orderBy('created_at', 'desc')
      .execute();

    return rows.map(this.mapIncident);
  }

  async getById(id: string, organizationId: string): Promise<StatusIncident | null> {
    const row = await db
      .selectFrom('status_incidents')
      .selectAll()
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    return row ? this.mapIncident(row) : null;
  }

  async create(input: CreateStatusIncidentInput): Promise<StatusIncident> {
    return db.transaction().execute(async (trx) => {
      const row = await trx
        .insertInto('status_incidents')
        .values({
          organization_id: input.organizationId,
          project_id: input.projectId,
          title: input.title,
          status: input.status ?? 'investigating',
          severity: input.severity ?? 'minor',
          created_by: input.createdBy,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Create initial update if message provided
      if (input.message) {
        await trx
          .insertInto('status_incident_updates')
          .values({
            incident_id: row.id,
            status: row.status,
            message: input.message,
            created_by: input.createdBy,
          })
          .execute();
      }

      return this.mapIncident(row);
    });
  }

  async update(
    id: string,
    organizationId: string,
    input: UpdateStatusIncidentInput,
  ): Promise<StatusIncident | null> {
    const now = new Date();

    // Build resolved_at: set when resolving, clear when re-opening
    const resolvedAtUpdate = input.status === 'resolved'
      ? { resolved_at: now }
      : input.status !== undefined
        ? { resolved_at: null }
        : {};

    const row = await db
      .updateTable('status_incidents')
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.status !== undefined && { status: input.status }),
        ...(input.severity !== undefined && { severity: input.severity }),
        ...resolvedAtUpdate,
        updated_at: now,
      })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .returningAll()
      .executeTakeFirst();

    return row ? this.mapIncident(row) : null;
  }

  async delete(id: string, organizationId: string): Promise<boolean> {
    const result = await db
      .deleteFrom('status_incidents')
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .executeTakeFirst();

    return Number(result.numDeletedRows || 0) > 0;
  }

  // Updates (timeline entries)
  async getUpdates(incidentId: string): Promise<StatusIncidentUpdate[]> {
    const rows = await db
      .selectFrom('status_incident_updates')
      .selectAll()
      .where('incident_id', '=', incidentId)
      .orderBy('created_at', 'asc')
      .execute();

    return rows.map(this.mapUpdate);
  }

  async addUpdate(
    incidentId: string,
    organizationId: string,
    input: { status: StatusIncidentStatus; message: string; createdBy: string },
  ): Promise<StatusIncidentUpdate> {
    return db.transaction().execute(async (trx) => {
      // Verify incident belongs to org inside the transaction
      const incident = await trx
        .selectFrom('status_incidents')
        .select('id')
        .where('id', '=', incidentId)
        .where('organization_id', '=', organizationId)
        .executeTakeFirst();
      if (!incident) throw new Error('Incident not found');

      const row = await trx
        .insertInto('status_incident_updates')
        .values({
          incident_id: incidentId,
          status: input.status,
          message: input.message,
          created_by: input.createdBy,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Update parent incident status + resolved_at
      const now = new Date();
      await trx
        .updateTable('status_incidents')
        .set({
          status: input.status,
          updated_at: now,
          ...(input.status === 'resolved' ? { resolved_at: now } : { resolved_at: null }),
        })
        .where('id', '=', incidentId)
        .execute();

      return this.mapUpdate(row);
    });
  }

  private mapIncident(row: any): StatusIncident {
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      title: row.title,
      status: row.status,
      severity: row.severity,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : null,
    };
  }

  private mapUpdate(row: any): StatusIncidentUpdate {
    return {
      id: row.id,
      incidentId: row.incident_id,
      status: row.status,
      message: row.message,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
    };
  }
}

export const statusIncidentService = new StatusIncidentService();
