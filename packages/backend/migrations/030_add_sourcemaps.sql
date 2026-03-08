-- ============================================================================
-- LogTide - Source Maps Table
-- ============================================================================
-- Migration: 030_add_sourcemaps.sql
-- Description: Add table for source map metadata storage.
--              Actual .map files are stored on filesystem (or S3/GCS).
-- ============================================================================

CREATE TABLE IF NOT EXISTS sourcemaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  release TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, release, file_name)
);

CREATE INDEX IF NOT EXISTS idx_sourcemaps_project_release ON sourcemaps(project_id, release);
