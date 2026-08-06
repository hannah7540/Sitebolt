-- SiteBolt: ITC Quality System (zones, register, photos, sign-offs, change requests)

CREATE TABLE IF NOT EXISTS itc_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  zone_code text NOT NULL,
  zone_name text NOT NULL,
  map_x numeric(6, 4),
  map_y numeric(6, 4),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_itc_zones_project_code
  ON itc_zones(project_id, zone_code);
CREATE INDEX IF NOT EXISTS idx_itc_zones_project_id ON itc_zones(project_id);

CREATE TABLE IF NOT EXISTS itc_form_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,
  step_key text NOT NULL,
  step_index integer NOT NULL,
  title text NOT NULL,
  description text,
  field_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itc_form_steps_project ON itc_form_steps(project_id, step_index);

CREATE TABLE IF NOT EXISTS project_itcs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  itc_number text NOT NULL,
  zone_id uuid REFERENCES itc_zones(id) ON DELETE SET NULL,
  zone_code text,
  building text,
  service_discipline text NOT NULL DEFAULT 'Electrical',
  start_location text,
  end_location text,
  conduits jsonb NOT NULL DEFAULT '[]'::jsonb,
  length_m numeric(10, 2),
  status text NOT NULL DEFAULT 'not_started'
    CHECK (status IN ('not_started', 'ongoing', 'issue', 'complete')),
  progress_percent numeric(5, 2) NOT NULL DEFAULT 0,
  map_x numeric(6, 4),
  map_y numeric(6, 4),
  trench_group text,
  drawing_rev text,
  assigned_to text,
  assigned_name text,
  has_open_cr boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_itcs_project_id ON project_itcs(project_id);
CREATE INDEX IF NOT EXISTS idx_project_itcs_zone_id ON project_itcs(zone_id);
CREATE INDEX IF NOT EXISTS idx_project_itcs_status ON project_itcs(status);
CREATE INDEX IF NOT EXISTS idx_project_itcs_trench_group ON project_itcs(trench_group);
CREATE UNIQUE INDEX IF NOT EXISTS idx_project_itcs_project_number
  ON project_itcs(project_id, itc_number);

CREATE TABLE IF NOT EXISTS itc_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid NOT NULL REFERENCES project_itcs(id) ON DELETE CASCADE,
  slot_key text NOT NULL,
  photo_url text,
  not_required boolean NOT NULL DEFAULT false,
  not_required_reason text,
  gps_lat numeric(10, 7),
  gps_lng numeric(10, 7),
  captured_at timestamptz,
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (itc_id, slot_key)
);

CREATE INDEX IF NOT EXISTS idx_itc_photos_itc_id ON itc_photos(itc_id);

CREATE TABLE IF NOT EXISTS itc_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid NOT NULL REFERENCES project_itcs(id) ON DELETE CASCADE,
  step_key text NOT NULL,
  step_index integer NOT NULL,
  author_id text NOT NULL,
  author_name text NOT NULL,
  comments text,
  field_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_url text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted')),
  submitted_at timestamptz,
  verified_by text,
  verified_by_name text,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (itc_id, step_index, author_id)
);

CREATE INDEX IF NOT EXISTS idx_itc_signoffs_itc_id ON itc_signoffs(itc_id);
CREATE INDEX IF NOT EXISTS idx_itc_signoffs_status ON itc_signoffs(status);

CREATE TABLE IF NOT EXISTS itc_signoff_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signoff_id uuid NOT NULL REFERENCES itc_signoffs(id) ON DELETE CASCADE,
  previous_comments text,
  previous_field_data jsonb,
  edit_reason text NOT NULL,
  edited_by text NOT NULL,
  edited_by_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itc_signoff_edits_signoff ON itc_signoff_edits(signoff_id);

