-- SiteBolt: Plant project ID alias columns for assignment sync
-- Run in Supabase SQL Editor after 033_project_assignments.sql

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS current_project_id text;

ALTER TABLE plant_equipment
  ADD COLUMN IF NOT EXISTS assigned_project_id text,
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS current_project_id text;
