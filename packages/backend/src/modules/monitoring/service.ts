import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../../database/types.js';
import type { SiemService } from '../siem/service.js';
import type {
  Monitor,
  MonitorResult,
  UptimeBucket,
  CreateMonitorInput,
  UpdateMonitorInput,
  CheckResult,
  PublicStatusPage,
  PublicMonitorStatus,
} from './types.js';
import { runHttpCheck, runTcpCheck, runHeartbeatCheck, parseTcpTarget } from './checker.js';

const MAX_CONCURRENT_CHECKS = 20;

function generateSlug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return base || 'project';
}

export class MonitorService {
  constructor(
    private db: Kysely<Database>,
    private siemService: SiemService
  ) {}

  // ============================================================================
  // CRUD
  // ============================================================================

  async listMonitors(organizationId: string, projectId?: string): Promise<Monitor[]> {
    let query = this.db
      .selectFrom('monitors')
      .leftJoin('monitor_status', 'monitor_status.monitor_id', 'monitors.id')
      .selectAll('monitors')
      .select([
        'monitor_status.status',
        'monitor_status.consecutive_failures',
        'monitor_status.consecutive_successes',
        'monitor_status.last_checked_at',
        'monitor_status.last_status_change_at',
        'monitor_status.response_time_ms as ms_response_time_ms',
        'monitor_status.last_error_code',
        'monitor_status.incident_id',
        'monitor_status.updated_at as ms_updated_at',
      ])
      .where('monitors.organization_id', '=', organizationId);

    if (projectId) {
      query = query.where('monitors.project_id', '=', projectId);
    }

    const rows = await query.orderBy('monitors.created_at', 'asc').execute();
    return rows.map(this.mapMonitor);
  }

  async getMonitor(id: string, organizationId: string): Promise<Monitor | null> {
    const row = await this.db
      .selectFrom('monitors')
      .leftJoin('monitor_status', 'monitor_status.monitor_id', 'monitors.id')
      .selectAll('monitors')
      .select([
        'monitor_status.status',
        'monitor_status.consecutive_failures',
        'monitor_status.consecutive_successes',
        'monitor_status.last_checked_at',
        'monitor_status.last_status_change_at',
        'monitor_status.response_time_ms as ms_response_time_ms',
        'monitor_status.last_error_code',
        'monitor_status.incident_id',
        'monitor_status.updated_at as ms_updated_at',
      ])
      .where('monitors.id', '=', id)
      .where('monitors.organization_id', '=', organizationId)
      .executeTakeFirst();

    return row ? this.mapMonitor(row) : null;
  }

