-- Leave request dashboard + calendar sync (approval workflow)
-- Safe to re-run (idempotent alters / replace functions)

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_requests_status_check;

ALTER TABLE leave_requests
  ADD CONSTRAINT leave_requests_status_check
  CHECK (
    lower(status) IN ('pending', 'approved', 'declined', 'rejected')
  );

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE worker_calendar_events
  ADD COLUMN IF NOT EXISTS leave_request_id uuid,
  ADD COLUMN IF NOT EXISTS leave_status text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_leave_requests_project_id_nullable
  ON leave_requests(project_id)
  WHERE project_id IS NOT NULL;

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
    IF NEW.status = 'rejected' THEN
      NEW.status := 'declined';
    END IF;
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

CREATE OR REPLACE FUNCTION sync_leave_request_calendar_on_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND lower(coalesce(OLD.status, '')) IS DISTINCT FROM lower(coalesce(NEW.status, '')) THEN

    IF lower(NEW.status) = 'approved' THEN
      UPDATE worker_calendar_events
      SET
        event_type = 'Holiday Approved',
        display_code = 'L',
        bg_color = '#000000',
        text_color = '#FFFFFF',
        leave_kind = 'holiday_approved',
        leave_status = 'Approved',
        updated_at = now()
      WHERE leave_request_id = NEW.id;

      IF NOT FOUND THEN
        INSERT INTO worker_calendar_events (
          worker_id,
          project_id,
          project_name,
          event_type,
          start_date,
          end_date,
          is_full_day,
          notes,
          display_code,
          bg_color,
          text_color,
          leave_kind,
          leave_status,
          leave_request_id
        )
        VALUES (
          NEW.worker_id,
          NEW.project_id,
          NEW.project_name,
          'Holiday Approved',
          coalesce(NEW.start_date, NEW.first_date),
          coalesce(NEW.end_date, NEW.last_date),
          true,
          coalesce(NEW.reason, NEW.notes, ''),
          'L',
          '#000000',
          '#FFFFFF',
          'holiday_approved',
          'Approved',
          NEW.id
        );
      END IF;

    ELSIF lower(NEW.status) IN ('declined', 'rejected') THEN
      DELETE FROM worker_calendar_events
      WHERE leave_request_id = NEW.id;

      DELETE FROM worker_calendar_events
      WHERE worker_id = NEW.worker_id
        AND start_date >= coalesce(NEW.start_date, NEW.first_date)
        AND end_date <= coalesce(NEW.end_date, NEW.last_date)
        AND event_type IN ('Holiday Pending', 'Holiday Approved', 'Leave');
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_leave_request_calendar ON leave_requests;
CREATE TRIGGER trg_sync_leave_request_calendar
  AFTER UPDATE OF status ON leave_requests
  FOR EACH ROW
  EXECUTE FUNCTION sync_leave_request_calendar_on_status_change();

CREATE INDEX IF NOT EXISTS idx_worker_calendar_events_leave_request_id
  ON worker_calendar_events(leave_request_id);

COMMENT ON FUNCTION sync_leave_request_calendar_on_status_change IS
  'Syncs worker_calendar_events when leave_requests.status changes (dashboard + calendar workflow)';

NOTIFY pgrst, 'reload schema';
