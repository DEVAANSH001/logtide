-- ============================================================================
-- Migration 039: Custom Dashboards
-- ============================================================================
-- Stores user-configurable dashboards with drag-and-drop panels.
-- Each row holds one dashboard for an organization (and optionally a project).
-- The `panels` JSONB field is a DashboardDocument, validated and migrated by
-- the schema migration framework in @logtide/shared.

CREATE TABLE IF NOT EXISTS custom_dashboards (
  id              UUID         NOT NULL DEFAULT gen_random_uuid(),
  organization_id UUID         NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id      UUID         REFERENCES projects(id) ON DELETE CASCADE,
  created_by      UUID         REFERENCES users(id) ON DELETE SET NULL,
  name            VARCHAR(200) NOT NULL,
  description     TEXT,
  is_default      BOOLEAN      NOT NULL DEFAULT FALSE,
  is_personal     BOOLEAN      NOT NULL DEFAULT FALSE,
  schema_version  INTEGER      NOT NULL DEFAULT 1,
  panels          JSONB        NOT NULL DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_custom_dashboards_org
  ON custom_dashboards(organization_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_custom_dashboards_project
  ON custom_dashboards(project_id, updated_at DESC)
  WHERE project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_custom_dashboards_created_by
  ON custom_dashboards(created_by);

-- One default dashboard per (org, project) scope.
-- Org-wide default uses NULL project_id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_dashboards_org_default
  ON custom_dashboards(organization_id)
  WHERE is_default = TRUE AND project_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_dashboards_org_project_default
  ON custom_dashboards(organization_id, project_id)
  WHERE is_default = TRUE AND project_id IS NOT NULL;

-- GIN index for fast JSONB panel queries (e.g. filter by panel type)
CREATE INDEX IF NOT EXISTS idx_custom_dashboards_panels_gin
  ON custom_dashboards USING GIN (panels);
