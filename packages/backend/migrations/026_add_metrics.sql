-- ============================================================================
-- Migration 026: OTLP Metrics Ingestion
-- ============================================================================

CREATE TABLE IF NOT EXISTS metrics (
  time              TIMESTAMPTZ     NOT NULL,
  id                UUID            NOT NULL DEFAULT gen_random_uuid(),
  organization_id   UUID            NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id        UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  metric_name       TEXT            NOT NULL,
  metric_type       TEXT            NOT NULL,
  value             DOUBLE PRECISION NOT NULL DEFAULT 0,
  is_monotonic      BOOLEAN,
  service_name      TEXT            NOT NULL DEFAULT 'unknown',
  attributes        JSONB,
  resource_attributes JSONB,
  histogram_data    JSONB,
  has_exemplars     BOOLEAN         NOT NULL DEFAULT FALSE,
  PRIMARY KEY (time, id)
);

SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_metrics_name_time
  ON metrics (metric_name, time DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_project_name_time
  ON metrics (project_id, metric_name, time DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_service_time
  ON metrics (service_name, time DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_type
  ON metrics (metric_type, time DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_attributes
  ON metrics USING GIN (attributes jsonb_path_ops);

CREATE INDEX IF NOT EXISTS idx_metrics_org_time
  ON metrics (organization_id, time DESC);

-- ============================================================================
-- METRIC EXEMPLARS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS metric_exemplars (
  time              TIMESTAMPTZ     NOT NULL,
  id                UUID            NOT NULL DEFAULT gen_random_uuid(),
  metric_id         UUID            NOT NULL,
  project_id        UUID            NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  exemplar_value    DOUBLE PRECISION NOT NULL,
  exemplar_time     TIMESTAMPTZ,
  trace_id          TEXT,
  span_id           TEXT,
  attributes        JSONB,
  PRIMARY KEY (time, id)
);

SELECT create_hypertable('metric_exemplars', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_exemplars_metric_id
  ON metric_exemplars (metric_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_exemplars_trace_id
  ON metric_exemplars (trace_id, time DESC) WHERE trace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_exemplars_project_time
  ON metric_exemplars (project_id, time DESC);

-- ============================================================================
-- COMPRESSION POLICIES
-- ============================================================================

ALTER TABLE metrics SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'project_id, metric_name',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('metrics', INTERVAL '7 days', if_not_exists => TRUE);

ALTER TABLE metric_exemplars SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'project_id',
  timescaledb.compress_orderby = 'time DESC'
);
SELECT add_compression_policy('metric_exemplars', INTERVAL '7 days', if_not_exists => TRUE);

-- ============================================================================
-- RETENTION POLICIES (default 90 days, org-configurable like logs)
-- ============================================================================

SELECT add_retention_policy('metrics', INTERVAL '90 days', if_not_exists => TRUE);
SELECT add_retention_policy('metric_exemplars', INTERVAL '90 days', if_not_exists => TRUE);
