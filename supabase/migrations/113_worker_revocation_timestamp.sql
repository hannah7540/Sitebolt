-- Track when worker platform access was revoked.

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;

COMMENT ON COLUMN workers.revoked_at IS 'Timestamp when worker login access was revoked';
