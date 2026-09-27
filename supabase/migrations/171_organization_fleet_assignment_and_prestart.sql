-- Fleet state/project assignment + fleet pre-start columns on plant_prestarts

ALTER TABLE public.organization_fleet
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS assigned_project_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_project_name text,
  ADD COLUMN IF NOT EXISTS current_kms numeric(12, 1);

ALTER TABLE public.plant_prestarts
  ALTER COLUMN plant_id DROP NOT NULL;

ALTER TABLE public.plant_prestarts
  ADD COLUMN IF NOT EXISTS vehicle_type text DEFAULT 'plant',
  ADD COLUMN IF NOT EXISTS fleet_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_state text,
  ADD COLUMN IF NOT EXISTS fleet_unit_number text;

CREATE INDEX IF NOT EXISTS idx_organization_fleet_state
  ON public.organization_fleet(state);
CREATE INDEX IF NOT EXISTS idx_organization_fleet_assigned_project
  ON public.organization_fleet(assigned_project_id);
CREATE INDEX IF NOT EXISTS idx_plant_prestarts_vehicle_type
  ON public.plant_prestarts(vehicle_type);
CREATE INDEX IF NOT EXISTS idx_plant_prestarts_fleet_id
  ON public.plant_prestarts(fleet_id);
CREATE INDEX IF NOT EXISTS idx_plant_prestarts_assigned_state
  ON public.plant_prestarts(assigned_state);

CREATE OR REPLACE FUNCTION sync_plant_readings_from_prestart()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.plant_id IS NULL OR lower(COALESCE(NEW.vehicle_type, 'plant')) = 'fleet' THEN
    RETURN NEW;
  END IF;

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
  created_at,
  vehicle_type,
  fleet_id,
  assigned_state,
  fleet_unit_number
FROM plant_prestarts;

COMMENT ON VIEW plant_pre_starts IS
  'Read-compatible alias for plant_prestarts used by dashboards and reporting';

NOTIFY pgrst, 'reload schema';
