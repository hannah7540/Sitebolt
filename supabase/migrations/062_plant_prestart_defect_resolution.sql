-- Plant pre-start defect resolution tracking

ALTER TABLE plant_prestarts
  ADD COLUMN IF NOT EXISTS defect_status text,
  ADD COLUMN IF NOT EXISTS defect_resolved_at timestamptz;

UPDATE plant_prestarts
SET
  defect_status = 'Resolved',
  defect_resolved_at = cleared_at
WHERE cleared_at IS NOT NULL
  AND (defect_status IS NULL OR defect_status = '');

CREATE OR REPLACE VIEW plant_pre_starts AS
SELECT
  id,
  plant_id,
  operator_name,
  operator_worker_id,
  project_id,
  current_reading,
  next_service_due,
  check_data,
  has_defect,
  defect_summary,
  defect_comments,
  defect_photo_url,
  signature_url,
  repair_notes,
  mechanic_invoice_ref,
  cleared_at,
  defect_status,
  defect_resolved_at,
  COALESCE(submitted_at, created_at) AS submitted_at,
  created_at
FROM plant_prestarts;

COMMENT ON COLUMN plant_prestarts.defect_status IS 'Open defect lifecycle: Resolved when cleared from calendar/admin';
