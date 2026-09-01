-- Track whether a worker invitation is still outstanding.

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS invite_status text NOT NULL DEFAULT 'pending';

UPDATE workers
SET invite_status = 'accepted'
WHERE invite_status = 'pending'
  AND onboarding_completed = true;

CREATE INDEX IF NOT EXISTS idx_workers_invite_status
  ON workers (invite_status);
