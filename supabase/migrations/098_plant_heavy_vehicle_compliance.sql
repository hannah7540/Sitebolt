-- SiteBolt: Heavy vehicle compliance tracking on plant

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS heavy_vehicle_check_required boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_heavy_vehicle_check_date date,
  ADD COLUMN IF NOT EXISTS next_heavy_vehicle_check_due_date date;
