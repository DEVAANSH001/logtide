-- Add configurable grace period for log_heartbeat monitors
ALTER TABLE monitors ADD COLUMN IF NOT EXISTS grace_period_seconds INTEGER;
