-- SiteBolt: NSW Site Worker pay rule allowances + worker HSR flag

ALTER TABLE pay_rates_and_rules
  ADD COLUMN IF NOT EXISTS preset_key text,
  ADD COLUMN IF NOT EXISTS site_allowance_rate numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS productivity_allowance_rate numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS hsr_allowance_rate numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS travel_allowance_daily numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS meal_allowance_daily numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS overtime_multiplier numeric(4, 2) NOT NULL DEFAULT 2.0,
  ADD COLUMN IF NOT EXISTS leave_flat_hours numeric(5, 2) NOT NULL DEFAULT 8.0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_rates_and_rules_preset_key
  ON pay_rates_and_rules(preset_key)
  WHERE preset_key IS NOT NULL;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS is_hsr boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN pay_rates_and_rules.preset_key IS
  'Stable identifier for seeded presets (e.g. nsw_site_worker).';
COMMENT ON COLUMN pay_rates_and_rules.site_allowance_rate IS
  'Site allowance rate multiplied by total hours worked ($/hr).';
COMMENT ON COLUMN pay_rates_and_rules.productivity_allowance_rate IS
  'AAC productivity allowance rate multiplied by total hours worked ($/hr).';
COMMENT ON COLUMN pay_rates_and_rules.hsr_allowance_rate IS
  'HSR allowance rate multiplied by total hours when worker is HSR flagged ($/hr).';
COMMENT ON COLUMN pay_rates_and_rules.travel_allowance_daily IS
  'Travel NSW / apprentice travel flat daily allowance per worked day.';
COMMENT ON COLUMN pay_rates_and_rules.meal_allowance_daily IS
  'Meal allowance NSW flat daily rate when daily hours meet meal threshold.';
COMMENT ON COLUMN pay_rates_and_rules.overtime_multiplier IS
  'Overtime multiplier applied to base hourly rate (default 2.0 = double time).';
COMMENT ON COLUMN pay_rates_and_rules.leave_flat_hours IS
  'Flat paid hours for auto-generated leave timesheets (no OT/travel).';

INSERT INTO pay_rates_and_rules (
  rule_name,
  preset_key,
  base_hourly_rate,
  saturday_rate,
  sunday_rate,
  public_holiday_rate,
  overtime_15_threshold_hours,
  overtime_20_threshold_hours,
  daily_allowance,
  site_allowance_rate,
  productivity_allowance_rate,
  hsr_allowance_rate,
  travel_allowance_daily,
  meal_allowance_daily,
  overtime_multiplier,
  leave_flat_hours
)
SELECT
  'NSW Site Worker',
  'nsw_site_worker',
  52.00,
  104.00,
  104.00,
  156.00,
  8.00,
  10.00,
  0.00,
  2.50,
  1.20,
  0.65,
  45.00,
  18.50,
  2.00,
  8.00
WHERE NOT EXISTS (
  SELECT 1 FROM pay_rates_and_rules WHERE preset_key = 'nsw_site_worker'
);
