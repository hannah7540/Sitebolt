-- SiteBolt: Plant project name alias columns
-- Run in Supabase SQL Editor after 034_plant_project_id_aliases.sql

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS current_project_name text;
