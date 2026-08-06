-- SiteBolt: Inspection Test Plans (ITP) & Inspection Test Checklists (ITC)
-- Run in Supabase SQL Editor after previous migrations

CREATE TABLE IF NOT EXISTS project_itps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  itp_number text NOT NULL,
  title text NOT NULL,
  revision text NOT NULL DEFAULT 'A',
  trade_category text NOT NULL,
  subcontractor_name text,
  location_area text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'submitted', 'approved')),
  template_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_itps_project_id ON project_itps(project_id);
CREATE INDEX IF NOT EXISTS idx_project_itps_status ON project_itps(status);
CREATE INDEX IF NOT EXISTS idx_project_itps_trade_category ON project_itps(trade_category);

CREATE TABLE IF NOT EXISTS project_itp_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itp_id uuid NOT NULL REFERENCES project_itps(id) ON DELETE CASCADE,
  item_number integer NOT NULL,
  description text NOT NULL,
  acceptance_criteria text,
  point_type text NOT NULL DEFAULT 'S'
    CHECK (point_type IN ('H', 'W', 'S', 'R')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'conforming', 'non_conforming', 'na')),
  photo_urls jsonb NOT NULL DEFAULT '[]',
  evidence_urls jsonb NOT NULL DEFAULT '[]',
  inspector_name text,
  signed_off_at timestamptz,
  signature_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_itp_items_itp_id ON project_itp_items(itp_id);
CREATE INDEX IF NOT EXISTS idx_project_itp_items_point_type ON project_itp_items(point_type);
CREATE INDEX IF NOT EXISTS idx_project_itp_items_status ON project_itp_items(status);

ALTER TABLE project_itps ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_itp_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read project_itps" ON project_itps;
CREATE POLICY "Allow public read project_itps"
  ON project_itps FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert project_itps" ON project_itps;
CREATE POLICY "Allow public insert project_itps"
  ON project_itps FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update project_itps" ON project_itps;
CREATE POLICY "Allow public update project_itps"
  ON project_itps FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete project_itps" ON project_itps;
CREATE POLICY "Allow public delete project_itps"
  ON project_itps FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read project_itp_items" ON project_itp_items;
CREATE POLICY "Allow public read project_itp_items"
  ON project_itp_items FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert project_itp_items" ON project_itp_items;
CREATE POLICY "Allow public insert project_itp_items"
  ON project_itp_items FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update project_itp_items" ON project_itp_items;
CREATE POLICY "Allow public update project_itp_items"
  ON project_itp_items FOR UPDATE USING (true);
DROP POLICY IF EXISTS "Allow public delete project_itp_items" ON project_itp_items;
CREATE POLICY "Allow public delete project_itp_items"
  ON project_itp_items FOR DELETE USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('itp-uploads', 'itp-uploads', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow public read itp-uploads" ON storage.objects;
CREATE POLICY "Allow public read itp-uploads"
  ON storage.objects FOR SELECT USING (bucket_id = 'itp-uploads');
DROP POLICY IF EXISTS "Allow public insert itp-uploads" ON storage.objects;
CREATE POLICY "Allow public insert itp-uploads"
  ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'itp-uploads');
DROP POLICY IF EXISTS "Allow public update itp-uploads" ON storage.objects;
CREATE POLICY "Allow public update itp-uploads"
  ON storage.objects FOR UPDATE USING (bucket_id = 'itp-uploads');

COMMENT ON TABLE project_itps IS 'Project Inspection Test Plans / Checklists';
COMMENT ON COLUMN project_itp_items.point_type IS 'H=Hold, W=Witness, S=Surveillance, R=Review';
