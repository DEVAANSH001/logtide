import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '../../../database/index.js';
import { createTestContext } from '../../helpers/factories.js';

// Mock reservoir to simulate ClickHouse engine - the activity_overview fetcher
// has a non-Timescale branch that goes through reservoir.aggregate() instead of
// hitting the logs_*_stats continuous aggregates / raw `logs` hypertable.
vi.mock('../../../database/reservoir.js', () => {
  return {
    reservoir: {
      getEngineType: vi.fn(() => 'clickhouse'),
      aggregate: vi.fn(async () => ({ timeseries: [], total: 0 })),
    },
  };
});

// Import AFTER the mock so the module under test picks up the mocked reservoir.
import { fetchPanelData } from '../../../modules/custom-dashboards/panel-data-service.js';
import { reservoir } from '../../../database/reservoir.js';

describe('activity_overview fetcher - non-Timescale path', () => {
  let projectId: string;
  let organizationId: string;

  beforeEach(async () => {
    // Clean tables touched by the fetcher / its auth check.
    await db.deleteFrom('alert_history').execute();
    await db.deleteFrom('alert_rules').execute();
    await db.deleteFrom('detection_events').execute();
    await db.deleteFrom('api_keys').execute();
    await db.deleteFrom('organization_members').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('organizations').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('users').execute();

    const ctx = await createTestContext();
    projectId = ctx.project.id;
    organizationId = ctx.organization.id;

    vi.clearAllMocks();
    vi.mocked(reservoir.getEngineType).mockReturnValue('clickhouse');
    vi.mocked(reservoir.aggregate).mockResolvedValue({ timeseries: [], total: 0 });
  });

  it('routes the logs query through reservoir.aggregate on ClickHouse', async () => {
    // One bucket aligned to the current hour with mixed levels.
    const bucket = new Date();
    bucket.setUTCMinutes(0, 0, 0);
    vi.mocked(reservoir.aggregate).mockResolvedValue({
      timeseries: [
        {
          bucket,
          total: 42,
          byLevel: { debug: 0, info: 30, warn: 8, error: 3, critical: 1 },
        },
      ],
      total: 42,
    });

    const result = (await fetchPanelData(
      {
        type: 'activity_overview',
        title: 'Activity',
        projectId,
        timeRange: '24h',
        series: ['logs', 'log_errors'],
      },
      { organizationId, userId: 'test-user' },
    )) as {
      series: Array<{ time: string; logs: number; log_errors: number }>;
      bucket: string;
    };

    expect(reservoir.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: [projectId],
        interval: '1h',
      }),
    );
    expect(result.bucket).toBe('hour');

    const hit = result.series.find((s) => new Date(s.time).getTime() === bucket.getTime());
    expect(hit).toBeDefined();
    expect(hit!.logs).toBe(42);
    // error + critical = 3 + 1 = 4
    expect(hit!.log_errors).toBe(4);
  });

  it('uses 1d interval for the 7d window', async () => {
    vi.mocked(reservoir.aggregate).mockResolvedValue({ timeseries: [], total: 0 });

    await fetchPanelData(
      {
        type: 'activity_overview',
        title: 'Activity',
        projectId,
        timeRange: '7d',
        series: ['logs'],
      },
      { organizationId, userId: 'test-user' },
    );

    expect(reservoir.aggregate).toHaveBeenCalledWith(
      expect.objectContaining({ interval: '1d' }),
    );
  });

  it('keeps the panel rendering with zero logs/spans when reservoir.aggregate rejects', async () => {
    vi.mocked(reservoir.aggregate).mockRejectedValue(new Error('clickhouse down'));

    const result = (await fetchPanelData(
      {
        type: 'activity_overview',
        title: 'Activity',
        projectId,
        timeRange: '24h',
        series: ['logs', 'log_errors'],
      },
      { organizationId, userId: 'test-user' },
    )) as { series: Array<{ logs: number; log_errors: number }> };

    expect(result.series.every((s) => s.logs === 0 && s.log_errors === 0)).toBe(true);
  });

  it('leaves spans/span_errors at zero on non-Timescale (no aggregateSpans primitive)', async () => {
    vi.mocked(reservoir.aggregate).mockResolvedValue({
      timeseries: [
        {
          bucket: (() => {
            const b = new Date();
            b.setUTCMinutes(0, 0, 0);
            return b;
          })(),
          total: 10,
          byLevel: { debug: 0, info: 10, warn: 0, error: 0, critical: 0 },
        },
      ],
      total: 10,
    });

    const result = (await fetchPanelData(
      {
        type: 'activity_overview',
        title: 'Activity',
        projectId,
        timeRange: '24h',
        series: ['logs', 'spans', 'span_errors'],
      },
      { organizationId, userId: 'test-user' },
    )) as { series: Array<{ logs: number; spans: number; span_errors: number }> };

    // logs filled from aggregate, spans/span_errors all zero (no aggregateSpans on
    // the IReservoir contract; trace_latency / trace_volume follow the same rule).
    expect(result.series.some((s) => s.logs > 0)).toBe(true);
    expect(result.series.every((s) => s.spans === 0 && s.span_errors === 0)).toBe(true);
  });
});
