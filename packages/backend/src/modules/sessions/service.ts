import { db } from '../../database/index.js';
import { sql } from 'kysely';
import { reservoir } from '../../database/reservoir.js';

export interface SessionSummary {
  sessionId: string;
  service: string;
  firstEvent: string;
  lastEvent: string;
  durationMs: number;
  eventCount: number;
  errorCount: number;
}

export interface SessionListParams {
  projectId: string;
  from?: Date;
  to?: Date;
  hasErrors?: boolean;
  service?: string;
  limit: number;
  offset: number;
}

export interface SessionEventsParams {
  projectId: string;
  sessionId: string;
  limit?: number;
}

export interface SessionEvent {
  id: string;
  time: string;
  service: string;
  level: string;
  message: string;
  metadata?: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  sessionId?: string;
}

class SessionsService {
  /**
   * List sessions for a project, aggregated from logs.
   */
  async listSessions(params: SessionListParams): Promise<{
    sessions: SessionSummary[];
    total: number;
  }> {
    const { projectId, from, to, hasErrors, service, limit, offset } = params;

    // Build WHERE conditions
    const conditions: string[] = ['project_id = $1', 'session_id IS NOT NULL'];
    const values: unknown[] = [projectId];
    let idx = 2;

    if (from) {
      conditions.push(`time >= $${idx}`);
      values.push(from.toISOString());
      idx++;
    }
    if (to) {
      conditions.push(`time <= $${idx}`);
      values.push(to.toISOString());
      idx++;
    }
    if (service) {
      conditions.push(`service = $${idx}`);
      values.push(service);
      idx++;
    }

    const whereClause = conditions.join(' AND ');

    // Count total distinct sessions
    const countResult = await sql<{ count: string }>`
      SELECT COUNT(DISTINCT session_id) as count
      FROM logs
      WHERE ${sql.raw(whereClause)}
    `.execute(db);
    const total = parseInt(countResult.rows[0]?.count ?? '0', 10);

    // Aggregate sessions
    let havingClause = '';
    if (hasErrors === true) {
      havingClause = `HAVING COUNT(*) FILTER (WHERE level IN ('error', 'critical')) > 0`;
    } else if (hasErrors === false) {
      havingClause = `HAVING COUNT(*) FILTER (WHERE level IN ('error', 'critical')) = 0`;
    }

    const result = await sql<{
      session_id: string;
      service: string;
      first_event: Date;
      last_event: Date;
      event_count: string;
      error_count: string;
    }>`
      SELECT
        session_id,
        MIN(service) as service,
        MIN(time) as first_event,
        MAX(time) as last_event,
        COUNT(*)::text as event_count,
        COUNT(*) FILTER (WHERE level IN ('error', 'critical'))::text as error_count
      FROM logs
      WHERE ${sql.raw(whereClause)}
      GROUP BY session_id
      ${sql.raw(havingClause)}
      ORDER BY MAX(time) DESC
      LIMIT ${sql.raw(String(limit))}
      OFFSET ${sql.raw(String(offset))}
    `.execute(db);

    const sessions: SessionSummary[] = (result.rows ?? []).map((row: any) => {
      const firstEvent = new Date(row.first_event);
      const lastEvent = new Date(row.last_event);
      return {
        sessionId: row.session_id,
        service: row.service,
        firstEvent: firstEvent.toISOString(),
        lastEvent: lastEvent.toISOString(),
        durationMs: lastEvent.getTime() - firstEvent.getTime(),
        eventCount: parseInt(row.event_count, 10),
        errorCount: parseInt(row.error_count, 10),
      };
    });

    return { sessions, total };
  }

  /**
   * Get all events for a session, ordered chronologically.
   */
  async getSessionEvents(params: SessionEventsParams): Promise<SessionEvent[]> {
    const { projectId, sessionId, limit = 500 } = params;

    const result = await reservoir.query({
      projectId,
      sessionId,
      limit,
      offset: 0,
      from: new Date(0),
      to: new Date(),
      sortBy: 'time',
      sortOrder: 'asc',
    });

    return result.logs.map((row) => ({
      id: row.id ?? '',
      time: row.time instanceof Date ? row.time.toISOString() : String(row.time),
      service: row.service,
      level: row.level,
      message: row.message,
      metadata: row.metadata as Record<string, unknown> | undefined,
      traceId: row.traceId,
      spanId: row.spanId,
      sessionId: row.sessionId,
    }));
  }
}

export const sessionsService = new SessionsService();
