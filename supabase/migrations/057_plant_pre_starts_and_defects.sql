-- SiteBolt: Plant pre-start defect logging, compatibility view, and plant sync triggers

ALTER TABLE plant_prestarts
  ADD COLUMN IF NOT EXISTS defect_summary text,
  ADD COLUMN IF NOT EXISTS operator_worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

UPDATE plant_prestarts
SET submitted_at = created_at
WHERE submitted_at IS NULL;

ALTER TABLE plant_prestarts
  ALTER COLUMN submitted_at SET DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_plant_prestarts_submitted_at
  ON plant_prestarts(submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_plant_prestarts_has_defect
  ON plant_prestarts(has_defect)
  WHERE has_defect = true;

-- Compatibility view for integrations expecting plant_pre_starts
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
  COALESCE(submitted_at, created_at) AS submitted_at,
  created_at
FROM plant_prestarts;

COMMENT ON VIEW plant_pre_starts IS
  'Read-compatible alias for plant_prestarts used by dashboards and reporting';

CREATE OR REPLACE FUNCTION sync_plant_readings_from_prestart()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE plant
  SET
    current_hours = COALESCE(NEW.current_reading, current_hours),
    next_service_hours = COALESCE(NEW.next_service_due, next_service_hours),
    status = CASE
      WHEN NEW.has_defect THEN 'out_of_service'
      ELSE COALESCE(NULLIF(status, ''), 'available')
    END,
    updated_at = now()
  WHERE id = NEW.plant_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plant_prestarts_sync_plant ON plant_prestarts;
CREATE TRIGGER trg_plant_prestarts_sync_plant
  AFTER INSERT OR UPDATE OF current_reading, next_service_due, has_defect ON plant_prestarts
  FOR EACH ROW
  EXECUTE FUNCTION sync_plant_readings_from_prestart();

CREATE OR REPLACE FUNCTION set_plant_prestart_defect_summary()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.has_defect THEN
    NEW.defect_summary := COALESCE(
      NULLIF(trim(NEW.defect_summary), ''),
      NULLIF(trim(split_part(COALESCE(NEW.defect_comments, ''), E'\n', 1)), ''),
      'Defect flagged'
    );
  ELSE
    NEW.defect_summary := NULL;
  END IF;

  IF NEW.submitted_at IS NULL THEN
    NEW.submitted_at := COALESCE(NEW.created_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plant_prestarts_defect_summary ON plant_prestarts;
CREATE TRIGGER trg_plant_prestarts_defect_summary
  BEFORE INSERT OR UPDATE ON plant_prestarts
  FOR EACH ROW
  EXECUTE FUNCTION set_plant_prestart_defect_summary();
