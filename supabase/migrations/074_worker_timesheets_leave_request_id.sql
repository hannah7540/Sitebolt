-- Link auto-generated leave timesheets back to the approved leave request.

ALTER TABLE worker_timesheets
  ADD COLUMN IF NOT EXISTS leave_request_id uuid REFERENCES leave_requests(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_worker_timesheets_leave_request_id
  ON worker_timesheets(leave_request_id);

COMMENT ON COLUMN worker_timesheets.leave_request_id IS
  'Set when a pending timesheet row is auto-created from an approved leave request.';
