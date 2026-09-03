-- Re-apply heavy vehicle columns if 098 was not applied, then refresh PostgREST.

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS heavy_vehicle_check_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_heavy_vehicle_check_date date,
  ADD COLUMN IF NOT EXISTS next_heavy_vehicle_check_due_date date;

NOTIFY pgrst, 'reload schema';
