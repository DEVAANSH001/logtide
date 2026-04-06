// ============================================================================
// Panel Data Service
// ============================================================================
//
// Implements the PanelDataSource interface for each panel type. Adding a new
// panel type means adding a new fetcher object here and registering it in
// `dataFetchers`. No other backend file (routes, service, registry) needs to
// change to support a new data source.
//
// Each fetcher delegates to existing services (dashboardService, alertsService,
// reservoir) instead of duplicating query logic.

import type {
  PanelConfig,
  PanelType,
  TimeSeriesConfig,
  SingleStatConfig,
  TopNTableConfig,
  LiveLogStreamConfig,
  AlertStatusConfig,
} from '@logtide/shared';
import { dashboardService } from '../dashboard/service.js';
import { alertsService } from '../alerts/service.js';
import { reservoir } from '../../database/reservoir.js';

export interface PanelDataContext {
  organizationId: string;
  userId: string;
}

export interface PanelDataSource<TConfig extends PanelConfig, TData> {
  readonly type: PanelType;
  fetchData(config: TConfig, ctx: PanelDataContext): Promise<TData>;
}

// ─── Result types (frontend consumes these directly) ───────────────────────

export interface TimeSeriesPanelData {
  series: Array<{
    time: string;
    total: number;
    debug: number;
    info: number;
    warn: number;
    error: number;
    critical: number;
  }>;
  interval: string;
}

export interface SingleStatPanelData {
  value: number;
  trend: number; // signed delta vs previous period
  unit: string; // 'count' | 'percent' | 'rate'
  metric: SingleStatConfig['metric'];
}

export interface TopNTableData {
  rows: Array<{ key: string; count: number; percentage: number }>;
  total: number;
}

export interface LiveLogStreamSnapshot {
  logs: Array<{
    time: string;
    service: string;
    level: string;
    message: string;
    projectId: string;
    traceId?: string;
  }>;
}

export interface AlertStatusData {
  rules: Array<{
    id: string;
    name: string;
    enabled: boolean;
    lastTriggeredAt: string | null;
    triggerCount24h: number;
  }>;
  recentHistory: Array<{
    id: string;
    ruleName: string;
    triggeredAt: string;
    logCount: number;
  }>;
}

// ─── Fetchers ──────────────────────────────────────────────────────────────

const timeSeriesFetcher: PanelDataSource<TimeSeriesConfig, TimeSeriesPanelData> = {
  type: 'time_series',
  async fetchData(config, ctx) {
    // For now, the existing dashboardService.getTimeseries returns last 24h.
    // Interval other than 24h falls back to whatever the service supports;
    // future iterations can parameterize the time window in dashboardService.
    const series = await dashboardService.getTimeseries(
      ctx.organizationId,
      config.projectId ?? undefined
    );

    // Filter levels client-side based on config (the backend already returns
    // all levels per bucket - we zero out unwanted ones to keep the chart's
    // type stable).
    const allowed = new Set(config.levels);
    const filtered = series.map((point) => ({
      time: point.time,
      total: 0,
      debug: allowed.has('debug') ? point.debug : 0,
      info: allowed.has('info') ? point.info : 0,
      warn: allowed.has('warn') ? point.warn : 0,
      error: allowed.has('error') ? point.error : 0,
      critical: allowed.has('critical') ? point.critical : 0,
    }));
    for (const point of filtered) {
      point.total = point.debug + point.info + point.warn + point.error + point.critical;
    }

    return { series: filtered, interval: config.interval };
  },
};

const singleStatFetcher: PanelDataSource<SingleStatConfig, SingleStatPanelData> = {
  type: 'single_stat',
  async fetchData(config, ctx) {
    const stats = await dashboardService.getStats(
      ctx.organizationId,
      config.projectId ?? undefined
    );

    switch (config.metric) {
      case 'total_logs':
        return {
          value: stats.totalLogsToday.value,
          trend: stats.totalLogsToday.trend,
          unit: 'count',
          metric: 'total_logs',
        };
      case 'error_rate':
        return {
          value: stats.errorRate.value,
          trend: stats.errorRate.trend,
          unit: 'percent',
          metric: 'error_rate',
        };
      case 'active_services':
        return {
          value: stats.activeServices.value,
          trend: stats.activeServices.trend,
          unit: 'count',
          metric: 'active_services',
        };
      case 'throughput':
        return {
          value: stats.avgThroughput.value,
          trend: stats.avgThroughput.trend,
          unit: 'rate',
          metric: 'throughput',
        };
    }
  },
};

const topNTableFetcher: PanelDataSource<TopNTableConfig, TopNTableData> = {
  type: 'top_n_table',
  async fetchData(config, ctx) {
    if (config.dimension === 'service') {
      const services = await dashboardService.getTopServices(
        ctx.organizationId,
        config.limit,
        config.projectId ?? undefined
      );
      const total = services.reduce((sum, s) => sum + s.count, 0);
      return {
        rows: services.map((s) => ({
          key: s.name,
          count: s.count,
          percentage: s.percentage,
        })),
        total,
      };
    }

    // 'error_message': aggregate the most frequent error messages in the
    // selected time range. We use reservoir.topValues on the `message` field
    // restricted to error/critical levels.
    const projectIds = config.projectId
      ? [config.projectId]
      : await resolveProjectIdsForOrg(ctx.organizationId);

    if (projectIds.length === 0) {
      return { rows: [], total: 0 };
    }

    const now = new Date();
    const intervalMs = intervalToMs(config.interval);
    const from = new Date(now.getTime() - intervalMs);

    const top = await reservoir.topValues({
      field: 'message',
      projectId: projectIds,
      from,
      to: now,
      level: ['error', 'critical'],
      limit: config.limit,
    });

    const total = top.values.reduce(
      (sum: number, v: { count: number }) => sum + v.count,
      0
    );

    return {
      rows: top.values.map((v: { value: string; count: number }) => ({
        key: v.value,
        count: v.count,
        percentage: total > 0 ? Math.round((v.count / total) * 100) : 0,
      })),
      total,
    };
  },
};

