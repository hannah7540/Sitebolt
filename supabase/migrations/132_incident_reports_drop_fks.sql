-- Drop any foreign-key constraints on incident_reports UUID columns so
-- submissions never fail when auth/worker/project IDs do not match linked tables.
-- Denormalized name columns remain the source of truth for the admin register.

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'f'
      AND n.nspname = 'public'
      AND t.relname = 'incident_reports'
  LOOP
    EXECUTE format('ALTER TABLE public.incident_reports DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
