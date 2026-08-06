-- SiteBolt: Worker timesheets
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS worker_timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  work_date date NOT NULL,
  project_id uuid,
  project_name text,
  start_time time NOT NULL,
  finish_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0,
  total_hours numeric(5, 2) NOT NULL,
  notes text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_timesheets_worker_id ON worker_timesheets(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_timesheets_work_date ON worker_timesheets(work_date);
CREATE INDEX IF NOT EXISTS idx_worker_timesheets_status ON worker_timesheets(status);

ALTER TABLE worker_timesheets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read worker_timesheets" ON worker_timesheets;
CREATE POLICY "Allow public read worker_timesheets"
  ON worker_timesheets FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert worker_timesheets" ON worker_timesheets;
CREATE POLICY "Allow public insert worker_timesheets"
  ON worker_timesheets FOR INSERT WITH CHECK (true);
