-- Migration 024: Add API key type (write/full) and origin allowlist
-- Existing keys become 'write' type via DEFAULT (instant in PG 11+)
-- allowed_origins: TEXT[] nullable - if NULL, no restriction

ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'write',
  ADD COLUMN IF NOT EXISTS allowed_origins TEXT[];

-- Enforce valid values
ALTER TABLE api_keys
  ADD CONSTRAINT api_keys_type_check CHECK (type IN ('write', 'full'));

-- Index for listing keys by project + type
CREATE INDEX IF NOT EXISTS idx_api_keys_project_type ON api_keys (project_id, type);
