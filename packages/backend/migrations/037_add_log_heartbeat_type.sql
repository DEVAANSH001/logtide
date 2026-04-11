-- Add log_heartbeat monitor type
ALTER TABLE monitors DROP CONSTRAINT IF EXISTS monitors_type_check;
ALTER TABLE monitors ADD CONSTRAINT monitors_type_check
  CHECK (type IN ('http', 'tcp', 'heartbeat', 'log_heartbeat'));
