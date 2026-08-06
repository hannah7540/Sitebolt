-- Additional workers / late sign-ons for site safety forms
ALTER TABLE site_forms
  ADD COLUMN IF NOT EXISTS additional_workers jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN site_forms.additional_workers IS
  'Late sign-on workers: [{ "name": string, "signature": string (public URL) }]';

-- Support legacy per-type tables if deployed separately
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'daily_pre_starts') THEN
    ALTER TABLE daily_pre_starts
      ADD COLUMN IF NOT EXISTS additional_workers jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'toolbox_talks') THEN
    ALTER TABLE toolbox_talks
      ADD COLUMN IF NOT EXISTS additional_workers jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;

  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'safety_walks') THEN
    ALTER TABLE safety_walks
      ADD COLUMN IF NOT EXISTS additional_workers jsonb NOT NULL DEFAULT '[]'::jsonb;
  END IF;
END $$;
