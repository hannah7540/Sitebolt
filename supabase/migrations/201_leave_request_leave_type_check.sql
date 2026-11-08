-- Align leave_requests.leave_type checks across historical constraint names.
-- Production has reported leave_request_leave_type_check (singular) rejecting
-- expanded labels such as "Annual Leave" / "Sick Leave". Drop both names and
-- recreate the canonical allow-list (includes original 010 short values).

ALTER TABLE leave_requests
  DROP CONSTRAINT IF EXISTS leave_request_leave_type_check;

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

NOTIFY pgrst, 'reload schema';
