-- Subcontractor archiving
ALTER TABLE subcontractors
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN subcontractors.is_archived IS 'When true, subcontractor is hidden from current directory lists';

ALTER TABLE subcontractors DROP CONSTRAINT IF EXISTS subcontractors_status_check;
ALTER TABLE subcontractors ADD CONSTRAINT subcontractors_status_check
  CHECK (status IN ('active', 'inactive', 'suspended', 'Active', 'Archived'));

UPDATE subcontractors
SET status = 'Archived', is_archived = true
WHERE status = 'inactive' AND is_archived = false;
