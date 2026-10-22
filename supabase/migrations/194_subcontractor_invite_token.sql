-- Persistent onboarding invite token for subcontractor self-onboarding emails.

ALTER TABLE subcontractors
  ADD COLUMN IF NOT EXISTS invite_token text,
  ADD COLUMN IF NOT EXISTS invite_expires_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS idx_subcontractors_invite_token
  ON subcontractors (invite_token)
  WHERE invite_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';
