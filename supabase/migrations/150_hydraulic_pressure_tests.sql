-- AS 2566.2 Section M5 hydraulic ITC pressure tests, hourly readings, and auto-NCR.

CREATE TABLE IF NOT EXISTS pressure_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid NOT NULL REFERENCES project_itcs(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  start_time timestamptz,
  required_pressure_kpa numeric(12, 4),
  v1_litres numeric(12, 4),
  v2_litres numeric(12, 4),
  v1_overridden boolean NOT NULL DEFAULT false,
  v2_overridden boolean NOT NULL DEFAULT false,
  length_km numeric(12, 6),
  diameter_m numeric(12, 6),
  head_m numeric(12, 4),
  q_litres numeric(12, 4),
  allowable numeric(12, 4),
  passed boolean,
  aplus_sig text,
  pc_sig text,
  submitted_at timestamptz,
  submitted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pressure_tests_itc ON pressure_tests(itc_id);
CREATE INDEX IF NOT EXISTS idx_pressure_tests_project ON pressure_tests(project_id);

CREATE TABLE IF NOT EXISTS pressure_readings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES pressure_tests(id) ON DELETE CASCADE,
  hour_index integer NOT NULL CHECK (hour_index BETWEEN 0 AND 8),
  reading_time text,
  water_added_l numeric(12, 4),
  pressure_kpa numeric(12, 4),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, hour_index)
);

CREATE INDEX IF NOT EXISTS idx_pressure_readings_test ON pressure_readings(test_id);

CREATE TABLE IF NOT EXISTS ncrs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid REFERENCES project_itcs(id) ON DELETE SET NULL,
  test_id uuid REFERENCES pressure_tests(id) ON DELETE SET NULL,
  project_id text,
  cause text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  raised_by text,
  details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ncrs_itc ON ncrs(itc_id);
CREATE INDEX IF NOT EXISTS idx_ncrs_test ON ncrs(test_id);

ALTER TABLE pressure_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE pressure_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ncrs ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON pressure_tests TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pressure_readings TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ncrs TO anon, authenticated;

DROP POLICY IF EXISTS "Allow public read pressure_tests" ON pressure_tests;
CREATE POLICY "Allow public read pressure_tests"
  ON pressure_tests FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write pressure_tests" ON pressure_tests;
CREATE POLICY "Allow public write pressure_tests"
  ON pressure_tests FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read pressure_readings" ON pressure_readings;
CREATE POLICY "Allow public read pressure_readings"
  ON pressure_readings FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write pressure_readings" ON pressure_readings;
CREATE POLICY "Allow public write pressure_readings"
  ON pressure_readings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read ncrs" ON ncrs;
CREATE POLICY "Allow public read ncrs"
  ON ncrs FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write ncrs" ON ncrs;
CREATE POLICY "Allow public write ncrs"
  ON ncrs FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE pressure_tests IS 'AS 2566.2 Section M5 hydraulic pressure tests; submitted rows freeze q_litres, allowable, passed';
COMMENT ON TABLE pressure_readings IS 'Hourly water/pressure readings (hours 0–8) for a pressure test';
COMMENT ON TABLE ncrs IS 'Non-conformance records, including automatic pressure-test failures';

NOTIFY pgrst, 'reload schema';
