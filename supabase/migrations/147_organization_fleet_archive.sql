-- Fleet vehicle archive metadata for Active / Archived list filters.

ALTER TABLE organization_fleet
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_reason text;

ALTER TABLE organization_fleet
  DROP CONSTRAINT IF EXISTS organization_fleet_status_check;

ALTER TABLE organization_fleet
  ADD CONSTRAINT organization_fleet_status_check
  CHECK (
    status IN (
      'Active',
      'active',
      'Maintenance',
      'Out of Service',
      'archived',
      'Archived'
    )
  );

UPDATE organization_fleet
SET archived_at = COALESCE(archived_at, now())
WHERE archived_at IS NULL
  AND lower(COALESCE(status, '')) = 'archived';

NOTIFY pgrst, 'reload schema';
