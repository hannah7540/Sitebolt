-- Interactive plant calendar Service / Other maintenance events.

CREATE TABLE IF NOT EXISTS plant_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id text NOT NULL,
  event_date date NOT NULL,
  event_type text NOT NULL DEFAULT 'service',
  title text NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE plant_calendar_events
  DROP CONSTRAINT IF EXISTS plant_calendar_events_event_type_check;

ALTER TABLE plant_calendar_events
  ADD CONSTRAINT plant_calendar_events_event_type_check
  CHECK (event_type IN ('service', 'other'));

CREATE INDEX IF NOT EXISTS idx_plant_calendar_events_plant_id
  ON plant_calendar_events(plant_id);

CREATE INDEX IF NOT EXISTS idx_plant_calendar_events_event_date
  ON plant_calendar_events(event_date);

ALTER TABLE plant_calendar_events ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON plant_calendar_events TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated read plant_calendar_events" ON plant_calendar_events;
CREATE POLICY "Authenticated read plant_calendar_events"
  ON plant_calendar_events FOR SELECT USING (true);

DROP POLICY IF EXISTS "Authenticated insert plant_calendar_events" ON plant_calendar_events;
CREATE POLICY "Authenticated insert plant_calendar_events"
  ON plant_calendar_events FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update plant_calendar_events" ON plant_calendar_events;
CREATE POLICY "Authenticated update plant_calendar_events"
  ON plant_calendar_events FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete plant_calendar_events" ON plant_calendar_events;
CREATE POLICY "Authenticated delete plant_calendar_events"
  ON plant_calendar_events FOR DELETE USING (true);
