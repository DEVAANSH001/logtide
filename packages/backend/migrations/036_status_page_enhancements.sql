-- ============================================================================
-- Migration 036: Status Page Enhancements
-- 1. Access modes (visibility + password protection)
-- 2. Status incidents (public communication)
-- 3. Scheduled maintenances
-- ============================================================================

-- ============================================================================
-- 1. Access Modes: replace status_page_public with status_page_visibility
-- ============================================================================

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS status_page_visibility VARCHAR(20) NOT NULL DEFAULT 'disabled'
    CHECK (status_page_visibility IN ('disabled', 'public', 'password', 'members_only')),
  ADD COLUMN IF NOT EXISTS status_page_password_hash TEXT;

-- Migrate existing data (safe: only runs if old column exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'projects' AND column_name = 'status_page_public') THEN
    UPDATE projects SET status_page_visibility = 'public' WHERE status_page_public = true;
    UPDATE projects SET status_page_visibility = 'disabled' WHERE status_page_public = false;
    ALTER TABLE projects DROP COLUMN status_page_public;
  END IF;
END $$;

-- Make slug globally unique (was per-org). First, resolve any conflicts.
-- Append org_id prefix to duplicate slugs
WITH dupes AS (
  SELECT slug FROM projects GROUP BY slug HAVING COUNT(*) > 1
),
ranked AS (
  SELECT p.id, p.slug, p.organization_id,
         ROW_NUMBER() OVER (PARTITION BY p.slug ORDER BY p.created_at ASC) AS rn
  FROM projects p
  WHERE p.slug IN (SELECT slug FROM dupes)
)
UPDATE projects
SET slug = ranked.slug || '-' || SUBSTRING(ranked.organization_id::text, 1, 8)
FROM ranked
WHERE projects.id = ranked.id AND ranked.rn > 1;

-- Drop old per-org unique index and create global unique index
DROP INDEX IF EXISTS idx_projects_org_slug;
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug_unique ON projects(slug);

-- ============================================================================
-- 2. Status Incidents (public communications, separate from SIEM incidents)
-- ============================================================================

CREATE TABLE IF NOT EXISTS status_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'investigating'
    CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  severity VARCHAR(20) NOT NULL DEFAULT 'minor'
    CHECK (severity IN ('minor', 'major', 'critical')),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_status_incidents_project ON status_incidents(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_status_incidents_org ON status_incidents(organization_id);
CREATE INDEX IF NOT EXISTS idx_status_incidents_status ON status_incidents(project_id, status);

CREATE TABLE IF NOT EXISTS status_incident_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES status_incidents(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL
    CHECK (status IN ('investigating', 'identified', 'monitoring', 'resolved')),
  message TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_incident_updates_incident ON status_incident_updates(incident_id, created_at ASC);

-- ============================================================================
-- 3. Scheduled Maintenances
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_maintenances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed')),
  scheduled_start TIMESTAMPTZ NOT NULL,
  scheduled_end TIMESTAMPTZ NOT NULL,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  auto_update_status BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenances_project ON scheduled_maintenances(project_id, scheduled_start DESC);
CREATE INDEX IF NOT EXISTS idx_maintenances_org ON scheduled_maintenances(organization_id);
CREATE INDEX IF NOT EXISTS idx_maintenances_status ON scheduled_maintenances(project_id, status);
CREATE INDEX IF NOT EXISTS idx_maintenances_active ON scheduled_maintenances(status, scheduled_start, scheduled_end)
  WHERE status IN ('scheduled', 'in_progress');