  async createMonitor(input: CreateMonitorInput): Promise<Monitor> {
    const row = await this.db
      .insertInto('monitors')
      .values({
        organization_id: input.organizationId,
        project_id: input.projectId,
        name: input.name,
        type: input.type,
        target: input.target ?? null,
        interval_seconds: input.intervalSeconds ?? 60,
        timeout_seconds: input.timeoutSeconds ?? 10,
        failure_threshold: input.failureThreshold ?? 2,
        auto_resolve: input.autoResolve ?? true,
        enabled: input.enabled ?? true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    // Initialize status row
    await this.db
      .insertInto('monitor_status')
      .values({ monitor_id: row.id })
      .execute();

    return this.mapMonitor(row);
  }

  async updateMonitor(
    id: string,
    organizationId: string,
    input: UpdateMonitorInput
  ): Promise<Monitor> {
    const row = await this.db
      .updateTable('monitors')
      .set({
        ...(input.name !== undefined && { name: input.name }),
        ...(input.target !== undefined && { target: input.target }),
        ...(input.intervalSeconds !== undefined && { interval_seconds: input.intervalSeconds }),
        ...(input.timeoutSeconds !== undefined && { timeout_seconds: input.timeoutSeconds }),
        ...(input.failureThreshold !== undefined && { failure_threshold: input.failureThreshold }),
        ...(input.autoResolve !== undefined && { auto_resolve: input.autoResolve }),
        ...(input.enabled !== undefined && { enabled: input.enabled }),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .returningAll()
      .executeTakeFirstOrThrow();

    return this.mapMonitor(row);
  }

  async deleteMonitor(id: string, organizationId: string): Promise<void> {
    await this.db
      .deleteFrom('monitors')
      .where('id', '=', id)
      .where('organization_id', '=', organizationId)
      .execute();
  }

  // ============================================================================
  // HEARTBEAT
  // ============================================================================

  async recordHeartbeat(monitorId: string, organizationId: string): Promise<void> {
    const monitor = await this.db
      .selectFrom('monitors')
      .select(['id', 'type', 'project_id'])
      .where('id', '=', monitorId)
      .where('organization_id', '=', organizationId)
      .where('type', '=', 'heartbeat')
      .where('enabled', '=', true)
      .executeTakeFirst();

    if (!monitor) {
      throw new Error('Heartbeat monitor not found or not enabled');
    }

    await this.db
      .insertInto('monitor_results')
      .values({
        time: new Date(),
        monitor_id: monitorId,
        organization_id: organizationId,
        project_id: monitor.project_id,
        status: 'up',
        is_heartbeat: true,
      })
      .execute();
  }

  // ============================================================================
  // RESULTS & UPTIME
  // ============================================================================

  async getRecentResults(monitorId: string, organizationId: string, limit = 50): Promise<MonitorResult[]> {
    const rows = await this.db
      .selectFrom('monitor_results')
      .select(['time', 'id', 'monitor_id', 'status', 'response_time_ms', 'status_code', 'error_code', 'is_heartbeat'])
      .where('monitor_id', '=', monitorId)
      .where('organization_id', '=', organizationId)
      .orderBy('time', 'desc')
      .limit(limit)
      .execute();

    return rows.map((r) => ({
      time: r.time as Date,
      id: r.id,
      monitorId: r.monitor_id,
      status: r.status as 'up' | 'down',
      responseTimeMs: r.response_time_ms,
      statusCode: r.status_code,
      errorCode: r.error_code,
      isHeartbeat: r.is_heartbeat,
    }));
  }

  async getUptimeHistory(monitorId: string, organizationId: string, days = 90): Promise<UptimeBucket[]> {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await this.db
      .selectFrom('monitor_uptime_daily')
      .select(['bucket', 'monitor_id', 'total_checks', 'successful_checks', 'uptime_pct'])
      .where('monitor_id', '=', monitorId)
      .where('organization_id', '=', organizationId)
      .where('bucket', '>=', since)
      .orderBy('bucket', 'asc')
      .execute();

    return rows.map((r) => ({
      bucket: r.bucket as Date,
      monitorId: r.monitor_id,
      totalChecks: r.total_checks,
      successfulChecks: r.successful_checks,
      uptimePct: r.uptime_pct ?? 0,
    }));
  }

  // ============================================================================
  // PUBLIC STATUS PAGE (no auth — scrubbed data)
  // ============================================================================

  async getPublicStatus(projectSlug: string): Promise<PublicStatusPage | null> {
    const project = await this.db
      .selectFrom('projects')
      .select(['id', 'name', 'slug'])
      .where('slug', '=', projectSlug)
      .executeTakeFirst();

    if (!project) return null;

    const monitorRows = await this.db
      .selectFrom('monitors')
      .leftJoin('monitor_status', 'monitor_status.monitor_id', 'monitors.id')
      .select([
        'monitors.id',
        'monitors.name',
        'monitors.type',
        'monitor_status.status',
        'monitor_status.last_checked_at',
      ])
      .where('monitors.project_id', '=', project.id)
      .where('monitors.enabled', '=', true)
      .orderBy('monitors.created_at', 'asc')
      .execute();

    if (monitorRows.length === 0) {
      return {
        projectName: project.name,
        projectSlug: project.slug,
        overallStatus: 'operational',
        monitors: [],
        lastUpdated: new Date().toISOString(),
      };
    }

    const monitorIds = monitorRows.map((m) => m.id);
    const since90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

    const uptimeRows = await this.db
      .selectFrom('monitor_uptime_daily')
      .select(['bucket', 'monitor_id', 'uptime_pct'])
      .where('monitor_id', 'in', monitorIds)
      .where('bucket', '>=', since90d)
      .orderBy('bucket', 'asc')
      .execute();

    // Group uptime by monitor
    const uptimeByMonitor = new Map<string, { bucket: string; uptimePct: number }[]>();
    for (const row of uptimeRows) {
      const id = row.monitor_id;
      if (!uptimeByMonitor.has(id)) uptimeByMonitor.set(id, []);
      uptimeByMonitor.get(id)!.push({
        bucket: (row.bucket as Date).toISOString(),
        uptimePct: row.uptime_pct ?? 0,
      });
    }

    const monitors: PublicMonitorStatus[] = monitorRows.map((m) => ({
      name: m.name,
      type: m.type,
      status: (m.status ?? 'unknown') as 'up' | 'down' | 'unknown',
      uptimeHistory: uptimeByMonitor.get(m.id) ?? [],
    }));

    const downCount = monitors.filter((m) => m.status === 'down').length;
    const overallStatus =
      downCount === 0
        ? 'operational'
        : downCount === monitors.length
          ? 'outage'
          : 'degraded';

    return {
      projectName: project.name,
      projectSlug: project.slug,
      overallStatus,
      monitors,
      lastUpdated: new Date().toISOString(),
    };
  }

  // ============================================================================
  // WORKER: run all due checks
  // ============================================================================

  async runAllDueChecks(): Promise<void> {
    const now = new Date();

    // Find enabled monitors where next check is due
    const due = await this.db
      .selectFrom('monitors')
      .leftJoin('monitor_status', 'monitor_status.monitor_id', 'monitors.id')
      .selectAll('monitors')
      .select([
        'monitor_status.status',
        'monitor_status.consecutive_failures',
        'monitor_status.consecutive_successes',
        'monitor_status.last_checked_at',
        'monitor_status.last_status_change_at',
        'monitor_status.response_time_ms as ms_response_time_ms',
        'monitor_status.last_error_code',
        'monitor_status.incident_id',
        'monitor_status.updated_at as ms_updated_at',
      ])
      .where('monitors.enabled', '=', true)
      .where((eb) =>
        eb.or([
          eb('monitor_status.last_checked_at', 'is', null),
          eb(
            sql<Date>`monitor_status.last_checked_at + monitors.interval_seconds * interval '1 second'`,
            '<=',
            now
          ),
        ])
      )
      .execute();

    if (due.length === 0) return;

    // Process in batches of MAX_CONCURRENT_CHECKS
    for (let i = 0; i < due.length; i += MAX_CONCURRENT_CHECKS) {
      const batch = due.slice(i, i + MAX_CONCURRENT_CHECKS);
      await Promise.allSettled(batch.map((row) => this.runCheck(this.mapMonitor(row))));
    }
  }

  async runCheck(monitor: Monitor): Promise<void> {
    let result: CheckResult;

    try {
      if (monitor.type === 'http') {
        result = await runHttpCheck(monitor.target!, monitor.timeoutSeconds);
      } else if (monitor.type === 'tcp') {
        const { host, port } = parseTcpTarget(monitor.target!);
        result = await runTcpCheck(host, port, monitor.timeoutSeconds);
      } else {
        result = await runHeartbeatCheck(monitor.id, monitor.intervalSeconds, this.db);
      }
    } catch {
      result = { status: 'down', responseTimeMs: null, statusCode: null, errorCode: 'unexpected' };
    }

    // Heartbeat 'up' results are recorded by the endpoint, not the worker
    const skipWrite = monitor.type === 'heartbeat' && result.status === 'up';

    if (!skipWrite) {
      await this.db
        .insertInto('monitor_results')
        .values({
          time: new Date(),
          monitor_id: monitor.id,
          organization_id: monitor.organizationId,
          project_id: monitor.projectId,
          status: result.status,
          response_time_ms: result.responseTimeMs,
          status_code: result.statusCode,
          error_code: result.errorCode,
          is_heartbeat: false,
        })
        .execute();
    }

    await this.processCheckResult(monitor, result);
  }

  // ============================================================================
  // STATE MACHINE
  // ============================================================================

  private async processCheckResult(monitor: Monitor, result: CheckResult): Promise<void> {
    const currentStatus = await this.db
      .selectFrom('monitor_status')
      .selectAll()
      .where('monitor_id', '=', monitor.id)
      .executeTakeFirst();

    if (!currentStatus) return;

    const prevConsecutiveFailures = currentStatus.consecutive_failures;
    const prevStatus = currentStatus.status as 'up' | 'down' | 'unknown';
    const now = new Date();

    if (result.status === 'down') {
      const newFailures = prevConsecutiveFailures + 1;
      const statusChanged = prevStatus !== 'down';

      await this.db
        .updateTable('monitor_status')
        .set({
          status: 'down',
          consecutive_failures: newFailures,
          consecutive_successes: 0,
          last_checked_at: now,
          last_status_change_at: statusChanged ? now : currentStatus.last_status_change_at,
          last_error_code: result.errorCode,
          response_time_ms: result.responseTimeMs,
          updated_at: now,
        })
        .where('monitor_id', '=', monitor.id)
        .execute();

      // Open incident when threshold is first reached and no active incident exists.
      // Use atomic WHERE guard to prevent duplicate incidents under concurrent checks.
      if (
        newFailures >= monitor.failureThreshold &&
        prevConsecutiveFailures < monitor.failureThreshold
      ) {
        // Atomically claim incident slot: only proceed if incident_id is still null
        const claimed = await this.db
          .updateTable('monitor_status')
          .set({ updated_at: new Date() })
          .where('monitor_id', '=', monitor.id)
          .where('incident_id', 'is', null)
          .executeTakeFirst();

        if (Number(claimed?.numUpdatedRows ?? 0) > 0) {
          await this.openIncident(monitor);
        }
      }
    } else {
      const newSuccesses = (currentStatus.consecutive_successes ?? 0) + 1;
      const statusChanged = prevStatus !== 'up';

      await this.db
        .updateTable('monitor_status')
        .set({
          status: 'up',
          consecutive_failures: 0,
          consecutive_successes: newSuccesses,
          last_checked_at: now,
          last_status_change_at: statusChanged ? now : currentStatus.last_status_change_at,
          last_error_code: null,
          response_time_ms: result.responseTimeMs,
          updated_at: now,
        })
        .where('monitor_id', '=', monitor.id)
        .execute();

      // Auto-resolve linked incident on recovery
      if (monitor.autoResolve && currentStatus.incident_id && prevStatus === 'down') {
        await this.resolveIncident(currentStatus.incident_id, monitor.organizationId);
        await this.db
          .updateTable('monitor_status')
          .set({ incident_id: null, updated_at: now })
          .where('monitor_id', '=', monitor.id)
          .execute();
      }
    }
  }

  private async openIncident(monitor: Monitor): Promise<void> {
    try {
      const incident = await this.siemService.createIncident({
        organizationId: monitor.organizationId,
        projectId: monitor.projectId,
        title: `Monitor down: ${monitor.name}`,
        severity: 'high',
        status: 'open',
        affectedServices: [monitor.name],
        source: 'monitor',
        monitorId: monitor.id,
      });

      await this.db
        .updateTable('monitor_status')
        .set({ incident_id: incident.id, updated_at: new Date() })
        .where('monitor_id', '=', monitor.id)
        .execute();
    } catch (err) {
      console.error(`[MonitorService] Failed to open incident for monitor ${monitor.id}:`, err);
    }
  }

  private async resolveIncident(incidentId: string, organizationId: string): Promise<void> {
    try {
      await this.siemService.updateIncident(incidentId, organizationId, { status: 'resolved' });
    } catch (err) {
      console.error(`[MonitorService] Failed to resolve incident ${incidentId}:`, err);
    }
  }

  // ============================================================================
  // SLUG GENERATION (for project creation)
  // ============================================================================

  static generateProjectSlug(name: string): string {
    return generateSlug(name);
  }

  // ============================================================================
  // MAPPERS
  // ============================================================================

  private mapMonitor(row: any): Monitor {
    const hasStatus = row.status !== undefined || row.consecutive_failures !== undefined;
    return {
      id: row.id,
      organizationId: row.organization_id,
      projectId: row.project_id,
      name: row.name,
      type: row.type,
      target: row.target,
      intervalSeconds: row.interval_seconds,
      timeoutSeconds: row.timeout_seconds,
      failureThreshold: row.failure_threshold,
      autoResolve: row.auto_resolve,
      enabled: row.enabled,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      status: hasStatus
        ? {
            monitorId: row.id,
            status: row.status ?? 'unknown',
            consecutiveFailures: row.consecutive_failures ?? 0,
            consecutiveSuccesses: row.consecutive_successes ?? 0,
            lastCheckedAt: row.last_checked_at ?? null,
            lastStatusChangeAt: row.last_status_change_at ?? null,
            responseTimeMs: row.ms_response_time_ms ?? null,
            lastErrorCode: row.last_error_code ?? null,
            incidentId: row.incident_id ?? null,
            updatedAt: row.ms_updated_at ?? row.updated_at,
          }
        : undefined,
    };
  }
}
