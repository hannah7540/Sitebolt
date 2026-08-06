-- SiteBolt: Allow my_profile dashboard layouts
-- Run in Supabase SQL Editor after 045_dashboard_layouts.sql

ALTER TABLE dashboard_layouts DROP CONSTRAINT IF EXISTS dashboard_layouts_dashboard_type_check;

ALTER TABLE dashboard_layouts ADD CONSTRAINT dashboard_layouts_dashboard_type_check
  CHECK (dashboard_type IN ('organisation', 'project', 'my_profile'));

COMMENT ON COLUMN dashboard_layouts.dashboard_type IS 'organisation | project | my_profile';
