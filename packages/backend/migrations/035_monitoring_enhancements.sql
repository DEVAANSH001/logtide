-- ============================================================================
-- Migration 035: Monitoring enhancements
-- - Add http_config JSONB and severity to monitors
-- - Add status_page_public to projects
-- ============================================================================

-- 1. Add HTTP config column to monitors (for method, expectedStatus, headers, bodyAssertion)
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS http_config JSONB;

-- 2. Add per-monitor incident severity (default 'high' matches previous hardcoded behavior)
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'high'
  CHECK (severity IN ('critical', 'high', 'medium', 'low', 'informational'));

-- 3. Add status page visibility to projects (default false = private)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS status_page_public BOOLEAN NOT NULL DEFAULT false;
