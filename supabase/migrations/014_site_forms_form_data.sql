-- SiteBolt: rename checklist_data to form_data for site safety forms
-- Run in Supabase SQL Editor after 013_site_forms.sql

ALTER TABLE site_forms
  ADD COLUMN IF NOT EXISTS form_data jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE site_forms
SET form_data = checklist_data
WHERE (form_data IS NULL OR form_data = '{}'::jsonb)
  AND checklist_data IS NOT NULL
  AND checklist_data <> '{}'::jsonb;

COMMENT ON COLUMN site_forms.form_data IS 'Structured JSON payload for site safety form fields';
