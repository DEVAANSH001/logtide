import pg from 'pg';
import { MongoClient } from 'mongodb';
import type { EngineType } from '../src/index.js';
import { StorageEngineFactory } from '../src/index.js';
import type { StorageEngine } from '../src/index.js';
import { ENGINE_CONFIGS } from './config.js';

export interface EngineHandle {
  type: EngineType;
  engine: StorageEngine;
}

/**
 * Drop and recreate MongoDB database to ensure clean state.
 * Prevents stale time-series collections from blocking text index creation.
 */
async function resetMongoDb(config: typeof ENGINE_CONFIGS.mongodb): Promise<void> {
  const url = `mongodb://${config.username}:${config.password}@${config.host}:${config.port}/${config.database}?authSource=admin`;
  const client = new MongoClient(url);
  try {
    await client.connect();
    await client.db(config.database).dropDatabase();
    console.log('  [mongodb] reset database (dropped stale collections)');
  } finally {
    await client.close();
  }
}

/**
 * TimescaleDB's initialize() only creates the logs table.
 * Spans, traces, and metrics tables are normally created via backend migrations.
 * For the benchmark we create them directly, plus continuous aggregates.
 */
async function ensureTimescaleTables(config: typeof ENGINE_CONFIGS.timescale): Promise<void> {
  const pool = new pg.Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    max: 2,
  });

  try {
    // Traces table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.traces (
        trace_id TEXT NOT NULL,
        organization_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        root_service_name TEXT,
        root_operation_name TEXT,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ NOT NULL,
        duration_ms INTEGER NOT NULL,
        span_count INTEGER NOT NULL DEFAULT 0,
        error BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (trace_id, project_id)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_traces_project_time ON public.traces (project_id, start_time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_traces_service ON public.traces (service_name, start_time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_traces_error ON public.traces (error, start_time DESC) WHERE error = TRUE`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_traces_duration ON public.traces (duration_ms DESC)`);

    // Spans table (hypertable)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.spans (
        time TIMESTAMPTZ NOT NULL,
        span_id TEXT NOT NULL,
        trace_id TEXT NOT NULL,
        parent_span_id TEXT,
        organization_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        service_name TEXT NOT NULL,
        operation_name TEXT NOT NULL,
        start_time TIMESTAMPTZ NOT NULL,
        end_time TIMESTAMPTZ NOT NULL,
        duration_ms INTEGER NOT NULL,
        kind TEXT,
        status_code TEXT,
        status_message TEXT,
        attributes JSONB,
        events JSONB,
        links JSONB,
        resource_attributes JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (time, span_id)
      )
    `);
    try {
      await pool.query(`SELECT create_hypertable('public.spans', 'time', if_not_exists => TRUE)`);
    } catch { /* already a hypertable or not TimescaleDB */ }
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON public.spans (trace_id, time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spans_parent ON public.spans (parent_span_id, time DESC) WHERE parent_span_id IS NOT NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spans_project_time ON public.spans (project_id, time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_spans_service ON public.spans (service_name, time DESC)`);

    // Metrics table (hypertable)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.metrics (
        time TIMESTAMPTZ NOT NULL,
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        organization_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        metric_name TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        value DOUBLE PRECISION NOT NULL DEFAULT 0,
        is_monotonic BOOLEAN,
        service_name TEXT NOT NULL DEFAULT 'unknown',
        attributes JSONB,
        resource_attributes JSONB,
        histogram_data JSONB,
        has_exemplars BOOLEAN NOT NULL DEFAULT FALSE,
        PRIMARY KEY (time, id)
      )
    `);
    try {
      await pool.query(`SELECT create_hypertable('public.metrics', 'time', if_not_exists => TRUE)`);
    } catch { /* already a hypertable */ }
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_metrics_name_time ON public.metrics (metric_name, time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_metrics_project_name_time ON public.metrics (project_id, metric_name, time DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_metrics_service_time ON public.metrics (service_name, time DESC)`);

    // Metric exemplars table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.metric_exemplars (
        time TIMESTAMPTZ NOT NULL,
        id UUID NOT NULL DEFAULT gen_random_uuid(),
        metric_id UUID NOT NULL,
        project_id TEXT NOT NULL,
        exemplar_value DOUBLE PRECISION NOT NULL,
        exemplar_time TIMESTAMPTZ,
        trace_id TEXT,
        span_id TEXT,
        attributes JSONB,
        PRIMARY KEY (time, id)
      )
    `);
    try {
      await pool.query(`SELECT create_hypertable('public.metric_exemplars', 'time', if_not_exists => TRUE)`);
    } catch { /* already a hypertable */ }

    // Continuous aggregates for metric aggregation queries
    try {
      await pool.query(`
        CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_hourly_stats
        WITH (timescaledb.continuous) AS
        SELECT
          time_bucket('1 hour', time) AS bucket,
          project_id,
          metric_name,
          metric_type,
          service_name,
          COUNT(*) AS point_count,
          AVG(value) AS avg_value,
          SUM(value) AS sum_value,
          MIN(value) AS min_value,
          MAX(value) AS max_value
        FROM metrics
        GROUP BY bucket, project_id, metric_name, metric_type, service_name
        WITH NO DATA
      `);
      await pool.query(`
        SELECT add_continuous_aggregate_policy('metrics_hourly_stats',
          start_offset => INTERVAL '3 hours',
          end_offset => INTERVAL '1 hour',
          schedule_interval => INTERVAL '1 hour',
          if_not_exists => TRUE
        )
      `);
    } catch { /* continuous aggregates may already exist */ }

    console.log('  [timescale] created spans/traces/metrics tables + continuous aggregates');
  } finally {
    await pool.end();
  }
}

export async function createEngine(type: EngineType): Promise<EngineHandle> {
  const config = ENGINE_CONFIGS[type];

  // MongoDB: reset DB to remove stale time-series collections, then use regular collections
  if (type === 'mongodb') {
    await resetMongoDb(config);
  }

  const options = type === 'mongodb' ? { useTimeSeries: false } : undefined;
  const engine = StorageEngineFactory.create(type, config, options);

  console.log(`  [${type}] connecting...`);
  await engine.connect();

  console.log(`  [${type}] initializing schema...`);
  await engine.initialize();

  // TimescaleDB needs extra tables that are normally created via migrations
  if (type === 'timescale') {
    await ensureTimescaleTables(config);
  }

  const health = await engine.healthCheck();
  if (health.status === 'unhealthy') {
    throw new Error(`${type} engine is unhealthy: ${health.error}`);
  }
  console.log(`  [${type}] ready (${health.responseTimeMs}ms health check)`);

  return { type, engine };
}

export async function createEngines(types: EngineType[]): Promise<EngineHandle[]> {
  console.log('\n--- Initializing engines ---');
  const handles: EngineHandle[] = [];

  for (const type of types) {
    try {
      const handle = await createEngine(type);
      handles.push(handle);
    } catch (err) {
      console.error(`  [${type}] FAILED to initialize: ${err}`);
    }
  }

  if (handles.length === 0) {
    throw new Error('No engines could be initialized');
  }

  console.log(`  ${handles.length}/${types.length} engines ready\n`);
  return handles;
}

export async function destroyEngines(handles: EngineHandle[]): Promise<void> {
  console.log('\n--- Shutting down engines ---');
  for (const { type, engine } of handles) {
    try {
      await engine.disconnect();
      console.log(`  [${type}] disconnected`);
    } catch (err) {
      console.error(`  [${type}] error disconnecting: ${err}`);
    }
  }
}
