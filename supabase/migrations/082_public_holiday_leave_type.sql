-- Allow Public Holiday as a leave_requests.leave_type and calendar leave_kind.

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
      'Flexi RDO',
      'Public Holiday'
    )
  );

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
      'public_holiday',
      'rdo',
      'flexi_rdo',
      'leave_without_pay',
      'other'
    )
  );

NOTIFY pgrst, 'reload schema';
