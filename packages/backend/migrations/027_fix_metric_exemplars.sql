-- ============================================================================
-- Migration 027: Fix metric_exemplars table
-- ============================================================================
-- S3: metric_exemplars.metric_id has no FK constraint.
--     TimescaleDB does not support FK constraints FROM hypertables, so we
--     cannot add a formal FK. The application handles cascade deletes
--     (see timescale-engine.ts deleteMetrics). Both tables share the same
--     90-day retention policy, preventing orphan accumulation.
--
--  Add organization_id column for consistency with all other tables.
-- ============================================================================

-- Add organization_id column (nullable first for backfill)
ALTER TABLE metric_exemplars ADD COLUMN IF NOT EXISTS organization_id UUID;

-- Backfill organization_id from the metrics table
UPDATE metric_exemplars me
SET organization_id = m.organization_id
FROM metrics m
WHERE me.metric_id = m.id
  AND me.organization_id IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE metric_exemplars ALTER COLUMN organization_id SET NOT NULL;

-- Add index for org-scoped queries
CREATE INDEX IF NOT EXISTS idx_exemplars_org_time
  ON metric_exemplars (organization_id, time DESC);
