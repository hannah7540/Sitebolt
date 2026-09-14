-- Optional Hydrovac attachment hour tracking on plant master and assignment tables.

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS attachment_hours numeric,
  ADD COLUMN IF NOT EXISTS attachment_next_due_hours numeric;

ALTER TABLE plant_equipment
  ADD COLUMN IF NOT EXISTS attachment_hours numeric,
  ADD COLUMN IF NOT EXISTS attachment_next_due_hours numeric;

NOTIFY pgrst, 'reload schema';
