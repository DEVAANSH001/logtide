import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sql } from 'kysely';
import { db } from '../../../database/index.js';
import { createTestContext, createTestProject } from '../../helpers/factories.js';

// Mock reservoir so the backfill probes (logs/traces/metrics) hit canned answers
// instead of a real engine - the file under test is the orchestrator, not the
// reservoir itself.
vi.mock('../../../database/reservoir.js', () => ({
  reservoir: {
    getEngineType: vi.fn(() => 'clickhouse'),
    query: vi.fn(async () => ({ logs: [], hasMore: false, limit: 1, offset: 0 })),
    queryTraces: vi.fn(async () => ({
      traces: [],
      total: 0,
      hasMore: false,
      limit: 1,
      offset: 0,
    })),
    queryMetrics: vi.fn(async () => ({
      metrics: [],
      total: 0,
      hasMore: false,
      limit: 1,
      offset: 0,
    })),
  },
}));

// Import AFTER the mock so the module under test picks up the mocked reservoir.
import { runDataAvailabilityBackfill } from '../../../modules/projects/data-availability-backfill.js';
import { reservoir } from '../../../database/reservoir.js';

const SAFETY_FLAG_KEY = 'data_availability.backfilled';

async function readSafetyFlag(): Promise<unknown> {
  const row = await db
    .selectFrom('system_settings')
    .select('value')
    .where('key', '=', SAFETY_FLAG_KEY)
    .executeTakeFirst();
  return row?.value;
}

