-- ============================================================================
-- Migration 037: Status Page URL scoping
-- Project slug uniqueness moves from global back to per-organization so that
-- URLs can include the org slug (/status/:orgSlug/:projectSlug) without
-- cross-org collisions forcing auto-suffixes.
-- ============================================================================

DROP INDEX IF EXISTS idx_projects_slug_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_org_slug_unique
  ON projects (organization_id, slug);
