-- Leave requests and calendar sync for worker holiday workflow
-- Safe to re-run (IF NOT EXISTS / idempotent alters)

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

-- Calendar sync columns for pending / approved holiday badges
ALTER TABLE worker_calendar_events
  ADD COLUMN IF NOT EXISTS leave_status text;

ALTER TABLE worker_calendar_events
  DROP CONSTRAINT IF EXISTS worker_calendar_events_event_type_check;

ALTER TABLE worker_calendar_events
  ADD CONSTRAINT worker_calendar_events_event_type_check
  CHECK (
    event_type IN (
      'RDO',
      'Leave',
      'Holiday Pending',
      'Holiday Approved'
    )
  );

ALTER TABLE worker_calendar_events
  DROP CONSTRAINT IF EXISTS worker_calendar_events_leave_status_check;

ALTER TABLE worker_calendar_events
  ADD CONSTRAINT worker_calendar_events_leave_status_check
  CHECK (
    leave_status IS NULL OR leave_status IN ('Pending', 'Approved', 'Rejected')
  );

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

COMMENT ON TABLE leave_requests IS 'Worker-submitted leave requests reviewed by admins';
COMMENT ON COLUMN worker_calendar_events.leave_status IS 'Pending | Approved | Rejected — synced from leave_requests workflow';

NOTIFY pgrst, 'reload schema';
