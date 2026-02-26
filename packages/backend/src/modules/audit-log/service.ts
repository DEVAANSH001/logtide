import { db } from '../../database/index.js';
import type { AuditCategory } from '../../database/types.js';

export interface AuditLogEntry {
  organizationId: string | null;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  category: AuditCategory;
  resourceType?: string | null;
  resourceId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface AuditLogQueryParams {
  organizationId: string;
  category?: AuditCategory;
  action?: string;
  resourceType?: string;
  userId?: string;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditLogRow {
  id: string;
  time: Date;
  organization_id: string | null;
  user_id: string | null;
  user_email: string | null;
  action: string;
  category: string;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
}

export interface AuditLogResult {
  entries: AuditLogRow[];
  total: number;
}

const BUFFER_MAX = 50;
const FLUSH_INTERVAL_MS = 1000;

export class AuditLogService {
  private buffer: AuditLogEntry[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;

  start(): void {
    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
  }

  log(entry: AuditLogEntry): void {
    this.buffer.push(entry);
    if (this.buffer.length >= BUFFER_MAX) {
      void this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.flushing) return;
    this.flushing = true;

    const toInsert = this.buffer.splice(0, this.buffer.length);
    if (toInsert.length === 0) {
      this.flushing = false;
      return;
    }
    try {
      await db
        .insertInto('audit_log')
        .values(
          toInsert.map((e) => ({
            organization_id: e.organizationId,
            user_id: e.userId ?? null,
            user_email: e.userEmail ?? null,
            action: e.action,
            category: e.category,
            resource_type: e.resourceType ?? null,
            resource_id: e.resourceId ?? null,
            ip_address: e.ipAddress ?? null,
            user_agent: e.userAgent ?? null,
            metadata: e.metadata ?? null,
          }))
        )
        .execute();
    } catch (err) {
      console.error('[AuditLog] flush error:', err);
      this.buffer.unshift(...toInsert);
    } finally {
      this.flushing = false;
    }
  }

  async query(params: AuditLogQueryParams): Promise<AuditLogResult> {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    let baseQuery = db
      .selectFrom('audit_log')
      .where('organization_id', '=', params.organizationId);

    if (params.category) {
      baseQuery = baseQuery.where('category', '=', params.category);
    }
    if (params.action) {
      baseQuery = baseQuery.where('action', '=', params.action);
    }
    if (params.resourceType) {
      baseQuery = baseQuery.where('resource_type', '=', params.resourceType);
    }
    if (params.userId) {
      baseQuery = baseQuery.where('user_id', '=', params.userId);
    }
    if (params.from) {
      baseQuery = baseQuery.where('time', '>=', params.from);
    }
    if (params.to) {
      baseQuery = baseQuery.where('time', '<=', params.to);
    }

    const [entries, countResult] = await Promise.all([
      baseQuery
        .selectAll()
        .orderBy('time', 'desc')
        .limit(limit)
        .offset(offset)
        .execute(),
      baseQuery
        .select(db.fn.countAll<number>().as('count'))
        .executeTakeFirstOrThrow(),
    ]);

    return {
      entries: entries as AuditLogRow[],
      total: Number(countResult.count),
    };
  }

  async getDistinctActions(organizationId: string): Promise<string[]> {
    const results = await db
      .selectFrom('audit_log')
      .select('action')
      .distinct()
      .where('organization_id', '=', organizationId)
      .orderBy('action')
      .execute();
    return results.map((r) => r.action);
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) clearInterval(this.flushTimer);
    await this.flush();
  }
}

export const auditLogService = new AuditLogService();
