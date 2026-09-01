-- Timestamp of the last worker invitation email.

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_workers_invite_sent_at
  ON workers (invite_sent_at DESC);
