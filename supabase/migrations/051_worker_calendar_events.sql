-- Worker calendar events (bulk RDO, leave blocks, etc.)

CREATE TABLE IF NOT EXISTS worker_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  worker_name text,
  project_id text,
  project_name text,
  event_type text NOT NULL CHECK (event_type IN ('RDO', 'Leave')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  is_full_day boolean NOT NULL DEFAULT true,
  start_time time,
  end_time time,
  notes text,
  trade text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_calendar_events_worker_id
  ON worker_calendar_events(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_calendar_events_dates
  ON worker_calendar_events(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_worker_calendar_events_event_type
  ON worker_calendar_events(event_type);
CREATE INDEX IF NOT EXISTS idx_worker_calendar_events_project_id
  ON worker_calendar_events(project_id);

ALTER TABLE worker_calendar_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read worker_calendar_events" ON worker_calendar_events;
CREATE POLICY "Allow public read worker_calendar_events"
  ON worker_calendar_events FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert worker_calendar_events" ON worker_calendar_events;
CREATE POLICY "Allow public insert worker_calendar_events"
  ON worker_calendar_events FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update worker_calendar_events" ON worker_calendar_events;
CREATE POLICY "Allow public update worker_calendar_events"
  ON worker_calendar_events FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete worker_calendar_events" ON worker_calendar_events;
CREATE POLICY "Allow public delete worker_calendar_events"
  ON worker_calendar_events FOR DELETE USING (true);

COMMENT ON TABLE worker_calendar_events IS 'Admin calendar blocks including bulk RDO scheduling';

-- Reload PostgREST schema cache after creating the table (also available in Supabase SQL editor):
NOTIFY pgrst, 'reload schema';
