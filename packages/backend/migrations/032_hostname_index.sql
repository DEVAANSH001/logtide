-- Migration 032: Composite expression index for hostname lookups (TimescaleDB)
--
-- Migration 023 tried a standalone expression index on (metadata->>'hostname') but
-- TimescaleDB planner preferred seq scan because it had no way to narrow by project_id.
--
-- A composite index (project_id, hostname_expr, time) lets the planner do an index
-- range scan scoped to a single project, then read distinct hostname values directly
-- from the index without touching row data.
--
-- Note: ClickHouse and MongoDB handle this via engine-level changes in reservoir
-- (materialized column and compound index respectively). This migration only applies
-- to TimescaleDB instances.
--
-- Note: CONCURRENTLY is not supported on TimescaleDB hypertables.

CREATE INDEX IF NOT EXISTS idx_logs_project_hostname
  ON logs (project_id, (metadata->>'hostname'), time DESC)
  WHERE metadata->>'hostname' IS NOT NULL
    AND metadata->>'hostname' != '';

-- Index for getByIds lookups (e.g. findCorrelatedLogs).
-- The primary key is (time, id) which requires knowing `time` to be useful.
-- A standalone index on id lets WHERE id = ANY(...) resolve without chunk scans.
CREATE INDEX IF NOT EXISTS idx_logs_id
  ON logs (id);
