-- ============================================================================
-- Migration 042: Project data availability flags
-- Adds nullable timestamp columns on projects so that the data-availability
-- endpoint can answer from Postgres in O(projects) instead of querying the
-- reservoir (ClickHouse/Timescale/Mongo) N*3 times.
--
-- Populated by:
--  - write-side: ingest routes call projectsService.markHasData() after a
--    successful batch (debounced in-memory to avoid UPDATE spam).
--  - read-side: a one-shot backfill task at boot handles pre-existing data
--    (guarded by system_settings.data_availability_backfilled).
--
-- Staleness is applied at read time using organizations.retention_days: if
-- has_X_at is older than the retention window, the flag is considered empty.
-- ============================================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS has_logs_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_traces_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS has_metrics_at TIMESTAMPTZ;
