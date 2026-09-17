-- Project operating-region tags (ACT, NSW, WA, NZ) plus background inheritance
-- onto assigned plant and assets. Does not change worker onboarding state.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS state text;

ALTER TABLE projects
  DROP CONSTRAINT IF EXISTS projects_state_check;

ALTER TABLE projects
  ADD CONSTRAINT projects_state_check
  CHECK (state IS NULL OR state IN ('ACT', 'NSW', 'WA', 'NZ'));

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plant'
  ) THEN
    ALTER TABLE plant ADD COLUMN IF NOT EXISTS state text;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'plant_equipment'
  ) THEN
    ALTER TABLE plant_equipment ADD COLUMN IF NOT EXISTS state text;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'assets'
  ) THEN
    ALTER TABLE assets ADD COLUMN IF NOT EXISTS state text;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION sitebolt_project_state_for_id(p_project_id text)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT p.state
  FROM projects p
  WHERE p.id::text = p_project_id
    AND p.state IS NOT NULL
    AND btrim(p.state) <> ''
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION sitebolt_inherit_operating_state_from_project()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  pid text;
  st text;
BEGIN
  pid := NULLIF(btrim(COALESCE(NEW.project_id::text, '')), '');
  IF pid IS NULL THEN
    BEGIN
      pid := NULLIF(btrim(COALESCE(NEW.assigned_project_id::text, '')), '');
    EXCEPTION WHEN undefined_column THEN
      pid := NULL;
    END;
  END IF;
  IF pid IS NULL THEN
    BEGIN
      pid := NULLIF(btrim(COALESCE(NEW.current_project_id::text, '')), '');
    EXCEPTION WHEN undefined_column THEN
      pid := NULL;
    END;
  END IF;

  IF pid IS NULL THEN
    RETURN NEW;
  END IF;

  st := sitebolt_project_state_for_id(pid);
  IF st IS NOT NULL THEN
    NEW.state := st;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION sitebolt_propagate_project_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  tbl text;
  col text;
BEGIN
  IF NEW.state IS NULL OR btrim(NEW.state) = '' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.state IS NOT DISTINCT FROM OLD.state THEN
    RETURN NEW;
  END IF;

  FOREACH tbl IN ARRAY ARRAY['plant', 'plant_equipment', 'assets']
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      CONTINUE;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'state'
    ) THEN
      CONTINUE;
    END IF;

    FOREACH col IN ARRAY ARRAY['project_id', 'assigned_project_id', 'current_project_id']
    LOOP
      IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = tbl AND column_name = col
      ) THEN
        EXECUTE format(
          'UPDATE public.%I SET state = $1 WHERE %I::text = $2',
          tbl,
          col
        )
        USING NEW.state, NEW.id::text;
      END IF;
    END LOOP;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_plant_inherit_project_state ON plant;
DROP TRIGGER IF EXISTS trg_plant_equipment_inherit_project_state ON plant_equipment;
DROP TRIGGER IF EXISTS trg_assets_inherit_project_state ON assets;
DROP TRIGGER IF EXISTS trg_projects_propagate_state ON projects;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plant' AND column_name = 'state'
  ) THEN
    CREATE TRIGGER trg_plant_inherit_project_state
      BEFORE INSERT OR UPDATE ON plant
      FOR EACH ROW
      EXECUTE FUNCTION sitebolt_inherit_operating_state_from_project();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'plant_equipment' AND column_name = 'state'
  ) THEN
    CREATE TRIGGER trg_plant_equipment_inherit_project_state
      BEFORE INSERT OR UPDATE ON plant_equipment
      FOR EACH ROW
      EXECUTE FUNCTION sitebolt_inherit_operating_state_from_project();
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'state'
  ) THEN
    CREATE TRIGGER trg_assets_inherit_project_state
      BEFORE INSERT OR UPDATE ON assets
      FOR EACH ROW
      EXECUTE FUNCTION sitebolt_inherit_operating_state_from_project();
  END IF;

  CREATE TRIGGER trg_projects_propagate_state
    AFTER INSERT OR UPDATE OF state ON projects
    FOR EACH ROW
    EXECUTE FUNCTION sitebolt_propagate_project_state();
END $$;
