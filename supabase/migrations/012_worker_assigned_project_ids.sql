-- SiteBolt: Multi-project worker assignments
-- Run in Supabase SQL Editor after 011_organisation.sql

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS assigned_project_ids text[] DEFAULT '{}'::text[];

UPDATE workers
SET assigned_project_ids = ARRAY[assigned_project_id]::text[]
WHERE assigned_project_id IS NOT NULL
  AND (
    assigned_project_ids IS NULL
    OR assigned_project_ids = '{}'::text[]
  );
