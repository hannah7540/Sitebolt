-- SiteBolt: Assignment metadata columns for plant/worker junction + master rows
-- Run in Supabase SQL Editor after previous migrations

ALTER TABLE plant_equipment
  ADD COLUMN IF NOT EXISTS assigned_project_id text,
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS assigned_project_name text,
  ADD COLUMN IF NOT EXISTS project_name text;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS assigned_project_name text,
  ADD COLUMN IF NOT EXISTS project_name text;

ALTER TABLE project_plant_assignments
  ADD COLUMN IF NOT EXISTS plant_name text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Assigned';

ALTER TABLE project_worker_assignments
  ADD COLUMN IF NOT EXISTS worker_name text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'Active';
