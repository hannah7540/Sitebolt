-- SiteBolt: Accounts pay rates and rules + worker assignment
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS pay_rates_and_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name text NOT NULL,
  base_hourly_rate numeric(10, 2) NOT NULL DEFAULT 0,
  saturday_rate numeric(10, 2) NOT NULL DEFAULT 0,
  sunday_rate numeric(10, 2) NOT NULL DEFAULT 0,
  public_holiday_rate numeric(10, 2) NOT NULL DEFAULT 0,
  overtime_15_threshold_hours numeric(5, 2) NOT NULL DEFAULT 8,
  overtime_20_threshold_hours numeric(5, 2) NOT NULL DEFAULT 10,
  daily_allowance numeric(10, 2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pay_rates_and_rules_rule_name
  ON pay_rates_and_rules(rule_name);

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS pay_rate_id uuid REFERENCES pay_rates_and_rules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workers_pay_rate_id ON workers(pay_rate_id);

COMMENT ON TABLE pay_rates_and_rules IS
  'Accounts pay rate rules for timesheet payroll calculations.';
COMMENT ON COLUMN workers.pay_rate_id IS
  'Assigned pay_rates_and_rules row for payroll rate lookup.';

ALTER TABLE pay_rates_and_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read pay_rates_and_rules" ON pay_rates_and_rules;
CREATE POLICY "Allow public read pay_rates_and_rules"
  ON pay_rates_and_rules FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert pay_rates_and_rules" ON pay_rates_and_rules;
CREATE POLICY "Allow public insert pay_rates_and_rules"
  ON pay_rates_and_rules FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update pay_rates_and_rules" ON pay_rates_and_rules;
CREATE POLICY "Allow public update pay_rates_and_rules"
  ON pay_rates_and_rules FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete pay_rates_and_rules" ON pay_rates_and_rules;
CREATE POLICY "Allow public delete pay_rates_and_rules"
  ON pay_rates_and_rules FOR DELETE USING (true);
