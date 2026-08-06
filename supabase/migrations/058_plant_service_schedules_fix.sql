-- SiteBolt: Plant service schedule schema alignment (status, hours, aliases)

ALTER TABLE plant_service_schedules
  ADD COLUMN IF NOT EXISTS unit_number text,
  ADD COLUMN IF NOT EXISTS service_date date,
  ADD COLUMN IF NOT EXISTS service_hours numeric(10, 2),
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Scheduled',
  ADD COLUMN IF NOT EXISTS notes text;

ALTER TABLE plant_service_schedules DROP CONSTRAINT IF EXISTS plant_service_schedules_status_check;
ALTER TABLE plant_service_schedules
  ADD CONSTRAINT plant_service_schedules_status_check
  CHECK (status IN ('Scheduled', 'Completed'));

UPDATE plant_service_schedules
SET
  service_date = COALESCE(service_date, scheduled_date),
  notes = COALESCE(notes, technician_notes),
  status = CASE
    WHEN completed = true THEN 'Completed'
    ELSE COALESCE(NULLIF(status, ''), 'Scheduled')
  END
WHERE service_date IS NULL
   OR notes IS NULL
   OR status IS NULL
   OR status = '';

CREATE INDEX IF NOT EXISTS idx_plant_service_schedules_service_date
  ON plant_service_schedules(service_date);
CREATE INDEX IF NOT EXISTS idx_plant_service_schedules_status
  ON plant_service_schedules(status);

CREATE OR REPLACE FUNCTION sync_plant_service_schedule_fields()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.service_date IS NULL AND NEW.scheduled_date IS NOT NULL THEN
    NEW.service_date := NEW.scheduled_date;
  ELSIF NEW.scheduled_date IS NULL AND NEW.service_date IS NOT NULL THEN
    NEW.scheduled_date := NEW.service_date;
  END IF;

  IF NEW.notes IS NULL AND NEW.technician_notes IS NOT NULL THEN
    NEW.notes := NEW.technician_notes;
  ELSIF NEW.technician_notes IS NULL AND NEW.notes IS NOT NULL THEN
    NEW.technician_notes := NEW.notes;
  END IF;

  IF NEW.status = 'Completed' THEN
    NEW.completed := true;
  ELSIF NEW.completed = true THEN
    NEW.status := 'Completed';
  ELSIF NEW.status IS NULL OR NEW.status = '' THEN
    NEW.status := 'Scheduled';
    NEW.completed := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plant_service_schedules_sync ON plant_service_schedules;
CREATE TRIGGER trg_plant_service_schedules_sync
  BEFORE INSERT OR UPDATE ON plant_service_schedules
  FOR EACH ROW
  EXECUTE FUNCTION sync_plant_service_schedule_fields();

COMMENT ON COLUMN plant_service_schedules.service_date IS
  'Alias for scheduled_date used by calendar service logging';
COMMENT ON COLUMN plant_service_schedules.notes IS
  'Alias for technician_notes used by calendar service logging';

-- Ensure legacy and modern service columns coexist for mixed-schema deployments
ALTER TABLE plant_service_schedules
  ADD COLUMN IF NOT EXISTS scheduled_date date,
  ADD COLUMN IF NOT EXISTS service_type text,
  ADD COLUMN IF NOT EXISTS technician_notes text,
  ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;

UPDATE plant_service_schedules
SET
  scheduled_date = COALESCE(scheduled_date, service_date),
  service_type = COALESCE(NULLIF(service_type, ''), 'Scheduled Plant Service'),
  technician_notes = COALESCE(technician_notes, notes),
  notes = COALESCE(notes, technician_notes)
WHERE scheduled_date IS NULL
   OR service_type IS NULL
   OR service_type = ''
   OR (technician_notes IS NULL AND notes IS NOT NULL)
   OR (notes IS NULL AND technician_notes IS NOT NULL);

COMMENT ON COLUMN plant_service_schedules.technician_notes IS
  'Legacy free-text notes field; kept in sync with notes via trigger';
COMMENT ON COLUMN plant_service_schedules.service_type IS
  'Service category label shown on the plant calendar';
-- Allow unlinked fleet/equipment rows to save service milestones without plant FK
ALTER TABLE plant_service_schedules
  ADD COLUMN IF NOT EXISTS plant_name text;

ALTER TABLE plant_service_schedules
  ALTER COLUMN plant_id DROP NOT NULL;

ALTER TABLE plant_service_schedules
  DROP CONSTRAINT IF EXISTS plant_service_schedules_plant_id_fkey;

ALTER TABLE plant_service_schedules
  ADD CONSTRAINT plant_service_schedules_plant_id_fkey
  FOREIGN KEY (plant_id) REFERENCES plant(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_plant_service_schedules_unit_number
  ON plant_service_schedules(unit_number);

COMMENT ON COLUMN plant_service_schedules.plant_name IS
  'Display label preserved when plant_id is null for fleet/equipment-only assets';
