-- ============================================================================
-- Migration 028: Continuous Aggregates for Metrics Dashboard
-- ============================================================================
-- Pre-compute metric aggregations for fast dashboard rendering.
-- Follows the same pattern as spans_hourly_stats (migration 019).
--
-- Aggregates: point_count, avg, sum, min, max per (metric_name, service_name)
-- per project per time bucket.
-- ============================================================================

-- ============================================================================
-- 1. HOURLY METRICS STATISTICS
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS metrics_hourly_stats CASCADE;

CREATE MATERIALIZED VIEW metrics_hourly_stats
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
WITH NO DATA;

SELECT add_continuous_aggregate_policy('metrics_hourly_stats',
  start_offset => INTERVAL '3 hours',
  end_offset => INTERVAL '1 hour',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_metrics_hourly_project_name_bucket
  ON metrics_hourly_stats (project_id, metric_name, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_hourly_project_service_bucket
  ON metrics_hourly_stats (project_id, service_name, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_hourly_project_bucket
  ON metrics_hourly_stats (project_id, bucket DESC);

-- ============================================================================
-- 2. DAILY METRICS STATISTICS
-- ============================================================================

DROP MATERIALIZED VIEW IF EXISTS metrics_daily_stats CASCADE;

CREATE MATERIALIZED VIEW metrics_daily_stats
WITH (timescaledb.continuous) AS
SELECT
  time_bucket('1 day', time) AS bucket,
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
WITH NO DATA;

SELECT add_continuous_aggregate_policy('metrics_daily_stats',
  start_offset => INTERVAL '3 days',
  end_offset => INTERVAL '1 day',
  schedule_interval => INTERVAL '1 day',
  if_not_exists => TRUE
);

CREATE INDEX IF NOT EXISTS idx_metrics_daily_project_name_bucket
  ON metrics_daily_stats (project_id, metric_name, bucket DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_daily_project_service_bucket
  ON metrics_daily_stats (project_id, service_name, bucket DESC);
