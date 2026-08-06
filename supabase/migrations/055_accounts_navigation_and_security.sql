-- SiteBolt: Accounts navigation access + timesheet MYOB export fields
-- Run in Supabase SQL Editor

-- Worker accounts access (Organisation → Security Settings)
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS accounts_access_role text NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS can_access_accounts boolean NOT NULL DEFAULT false;

ALTER TABLE workers DROP CONSTRAINT IF EXISTS workers_accounts_access_role_check;
ALTER TABLE workers
  ADD CONSTRAINT workers_accounts_access_role_check
  CHECK (accounts_access_role IN ('full_access', 'view_only', 'disabled'));

COMMENT ON COLUMN workers.accounts_access_role IS
  'Accounts module access: full_access (review/approve/export), view_only (read-only), disabled (hidden)';
COMMENT ON COLUMN workers.can_access_accounts IS
  'Derived flag: true when accounts_access_role is not disabled';

-- Backfill sensible defaults from existing security_role
UPDATE workers
SET
  accounts_access_role = CASE
    WHEN security_role = 'full_access' THEN 'full_access'
    WHEN security_role = 'admin_access' THEN 'view_only'
    ELSE 'disabled'
  END,
  can_access_accounts = security_role IN ('full_access', 'admin_access')
WHERE accounts_access_role = 'disabled'
  AND can_access_accounts = false;

-- Timesheet payroll / MYOB export metadata
ALTER TABLE worker_timesheets
  ADD COLUMN IF NOT EXISTS overtime_hours numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS myob_export_status text NOT NULL DEFAULT 'not_exported',
  ADD COLUMN IF NOT EXISTS myob_exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE worker_timesheets DROP CONSTRAINT IF EXISTS worker_timesheets_myob_export_status_check;
ALTER TABLE worker_timesheets
  ADD CONSTRAINT worker_timesheets_myob_export_status_check
  CHECK (myob_export_status IN ('not_exported', 'exported', 'processed'));

CREATE INDEX IF NOT EXISTS idx_worker_timesheets_myob_export_status
  ON worker_timesheets(myob_export_status);

-- Keep can_access_accounts in sync when accounts_access_role changes
CREATE OR REPLACE FUNCTION sync_worker_accounts_access_flag()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.can_access_accounts := NEW.accounts_access_role <> 'disabled';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_workers_sync_accounts_access ON workers;
CREATE TRIGGER trg_workers_sync_accounts_access
  BEFORE INSERT OR UPDATE OF accounts_access_role ON workers
  FOR EACH ROW
  EXECUTE FUNCTION sync_worker_accounts_access_flag();
