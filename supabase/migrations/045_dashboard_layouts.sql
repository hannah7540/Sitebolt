-- SiteBolt: Per-user dashboard widget layout persistence
-- Run in Supabase SQL Editor after previous migrations

CREATE TABLE IF NOT EXISTS dashboard_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  role text NOT NULL,
  dashboard_type text NOT NULL CHECK (dashboard_type IN ('organisation', 'project')),
  project_id text,
  widget_order jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dashboard_layouts_user_scope
  ON dashboard_layouts(user_id, dashboard_type, COALESCE(project_id, ''));

CREATE INDEX IF NOT EXISTS idx_dashboard_layouts_user_id
  ON dashboard_layouts(user_id);

ALTER TABLE dashboard_layouts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read dashboard_layouts" ON dashboard_layouts;
CREATE POLICY "Allow public read dashboard_layouts"
  ON dashboard_layouts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert dashboard_layouts" ON dashboard_layouts;
CREATE POLICY "Allow public insert dashboard_layouts"
  ON dashboard_layouts FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update dashboard_layouts" ON dashboard_layouts;
CREATE POLICY "Allow public update dashboard_layouts"
  ON dashboard_layouts FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete dashboard_layouts" ON dashboard_layouts;
CREATE POLICY "Allow public delete dashboard_layouts"
  ON dashboard_layouts FOR DELETE USING (true);

COMMENT ON TABLE dashboard_layouts IS 'Saved widget order and visibility per user/dashboard scope';
COMMENT ON COLUMN dashboard_layouts.widget_order IS 'Array of { id, position, isVisible }';
