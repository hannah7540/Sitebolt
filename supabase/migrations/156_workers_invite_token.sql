-- Persistent, non-expiring worker password-setup tokens.

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS invite_token text UNIQUE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_workers_invite_token
  ON workers (invite_token)
  WHERE invite_token IS NOT NULL;
