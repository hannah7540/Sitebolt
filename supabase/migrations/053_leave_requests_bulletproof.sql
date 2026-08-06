-- Bulletproof leave_requests schema with dual column aliases + sync trigger
-- Safe to re-run (IF NOT EXISTS / idempotent alters)

CREATE TABLE IF NOT EXISTS leave_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  worker_name text,
  project_id text,
  first_date date,
  last_date date,
  start_date date,
  end_date date,
  number_of_days numeric(5, 1),
  total_days numeric(5, 1),
  days numeric(5, 1),
  duration_days numeric(5, 1),
  reason text,
  notes text,
  signature_url text,
  status text NOT NULL DEFAULT 'pending',
  leave_type text,
  schedule_entry_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS worker_name text,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS first_date date,
  ADD COLUMN IF NOT EXISTS last_date date,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS number_of_days numeric(5, 1),
  ADD COLUMN IF NOT EXISTS total_days numeric(5, 1),
  ADD COLUMN IF NOT EXISTS days numeric(5, 1),
  ADD COLUMN IF NOT EXISTS duration_days numeric(5, 1),
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS leave_type text,
  ADD COLUMN IF NOT EXISTS schedule_entry_id uuid,
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_status_check;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_status_check
  CHECK (lower(status) IN ('pending', 'approved', 'declined'));

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_leave_type_check;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_leave_type_check
  CHECK (
    leave_type IS NULL OR leave_type IN (
      'Sick',
      'Sick Leave',
      'Personal Leave',
      'Carers Leave',
      'Annual Leave',
      'Leave',
      'Leave without pay',
      'RDO',
      'Flexi RDO'
    )
  );

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_dates_present;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_dates_present CHECK (
    (first_date IS NOT NULL AND last_date IS NOT NULL)
    OR (start_date IS NOT NULL AND end_date IS NOT NULL)
  );

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_reason_present;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_reason_present CHECK (
    reason IS NULL
    OR notes IS NULL
    OR btrim(coalesce(reason, '')) <> ''
    OR btrim(coalesce(notes, '')) <> ''
    OR (reason IS NULL AND notes IS NULL)
  );

CREATE OR REPLACE FUNCTION sync_leave_request_aliases()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.start_date IS NULL AND NEW.first_date IS NOT NULL THEN
    NEW.start_date := NEW.first_date;
  END IF;
  IF NEW.first_date IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.first_date := NEW.start_date;
  END IF;

  IF NEW.end_date IS NULL AND NEW.last_date IS NOT NULL THEN
    NEW.end_date := NEW.last_date;
  END IF;
  IF NEW.last_date IS NULL AND NEW.end_date IS NOT NULL THEN
    NEW.last_date := NEW.end_date;
  END IF;

  IF NEW.notes IS NULL AND NEW.reason IS NOT NULL THEN
    NEW.notes := NEW.reason;
  END IF;
  IF NEW.reason IS NULL AND NEW.notes IS NOT NULL THEN
    NEW.reason := NEW.notes;
  END IF;

  IF NEW.total_days IS NULL AND NEW.number_of_days IS NOT NULL THEN
    NEW.total_days := NEW.number_of_days;
  END IF;
  IF NEW.number_of_days IS NULL AND NEW.total_days IS NOT NULL THEN
    NEW.number_of_days := NEW.total_days;
  END IF;

  IF NEW.days IS NULL AND NEW.number_of_days IS NOT NULL THEN
    NEW.days := NEW.number_of_days;
  END IF;
  IF NEW.number_of_days IS NULL AND NEW.days IS NOT NULL THEN
    NEW.number_of_days := NEW.days;
  END IF;

  IF NEW.duration_days IS NULL AND NEW.number_of_days IS NOT NULL THEN
    NEW.duration_days := NEW.number_of_days;
  END IF;
  IF NEW.number_of_days IS NULL AND NEW.duration_days IS NOT NULL THEN
    NEW.number_of_days := NEW.duration_days;
  END IF;

  IF NEW.status IS NOT NULL THEN
    NEW.status := lower(trim(NEW.status));
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_leave_request_aliases ON leave_requests;
CREATE TRIGGER trg_sync_leave_request_aliases
  BEFORE INSERT OR UPDATE ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION sync_leave_request_aliases();

CREATE INDEX IF NOT EXISTS idx_leave_requests_worker_id ON leave_requests(worker_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_project_id ON leave_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_leave_requests_status ON leave_requests(status);
CREATE INDEX IF NOT EXISTS idx_leave_requests_first_date ON leave_requests(first_date, last_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_start_date ON leave_requests(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_number_of_days ON leave_requests(number_of_days);

ALTER TABLE worker_schedule
  ADD COLUMN IF NOT EXISTS leave_request_id uuid,
  ADD COLUMN IF NOT EXISTS schedule_kind text DEFAULT 'assignment';

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

COMMENT ON TABLE leave_requests IS 'Worker leave requests with dual date/reason/day-count aliases synced by trigger';
COMMENT ON COLUMN leave_requests.number_of_days IS 'Primary day count; mirrored to total_days, days, duration_days';
COMMENT ON COLUMN leave_requests.leave_type IS 'Sick Leave | Personal Leave | Carers Leave | Annual Leave | Leave | etc.';

-- Ensure optional project columns exist (PGRST204-safe after deploy)
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS project_name text;

COMMENT ON COLUMN leave_requests.project_id IS 'Optional project UUID reference at submission time';
COMMENT ON COLUMN leave_requests.project_name IS 'Human-readable project title at submission time';

NOTIFY pgrst, 'reload schema';
