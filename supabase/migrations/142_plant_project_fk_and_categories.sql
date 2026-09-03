-- Ensure plant can be assigned to a project and store predefined categories.

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS assigned_project_id text,
  ADD COLUMN IF NOT EXISTS current_project_id text,
  ADD COLUMN IF NOT EXISTS categories text[] NOT NULL DEFAULT '{}'::text[];

UPDATE plant
SET project_id = NULL
WHERE project_id IS NOT NULL
  AND btrim(project_id) = '';

UPDATE plant
SET categories = ARRAY(
  SELECT c
  FROM unnest(ARRAY['Excavator', 'Loader', 'Roller', 'Truck', 'Hydrovac']) AS c
  WHERE category ILIKE '%' || c || '%'
)
WHERE (categories IS NULL OR cardinality(categories) = 0)
  AND category IS NOT NULL
  AND btrim(category) <> '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'projects'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'plant_project_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE plant
        ADD CONSTRAINT plant_project_id_fkey
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Skipped plant_project_id_fkey: %', SQLERRM;
    END;
  END IF;
END $$;
