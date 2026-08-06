-- SiteBolt: Leave requests & calendar sync
-- Run in Supabase SQL Editor after previous migrations

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id text,
  first_date date NOT NULL,
  last_date date NOT NULL,
  number_of_days numeric(5, 1) NOT NULL,
  reason text NOT NULL,
  signature_url text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined')),
  leave_type text
    CHECK (
      leave_type IS NULL OR leave_type IN (
        'Sick',
        'Leave',
        'Leave without pay',
        'RDO',
        'Flexi RDO'
      )
    ),
  schedule_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leave_requests_worker_id ON leave_requests(worker_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_project_id ON leave_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_dates ON leave_requests(first_date, last_date);

ALTER TABLE worker_schedule
  ADD COLUMN IF NOT EXISTS leave_request_id uuid,
  ADD COLUMN IF NOT EXISTS schedule_kind text DEFAULT 'assignment';

ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read leave_requests" ON leave_requests;
CREATE POLICY "Allow public read leave_requests"
  ON leave_requests FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert leave_requests" ON leave_requests;
CREATE POLICY "Allow public insert leave_requests"
  ON leave_requests FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update leave_requests" ON leave_requests;
CREATE POLICY "Allow public update leave_requests"
  ON leave_requests FOR UPDATE USING (true);
