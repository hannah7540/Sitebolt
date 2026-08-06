-- Leave type display columns and sync fields for worker_calendar_events

ALTER TABLE worker_calendar_events
  ADD COLUMN IF NOT EXISTS display_code text,
  ADD COLUMN IF NOT EXISTS bg_color text,
  ADD COLUMN IF NOT EXISTS text_color text,
  ADD COLUMN IF NOT EXISTS leave_kind text,
  ADD COLUMN IF NOT EXISTS leave_request_id uuid REFERENCES leave_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_worker_calendar_events_leave_request_id
  ON worker_calendar_events(leave_request_id);

ALTER TABLE worker_calendar_events
  DROP CONSTRAINT IF EXISTS worker_calendar_events_leave_kind_check;

ALTER TABLE worker_calendar_events
  ADD CONSTRAINT worker_calendar_events_leave_kind_check
  CHECK (
    leave_kind IS NULL OR leave_kind IN (
      'sick',
      'personal',
      'carers',
      'holiday_pending',
      'holiday_approved',
      'other'
    )
  );

COMMENT ON COLUMN worker_calendar_events.display_code IS 'Short badge label: RDO, SICK, PL, CL, L, etc.';
COMMENT ON COLUMN worker_calendar_events.bg_color IS 'Hex or CSS background for calendar pill';
COMMENT ON COLUMN worker_calendar_events.text_color IS 'Hex text color for calendar pill';
COMMENT ON COLUMN worker_calendar_events.leave_kind IS 'sick | personal | carers | holiday_pending | holiday_approved | other';

NOTIFY pgrst, 'reload schema';
