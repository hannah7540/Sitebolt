-- Allow Site Dumper as a plant pre-start template identifier.

DO $$
BEGIN
  ALTER TYPE prestart_template ADD VALUE IF NOT EXISTS 'site_dumper';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';
