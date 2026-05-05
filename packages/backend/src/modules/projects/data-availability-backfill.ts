/**
 * One-shot backfill for project data-availability flags.
 *
 * Runs once per deployment (guarded by a row in `system_settings`). Walks every
 * project that has all three flags still NULL and checks, via the reservoir, if
 * any logs / traces / metrics exist. If so, sets the corresponding timestamp.
 *
 * Behaviour:
 *  - Fire-and-forget from server boot: never blocks readiness.
 *  - Idempotent: on a healthy deploy the safety flag is true and this function
 *    returns immediately.
 *  - Throttled: processes projects in small batches with a short pause between
 *    them so we do not pile load onto ClickHouse/Timescale/Mongo at boot time.
 */

import { sql } from 'kysely';
import { db } from '../../database/connection.js';
import { reservoir } from '../../database/reservoir.js';

const SAFETY_FLAG_KEY = 'data_availability.backfilled';
const BATCH_SIZE = 10;
const BATCH_PAUSE_MS = 50;

async function isBackfillDone(): Promise<boolean> {
  const row = await db
    .selectFrom('system_settings')
    .select('value')
    .where('key', '=', SAFETY_FLAG_KEY)
    .executeTakeFirst();
  return row?.value === true;
}

async function markBackfillDone(): Promise<void> {
  await db
    .insertInto('system_settings')
    .values({
      key: SAFETY_FLAG_KEY,
      value: sql`'true'::jsonb`,
      description: 'One-shot backfill of projects.has_X_at columns completed.',
      updated_by: null,
    })
    .onConflict((oc) =>
      oc.column('key').doUpdateSet({
        value: sql`'true'::jsonb`,
      }),
    )
    .execute();
}

async function hasLogs(projectId: string): Promise<boolean> {
  try {
    const result = await reservoir.query({
      projectId,
      from: new Date(0),
      to: new Date(),
      limit: 1,
    });
    return result.logs.length > 0;
  } catch {
    return false;
  }
}

async function hasTraces(projectId: string): Promise<boolean> {
  try {
    const result = await reservoir.queryTraces({
      projectId,
      from: new Date(0),
      to: new Date(),
      limit: 1,
    });
    return result.traces.length > 0;
  } catch {
    return false;
  }
}

async function hasMetrics(projectId: string): Promise<boolean> {
  try {
    const result = await reservoir.queryMetrics({
      projectId,
      from: new Date(0),
      to: new Date(),
      limit: 1,
    });
    return result.metrics.length > 0;
  } catch {
    return false;
  }
}

async function backfillProject(projectId: string): Promise<void> {
  const [logs, traces, metrics] = await Promise.all([
    hasLogs(projectId),
    hasTraces(projectId),
    hasMetrics(projectId),
  ]);

  if (!logs && !traces && !metrics) return;

  const now = new Date();
  const updates: Record<string, Date> = {};
  if (logs) updates.has_logs_at = now;
  if (traces) updates.has_traces_at = now;
  if (metrics) updates.has_metrics_at = now;

  await db.updateTable('projects').set(updates).where('id', '=', projectId).execute();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runDataAvailabilityBackfill(): Promise<void> {
  if (await isBackfillDone()) {
    return;
  }

  const projects = await db
    .selectFrom('projects')
    .select('id')
    .where('has_logs_at', 'is', null)
    .where('has_traces_at', 'is', null)
    .where('has_metrics_at', 'is', null)
    .execute();

  if (projects.length === 0) {
    await markBackfillDone();
    return;
  }

  console.log(
    `[data-availability] Backfilling ${projects.length} project(s). This is a one-shot at boot.`,
  );

  for (let i = 0; i < projects.length; i += BATCH_SIZE) {
    const batch = projects.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map((p) =>
        backfillProject(p.id).catch((err) => {
          console.warn(`[data-availability] Backfill failed for project ${p.id}:`, err);
        }),
      ),
    );
    if (i + BATCH_SIZE < projects.length) {
      await sleep(BATCH_PAUSE_MS);
    }
  }

  await markBackfillDone();
  console.log('[data-availability] Backfill complete.');
}
