-- Migration 025: Audit log table
-- Append-only table for compliance audit trail
-- TimescaleDB hypertable for automatic compression and retention

CREATE TABLE IF NOT EXISTS audit_log (
  time             TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  id               UUID         NOT NULL DEFAULT gen_random_uuid(),
  PRIMARY KEY (time, id),

  organization_id  UUID,
  user_id          UUID,
  user_email       TEXT,
  action           TEXT         NOT NULL,
  category         TEXT         NOT NULL,
  resource_type    TEXT,
  resource_id      TEXT,
  ip_address       TEXT,
  user_agent       TEXT,
  metadata         JSONB,

  CONSTRAINT audit_log_category_check CHECK (
    category IN ('log_access', 'config_change', 'user_management', 'data_modification')
  )
);

SELECT create_hypertable('audit_log', 'time',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => TRUE
);

ALTER TABLE audit_log SET (
  timescaledb.compress,
  timescaledb.compress_segmentby = 'organization_id',
  timescaledb.compress_orderby = 'time DESC'
);

SELECT add_compression_policy('audit_log', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('audit_log', INTERVAL '365 days', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_time
  ON audit_log (organization_id, time DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_category
  ON audit_log (organization_id, category, time DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_org_user
  ON audit_log (organization_id, user_id, time DESC)
  WHERE user_id IS NOT NULL;
