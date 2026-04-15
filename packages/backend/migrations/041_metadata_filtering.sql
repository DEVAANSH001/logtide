-- ============================================================================
-- Migration 041: Metadata filtering support
-- Adds GIN index on logs.metadata for fast JSONB predicate queries,
-- and a metadata_filters column on alert_rules to persist filter arrays.
-- ============================================================================

-- GIN index on logs.metadata for generic JSONB filtering
CREATE INDEX IF NOT EXISTS idx_logs_metadata_gin
  ON logs USING GIN (metadata);

-- Alert rules: optional metadata filters (array of MetadataFilter objects)
ALTER TABLE alert_rules
  ADD COLUMN IF NOT EXISTS metadata_filters JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Safety check: reject non-array values at the DB layer
ALTER TABLE alert_rules
  DROP CONSTRAINT IF EXISTS alert_rules_metadata_filters_is_array;

ALTER TABLE alert_rules
  ADD CONSTRAINT alert_rules_metadata_filters_is_array
  CHECK (jsonb_typeof(metadata_filters) = 'array');
