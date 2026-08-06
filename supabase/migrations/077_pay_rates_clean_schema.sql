-- Clean pay_rates_and_rules schema: canonical column names for PostgREST payloads

ALTER TABLE pay_rates_and_rules
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS overtime_threshold_hours numeric(5, 2) NOT NULL DEFAULT 8;

UPDATE pay_rates_and_rules
SET
  name = COALESCE(NULLIF(TRIM(name), ''), rule_name, 'Unnamed rule'),
  overtime_threshold_hours = COALESCE(
    NULLIF(overtime_threshold_hours, 0),
    overtime_15_threshold_hours,
    8
  )
WHERE TRUE;

COMMENT ON COLUMN pay_rates_and_rules.name IS 'Display name for the pay rate rule.';
COMMENT ON COLUMN pay_rates_and_rules.overtime_threshold_hours IS
  'Daily hours threshold before overtime multiplier applies (weekday).';