const liveLogStreamFetcher: PanelDataSource<
  LiveLogStreamConfig,
  LiveLogStreamSnapshot
> = {
  type: 'live_log_stream',
  async fetchData(config, ctx) {
    // Snapshot fetch - the panel polls this endpoint every few seconds.
    // True SSE streaming is provided separately by the frontend if needed.
    const projectIds = config.projectId
      ? [config.projectId]
      : await resolveProjectIdsForOrg(ctx.organizationId);

    if (projectIds.length === 0) {
      return { logs: [] };
    }

    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const result = await reservoir.query({
      projectId: projectIds,
      level: config.levels,
      service: config.service ?? undefined,
      from: fiveMinAgo,
      to: now,
      limit: config.maxRows,
      sortOrder: 'desc',
    });

    return {
      logs: result.logs.map(
        (l: {
          time: Date;
          service: string;
          level: string;
          message: string;
          projectId: string;
          traceId?: string;
        }) => ({
          time: l.time.toISOString(),
          service: l.service,
          level: l.level,
          message: l.message,
          projectId: l.projectId || '',
          traceId: l.traceId,
        })
      ),
    };
  },
};

const alertStatusFetcher: PanelDataSource<AlertStatusConfig, AlertStatusData> = {
  type: 'alert_status',
  async fetchData(config, ctx) {
    const rules = await alertsService.getAlertRules(ctx.organizationId, {
      projectId: config.projectId,
      enabledOnly: false,
    });

    const filtered = config.ruleIds.length > 0
      ? rules.filter((r) => config.ruleIds.includes(r.id))
      : rules;

    const history = config.showHistory
      ? await alertsService.getAlertHistory(ctx.organizationId, {
          projectId: config.projectId ?? undefined,
          limit: config.limit,
        })
      : { history: [] as Array<{ id: string; ruleId: string; ruleName: string; triggeredAt: Date; logCount: number }> };

    // Build per-rule trigger counts from the history snapshot
    const triggerCounts = new Map<string, number>();
    const lastTriggered = new Map<string, Date>();
    for (const h of history.history) {
      triggerCounts.set(h.ruleId, (triggerCounts.get(h.ruleId) ?? 0) + 1);
      const existing = lastTriggered.get(h.ruleId);
      const triggeredAt = h.triggeredAt instanceof Date ? h.triggeredAt : new Date(h.triggeredAt);
      if (!existing || triggeredAt > existing) {
        lastTriggered.set(h.ruleId, triggeredAt);
      }
    }

    return {
      rules: filtered.slice(0, config.limit).map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled,
        lastTriggeredAt: lastTriggered.get(r.id)?.toISOString() ?? null,
        triggerCount24h: triggerCounts.get(r.id) ?? 0,
      })),
      recentHistory: history.history.slice(0, config.limit).map((h) => ({
        id: h.id,
        ruleName: h.ruleName,
        triggeredAt: (h.triggeredAt instanceof Date
          ? h.triggeredAt
          : new Date(h.triggeredAt)
        ).toISOString(),
        logCount: h.logCount,
      })),
    };
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

async function resolveProjectIdsForOrg(organizationId: string): Promise<string[]> {
  const { db } = await import('../../database/index.js');
  const rows = await db
    .selectFrom('projects')
    .select('id')
    .where('organization_id', '=', organizationId)
    .execute();
  return rows.map((r) => r.id);
}

/**
 * Verify the panel's projectId (if any) belongs to the context organization.
 * Prevents cross-org data leaks via maliciously crafted panel configs (e.g.
 * an attacker who imports a YAML referencing a foreign projectId, then queries
 * panel data and gets results from another org).
 */
async function ensureProjectInOrg(
  projectId: string | null | undefined,
  organizationId: string
): Promise<void> {
  if (!projectId) return;
  const { db } = await import('../../database/index.js');
  const row = await db
    .selectFrom('projects')
    .select('id')
    .where('id', '=', projectId)
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  if (!row) {
    throw new Error('Panel projectId does not belong to the requesting organization');
  }
}

function intervalToMs(interval: '1h' | '24h' | '7d'): number {
  switch (interval) {
    case '1h':
      return 60 * 60 * 1000;
    case '24h':
      return 24 * 60 * 60 * 1000;
    case '7d':
      return 7 * 24 * 60 * 60 * 1000;
  }
}

// ─── Registry ──────────────────────────────────────────────────────────────

type AnyFetcher = PanelDataSource<PanelConfig, unknown>;

const dataFetchers: Record<PanelType, AnyFetcher> = {
  time_series: timeSeriesFetcher as AnyFetcher,
  single_stat: singleStatFetcher as AnyFetcher,
  top_n_table: topNTableFetcher as AnyFetcher,
  live_log_stream: liveLogStreamFetcher as AnyFetcher,
  alert_status: alertStatusFetcher as AnyFetcher,
};

export async function fetchPanelData(
  config: PanelConfig,
  ctx: PanelDataContext
): Promise<unknown> {
  const fetcher = dataFetchers[config.type];
  if (!fetcher) {
    throw new Error(`No data fetcher registered for panel type: ${config.type}`);
  }

  // Cross-org isolation: every panel config that carries a projectId must
  // reference a project owned by the requesting org. This catches both
  // malicious imports and stale references after a project is moved/deleted.
  if ('projectId' in config) {
    await ensureProjectInOrg(config.projectId, ctx.organizationId);
  }

  return fetcher.fetchData(config, ctx);
}
