-- Pay rule condition types: pay rate vs allowance / entitlement

ALTER TABLE pay_rule_conditions
  ADD COLUMN IF NOT EXISTS condition_type text NOT NULL DEFAULT 'pay_rate',
  ADD COLUMN IF NOT EXISTS allowance_trigger text,
  ADD COLUMN IF NOT EXISTS payout_unit text;

COMMENT ON COLUMN pay_rule_conditions.condition_type IS
  'pay_rate or allowance — determines which fields apply.';
COMMENT ON COLUMN pay_rule_conditions.allowance_trigger IS
  'Allowance trigger: hours_gte_threshold, flat_per_day_worked, all_hours_worked.';
COMMENT ON COLUMN pay_rule_conditions.payout_unit IS
  'Allowance payout: daily_flat_1x or per_hour_worked.';

-- Backfill legacy allowance-like rows
UPDATE pay_rule_conditions
SET
  condition_type = 'allowance',
  allowance_trigger = CASE
    WHEN time_condition = 'flat_daily_allowance' THEN 'flat_per_day_worked'
    WHEN time_condition = 'after_n_hours' AND pay_multiplier_type = 'flat_daily' THEN 'hours_gte_threshold'
    WHEN time_condition = 'all_hours_worked' AND condition_name ILIKE '%allowance%' THEN 'all_hours_worked'
    ELSE allowance_trigger
  END,
  payout_unit = CASE
    WHEN pay_multiplier_type = 'flat_daily' THEN 'daily_flat_1x'
    WHEN time_condition = 'all_hours_worked' AND condition_name ILIKE '%allowance%' THEN 'per_hour_worked'
    ELSE payout_unit
  END
WHERE time_condition IN ('flat_daily_allowance', 'after_n_hours')
   OR (time_condition = 'all_hours_worked' AND condition_name ILIKE '%allowance%');