CREATE TABLE IF NOT EXISTS itc_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid NOT NULL REFERENCES project_itcs(id) ON DELETE CASCADE,
  signoff_id uuid REFERENCES itc_signoffs(id) ON DELETE SET NULL,
  requested_by text NOT NULL,
  requested_by_name text NOT NULL,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by text,
  reviewed_by_name text,
  reviewed_at timestamptz,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itc_change_requests_itc ON itc_change_requests(itc_id);
CREATE INDEX IF NOT EXISTS idx_itc_change_requests_status ON itc_change_requests(status);

CREATE TABLE IF NOT EXISTS itc_compaction_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  test_number text NOT NULL,
  company_name text,
  technician_name text,
  mark_x numeric(6, 4),
  mark_y numeric(6, 4),
  signature_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_itc_compaction_tests_project ON itc_compaction_tests(project_id);

CREATE TABLE IF NOT EXISTS itc_compaction_test_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES itc_compaction_tests(id) ON DELETE CASCADE,
  itc_id uuid NOT NULL REFERENCES project_itcs(id) ON DELETE CASCADE,
  UNIQUE (test_id, itc_id)
);

ALTER TABLE itc_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_form_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_itcs ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_signoff_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_change_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_compaction_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE itc_compaction_test_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read itc_zones" ON itc_zones;
CREATE POLICY "Allow public read itc_zones" ON itc_zones FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_zones" ON itc_zones;
CREATE POLICY "Allow public write itc_zones" ON itc_zones FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_form_steps" ON itc_form_steps;
CREATE POLICY "Allow public read itc_form_steps" ON itc_form_steps FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_form_steps" ON itc_form_steps;
CREATE POLICY "Allow public write itc_form_steps" ON itc_form_steps FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read project_itcs" ON project_itcs;
CREATE POLICY "Allow public read project_itcs" ON project_itcs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write project_itcs" ON project_itcs;
CREATE POLICY "Allow public write project_itcs" ON project_itcs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_photos" ON itc_photos;
CREATE POLICY "Allow public read itc_photos" ON itc_photos FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_photos" ON itc_photos;
CREATE POLICY "Allow public write itc_photos" ON itc_photos FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_signoffs" ON itc_signoffs;
CREATE POLICY "Allow public read itc_signoffs" ON itc_signoffs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert itc_signoffs" ON itc_signoffs;
CREATE POLICY "Allow public insert itc_signoffs" ON itc_signoffs FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow public update itc_signoffs" ON itc_signoffs;
CREATE POLICY "Allow public update itc_signoffs" ON itc_signoffs FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_signoff_edits" ON itc_signoff_edits;
CREATE POLICY "Allow public read itc_signoff_edits" ON itc_signoff_edits FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public insert itc_signoff_edits" ON itc_signoff_edits;
CREATE POLICY "Allow public insert itc_signoff_edits" ON itc_signoff_edits FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_change_requests" ON itc_change_requests;
CREATE POLICY "Allow public read itc_change_requests" ON itc_change_requests FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_change_requests" ON itc_change_requests;
CREATE POLICY "Allow public write itc_change_requests" ON itc_change_requests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_compaction_tests" ON itc_compaction_tests;
CREATE POLICY "Allow public read itc_compaction_tests" ON itc_compaction_tests FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_compaction_tests" ON itc_compaction_tests;
CREATE POLICY "Allow public write itc_compaction_tests" ON itc_compaction_tests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read itc_compaction_test_links" ON itc_compaction_test_links;
CREATE POLICY "Allow public read itc_compaction_test_links" ON itc_compaction_test_links FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write itc_compaction_test_links" ON itc_compaction_test_links;
CREATE POLICY "Allow public write itc_compaction_test_links" ON itc_compaction_test_links FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE project_itcs IS 'Inspection Test Certificates for trench/service runs';
COMMENT ON TABLE itc_signoffs IS 'Append-only step sign-offs; drafts editable by author until submitted';
COMMENT ON TABLE itc_change_requests IS 'Worker CR queue when submitted sign-offs need alteration';
