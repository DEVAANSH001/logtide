-- Add session_id column for browser session correlation
-- A session_id is a random UUID generated per browser page load,
-- used to correlate all events from a single user session.
-- Not a persistent identifier — purely for debugging context.

ALTER TABLE logs ADD COLUMN IF NOT EXISTS session_id TEXT;
CREATE INDEX IF NOT EXISTS idx_logs_session_id ON logs(session_id) WHERE session_id IS NOT NULL;
