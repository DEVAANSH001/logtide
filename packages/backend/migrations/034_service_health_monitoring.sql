-- ============================================================================
-- Migration 034: Service Health Monitoring
-- ============================================================================

-- 1. Add slug to projects
ALTER TABLE projects ADD COLUMN IF NOT EXISTS slug VARCHAR(255);

-- Generate slugs for existing projects (handles duplicate base slugs per org)
WITH ranked AS (
  SELECT
    id,
    organization_id,
    BTRIM(LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]+', '-', 'g')), '-') AS base_slug,
    ROW_NUMBER() OVER (
      PARTITION BY
        organization_id,
        BTRIM(LOWER(REGEXP_REPLACE(TRIM(name), '[^a-zA-Z0-9]+', '-', 'g')), '-')
      ORDER BY created_at
    ) AS rn
  FROM projects
)
UPDATE projects p
SET slug = CASE
  WHEN r.rn = 1 THEN r.base_slug
  ELSE r.base_slug || '-' || r.rn::text
END
FROM ranked r
WHERE p.id = r.id;

-- Fallback for names that produce empty slugs (all special chars)
UPDATE projects
SET slug = 'project-' || SUBSTRING(id::text, 1, 8)
WHERE slug IS NULL OR slug = '' OR slug = '-';

ALTER TABLE projects ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_slug ON projects (organization_id, slug);

-- ============================================================================
-- 2. Monitors table
-- ============================================================================

CREATE TABLE IF NOT EXISTS monitors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('http', 'tcp', 'heartbeat')),
  -- target: URL for HTTP, host:port for TCP, null for heartbeat
  target TEXT,
  interval_seconds INTEGER NOT NULL DEFAULT 60 CHECK (interval_seconds >= 30),
  timeout_seconds INTEGER NOT NULL DEFAULT 10 CHECK (timeout_seconds >= 1 AND timeout_seconds <= 60),
  failure_threshold INTEGER NOT NULL DEFAULT 2 CHECK (failure_threshold >= 1),
  auto_resolve BOOLEAN NOT NULL DEFAULT true,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monitors_project ON monitors (project_id);
CREATE INDEX IF NOT EXISTS idx_monitors_org ON monitors (organization_id);
CREATE INDEX IF NOT EXISTS idx_monitors_enabled ON monitors (enabled) WHERE enabled = true;

-- ============================================================================
-- 3. Monitor status table (current state, one row per monitor)
-- ============================================================================

CREATE TABLE IF NOT EXISTS monitor_status (
  monitor_id UUID PRIMARY KEY REFERENCES monitors(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'unknown' CHECK (status IN ('up', 'down', 'unknown')),
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  consecutive_successes INTEGER NOT NULL DEFAULT 0,
  last_checked_at TIMESTAMPTZ,
  last_status_change_at TIMESTAMPTZ,
  response_time_ms INTEGER,
  last_error_code VARCHAR(50),
  incident_id UUID REFERENCES incidents(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 4. Monitor results hypertable (time-series of all check results)
-- ============================================================================
-- Note: No FK on monitor_id for hypertable performance

CREATE TABLE IF NOT EXISTS monitor_results (
  time TIMESTAMPTZ NOT NULL,
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  monitor_id UUID NOT NULL,
  organization_id UUID NOT NULL,
  project_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('up', 'down')),
  response_time_ms INTEGER,
  status_code INTEGER,
  -- sanitized error code (never raw OS/network error messages)
  error_code VARCHAR(50),
  -- true when written by POST /monitors/:id/heartbeat, false for worker-initiated checks
  is_heartbeat BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (time, id)
);

SELECT create_hypertable('monitor_results', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_monitor_results_monitor ON monitor_results (monitor_id, time DESC);
CREATE INDEX IF NOT EXISTS idx_monitor_results_org ON monitor_results (organization_id, time DESC);

ALTER TABLE monitor_results SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'monitor_id',
  timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('monitor_results', INTERVAL '7 days', if_not_exists => TRUE);
SELECT add_retention_policy('monitor_results', INTERVAL '30 days', if_not_exists => TRUE);

-- ============================================================================
-- 5. Continuous aggregate: daily uptime percentage per monitor
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS monitor_uptime_daily
WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
SELECT
  time_bucket('1 day', time) AS bucket,
  monitor_id,
  organization_id,
  project_id,
  COUNT(*) AS total_checks,
  COUNT(*) FILTER (WHERE status = 'up') AS successful_checks,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE status = 'up') / NULLIF(COUNT(*), 0),
    2
  ) AS uptime_pct
FROM monitor_results
GROUP BY bucket, monitor_id, organization_id, project_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('monitor_uptime_daily',
  start_offset => INTERVAL '3 days',
  end_offset   => INTERVAL '1 minute',
  schedule_interval => INTERVAL '1 hour',
  if_not_exists => TRUE
);

-- ============================================================================
-- 6. Extend incidents table with source tracking
-- ============================================================================

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS source VARCHAR(50) NOT NULL DEFAULT 'sigma',
  ADD COLUMN IF NOT EXISTS monitor_id UUID REFERENCES monitors(id) ON DELETE SET NULL;

ALTER TABLE incidents
  ADD CONSTRAINT incidents_source_check
  CHECK (source IN ('sigma', 'monitor', 'manual'))
  NOT VALID;

CREATE INDEX IF NOT EXISTS idx_incidents_source ON incidents (source);
CREATE INDEX IF NOT EXISTS idx_incidents_monitor ON incidents (monitor_id) WHERE monitor_id IS NOT NULL;
