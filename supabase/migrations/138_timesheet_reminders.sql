-- Reminders sent from Accounts → Missing Timesheet Search

CREATE TABLE IF NOT EXISTS timesheet_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL,
  missing_days text[] NOT NULL DEFAULT '{}',
  pay_week_start date,
  pay_week_end date,
  message_body text,
  project_ids text[] NOT NULL DEFAULT '{}',
  sent_by text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_timesheet_reminders_worker_id
  ON timesheet_reminders(worker_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_reminders_sent_at
  ON timesheet_reminders(sent_at DESC);

ALTER TABLE timesheet_reminders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read timesheet_reminders" ON timesheet_reminders;
CREATE POLICY "Allow public read timesheet_reminders"
  ON timesheet_reminders FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert timesheet_reminders" ON timesheet_reminders;
CREATE POLICY "Allow public insert timesheet_reminders"
  ON timesheet_reminders FOR INSERT WITH CHECK (true);

COMMENT ON TABLE timesheet_reminders IS
  'SMS/push reminders sent for missing Wed–Tue working-day timesheets.';
COMMENT ON COLUMN timesheet_reminders.missing_days IS
  'Full weekday names that were missing when the reminder was sent.';
