-- Align invite expiry column with the live subcontractors schema.

ALTER TABLE subcontractors
  ADD COLUMN IF NOT EXISTS subcontractor_invite_expire_at timestamptz;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'subcontractors'
      AND column_name = 'invite_expires_at'
  ) THEN
    EXECUTE $sql$
      UPDATE subcontractors
      SET subcontractor_invite_expire_at = invite_expires_at
      WHERE subcontractor_invite_expire_at IS NULL
        AND invite_expires_at IS NOT NULL
    $sql$;
  END IF;
END
$$;

NOTIFY pgrst, 'reload schema';
