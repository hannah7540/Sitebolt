-- SiteBolt: Wed–Tue pay week timesheet fields (activities, breaks, signature, draft)

ALTER TABLE worker_timesheets
  ADD COLUMN IF NOT EXISTS worker_trade text,
  ADD COLUMN IF NOT EXISTS activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS breaks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS work_hours numeric(5,2),
  ADD COLUMN IF NOT EXISTS break_hours numeric(5,2),
  ADD COLUMN IF NOT EXISTS daily_total_hours numeric(5,2),
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false;

ALTER TABLE worker_timesheets DROP CONSTRAINT IF EXISTS worker_timesheets_status_check;
ALTER TABLE worker_timesheets
  ADD CONSTRAINT worker_timesheets_status_check
  CHECK (status IN ('draft', 'pending', 'approved', 'rejected'));

CREATE INDEX IF NOT EXISTS idx_worker_timesheets_work_date_pay_week
  ON worker_timesheets(work_date DESC);

DROP POLICY IF EXISTS "Allow public update worker_timesheets" ON worker_timesheets;
CREATE POLICY "Allow public update worker_timesheets"
  ON worker_timesheets FOR UPDATE USING (true) WITH CHECK (true);

COMMENT ON COLUMN worker_timesheets.activities IS
  'Work activity slots: [{ id, start_time, end_time, label }]';
COMMENT ON COLUMN worker_timesheets.breaks IS
  'Break slots: [{ id, start_time, end_time }]';
