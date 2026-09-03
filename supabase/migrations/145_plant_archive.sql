-- Plant asset archive metadata for Active / Archived list filters.

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text;

UPDATE plant
SET archived_at = COALESCE(archived_at, now())
WHERE archived_at IS NULL
  AND lower(COALESCE(status, '')) = 'archived';

NOTIFY pgrst, 'reload schema';
