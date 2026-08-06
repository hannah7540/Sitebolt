-- Align pay_rates_and_rules columns with payroll engine field names

ALTER TABLE pay_rates_and_rules
  ADD COLUMN IF NOT EXISTS site_allowance_hourly numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS productivity_allowance_hourly numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hsr_allowance_hourly numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_apprentice_daily numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meal_allowance_threshold numeric(5, 2) NOT NULL DEFAULT 10;

UPDATE pay_rates_and_rules
SET
  site_allowance_hourly = COALESCE(NULLIF(site_allowance_hourly, 0), site_allowance_rate, 0),
  productivity_allowance_hourly = COALESCE(NULLIF(productivity_allowance_hourly, 0), productivity_allowance_rate, 0),
  hsr_allowance_hourly = COALESCE(NULLIF(hsr_allowance_hourly, 0), hsr_allowance_rate, 0),
  meal_allowance_threshold = COALESCE(NULLIF(meal_allowance_threshold, 0), overtime_20_threshold_hours, 10)
WHERE TRUE;

COMMENT ON COLUMN pay_rates_and_rules.site_allowance_hourly IS 'Site allowance ($/hr × hours worked).';
COMMENT ON COLUMN pay_rates_and_rules.productivity_allowance_hourly IS 'AAC productivity allowance ($/hr × hours worked).';
COMMENT ON COLUMN pay_rates_and_rules.hsr_allowance_hourly IS 'HSR allowance ($/hr × hours worked when worker is HSR).';
COMMENT ON COLUMN pay_rates_and_rules.travel_apprentice_daily IS 'Apprentice travel flat daily allowance.';
COMMENT ON COLUMN pay_rates_and_rules.meal_allowance_threshold IS 'Daily hours threshold before meal allowance applies.';