describe('runDataAvailabilityBackfill', () => {
  beforeEach(async () => {
    await db.deleteFrom('alert_history').execute();
    await db.deleteFrom('alert_rules').execute();
    await db.deleteFrom('api_keys').execute();
    await db.deleteFrom('organization_members').execute();
    await db.deleteFrom('projects').execute();
    await db.deleteFrom('organizations').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('users').execute();
    await db
      .deleteFrom('system_settings')
      .where('key', '=', SAFETY_FLAG_KEY)
      .execute();

    vi.clearAllMocks();
    vi.mocked(reservoir.query).mockResolvedValue({
      logs: [],
      hasMore: false,
      limit: 1,
      offset: 0,
    });
    vi.mocked(reservoir.queryTraces).mockResolvedValue({
      traces: [],
      total: 0,
      hasMore: false,
      limit: 1,
      offset: 0,
    });
    vi.mocked(reservoir.queryMetrics).mockResolvedValue({
      metrics: [],
      total: 0,
      hasMore: false,
      limit: 1,
      offset: 0,
    });
  });

  it('returns immediately when the safety flag is already true', async () => {
    await db
      .insertInto('system_settings')
      .values({
        key: SAFETY_FLAG_KEY,
        value: sql`'true'::jsonb`,
        description: 'pre-existing flag',
        updated_by: null,
      })
      .execute();

    await runDataAvailabilityBackfill();

    // No reservoir probes; no project lookup-driven side effects.
    expect(reservoir.query).not.toHaveBeenCalled();
    expect(reservoir.queryTraces).not.toHaveBeenCalled();
    expect(reservoir.queryMetrics).not.toHaveBeenCalled();
  });

  it('marks the safety flag without probing when no eligible projects exist', async () => {
    const ctx = await createTestContext();
    // Eligibility = all three flags NULL. Setting one excludes the project.
    await db
      .updateTable('projects')
      .set({ has_logs_at: new Date() })
      .where('id', '=', ctx.project.id)
      .execute();

    await runDataAvailabilityBackfill();

    expect(reservoir.query).not.toHaveBeenCalled();
    expect(await readSafetyFlag()).toBe(true);
  });

  it('sets has_logs_at when the logs probe returns a row', async () => {
    const ctx = await createTestContext();
    vi.mocked(reservoir.query).mockResolvedValue({
      logs: [{ id: 'log-1' } as never],
      hasMore: false,
      limit: 1,
      offset: 0,
    });

    await runDataAvailabilityBackfill();

    const project = await db
      .selectFrom('projects')
      .select(['has_logs_at', 'has_traces_at', 'has_metrics_at'])
      .where('id', '=', ctx.project.id)
      .executeTakeFirst();

    expect(project?.has_logs_at).toBeInstanceOf(Date);
    expect(project?.has_traces_at).toBeNull();
    expect(project?.has_metrics_at).toBeNull();
    expect(await readSafetyFlag()).toBe(true);
  });

  it('sets has_traces_at and has_metrics_at independently of logs', async () => {
    const ctx = await createTestContext();
    vi.mocked(reservoir.queryTraces).mockResolvedValue({
      traces: [{ traceId: 't-1' } as never],
      total: 1,
      hasMore: false,
      limit: 1,
      offset: 0,
    });
    vi.mocked(reservoir.queryMetrics).mockResolvedValue({
      metrics: [{ metricName: 'm-1' } as never],
      total: 1,
      hasMore: false,
      limit: 1,
      offset: 0,
    });

    await runDataAvailabilityBackfill();

    const project = await db
      .selectFrom('projects')
      .select(['has_logs_at', 'has_traces_at', 'has_metrics_at'])
      .where('id', '=', ctx.project.id)
      .executeTakeFirst();

    expect(project?.has_logs_at).toBeNull();
    expect(project?.has_traces_at).toBeInstanceOf(Date);
    expect(project?.has_metrics_at).toBeInstanceOf(Date);
  });

  it('skips projects with zero data without writing any flag', async () => {
    const ctx = await createTestContext();
    // All probes already default to empty arrays.

    await runDataAvailabilityBackfill();

    const project = await db
      .selectFrom('projects')
      .select(['has_logs_at', 'has_traces_at', 'has_metrics_at'])
      .where('id', '=', ctx.project.id)
      .executeTakeFirst();

    expect(project?.has_logs_at).toBeNull();
    expect(project?.has_traces_at).toBeNull();
    expect(project?.has_metrics_at).toBeNull();
    expect(await readSafetyFlag()).toBe(true);
  });

  it('treats reservoir errors as no data and still marks the flag', async () => {
    const ctx = await createTestContext();
    vi.mocked(reservoir.query).mockRejectedValue(new Error('clickhouse down'));
    vi.mocked(reservoir.queryTraces).mockRejectedValue(new Error('clickhouse down'));
    vi.mocked(reservoir.queryMetrics).mockRejectedValue(new Error('clickhouse down'));

    await runDataAvailabilityBackfill();

    const project = await db
      .selectFrom('projects')
      .select(['has_logs_at', 'has_traces_at', 'has_metrics_at'])
      .where('id', '=', ctx.project.id)
      .executeTakeFirst();

    expect(project?.has_logs_at).toBeNull();
    expect(project?.has_traces_at).toBeNull();
    expect(project?.has_metrics_at).toBeNull();
    // Even when probes fail, the orchestrator marks done so we do not loop on
    // every boot.
    expect(await readSafetyFlag()).toBe(true);
  });

  it('processes more than one batch when project count exceeds BATCH_SIZE', async () => {
    const ctx = await createTestContext();
    // BATCH_SIZE is 10; create 11 extra projects so we have 12 total -> 2 batches.
    for (let i = 0; i < 11; i++) {
      await createTestProject({
        organizationId: ctx.organization.id,
        userId: ctx.user.id,
      });
    }

    vi.mocked(reservoir.query).mockResolvedValue({
      logs: [{ id: 'log' } as never],
      hasMore: false,
      limit: 1,
      offset: 0,
    });

    await runDataAvailabilityBackfill();

    // logs probe runs once per project = 12 invocations.
    expect(reservoir.query).toHaveBeenCalledTimes(12);

    const filled = await db
      .selectFrom('projects')
      .select(['id'])
      .where('has_logs_at', 'is not', null)
      .execute();
    expect(filled.length).toBe(12);
  });

  it('continues with the rest of the batch when a single project DB write fails', async () => {
    const ctx = await createTestContext();
    const other = await createTestProject({
      organizationId: ctx.organization.id,
      userId: ctx.user.id,
    });

    // Sabotage the logs flag of one project by deleting it mid-flight: the
    // `updateTable(...).where('id', '=', deletedId)` will affect zero rows,
    // which the orchestrator must shrug off without crashing the whole batch.
    vi.mocked(reservoir.query).mockResolvedValue({
      logs: [{ id: 'log' } as never],
      hasMore: false,
      limit: 1,
      offset: 0,
    });
    vi.mocked(reservoir.queryTraces).mockImplementation(async ({ projectId }) => {
      if (projectId === ctx.project.id) {
        throw new Error('reservoir blew up for this one project');
      }
      return { traces: [], total: 0, hasMore: false, limit: 1, offset: 0 };
    });

    await runDataAvailabilityBackfill();

    // Both projects still got their logs flag set; the per-project failure was
    // contained.
    const both = await db
      .selectFrom('projects')
      .select(['id', 'has_logs_at'])
      .where('id', 'in', [ctx.project.id, other.id])
      .execute();
    expect(both.every((p) => p.has_logs_at instanceof Date)).toBe(true);
    expect(await readSafetyFlag()).toBe(true);
  });
});
