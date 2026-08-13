-- Normalize meal allowance on all pay rule templates: >= 10 net worked hours.

DO $$
DECLARE
  template_row record;
  next_sort integer;
BEGIN
  UPDATE pay_rule_conditions
  SET
    hours_threshold = 10,
    allowance_trigger = 'hours_gte_threshold',
    time_condition = 'after_n_hours',
    pay_multiplier_type = 'flat_daily',
    payout_unit = 'daily_flat_1x',
    condition_type = 'allowance'
  WHERE lower(condition_name) LIKE '%meal allowance%';

  FOR template_row IN SELECT id, name FROM pay_rule_templates LOOP
    IF EXISTS (
      SELECT 1
      FROM pay_rule_conditions
      WHERE template_id = template_row.id
        AND lower(condition_name) LIKE '%meal allowance%'
    ) THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(MAX(sort_order), -1) + 1
    INTO next_sort
    FROM pay_rule_conditions
    WHERE template_id = template_row.id;

    INSERT INTO pay_rule_conditions (
      template_id,
      condition_type,
      condition_name,
      applicable_days,
      time_condition,
      hours_threshold,
      pay_multiplier_type,
      allowance_trigger,
      payout_unit,
      sort_order
    )
    VALUES (
      template_row.id,
      'allowance',
      CASE
        WHEN template_row.name ILIKE '%WA%' THEN 'Meal Allowance WA'
        WHEN template_row.name ILIKE '%ACT%' THEN 'Meal Allowance ACT'
        WHEN template_row.name ILIKE '%NZ%' THEN 'Meal Allowance NZ'
        ELSE 'Meal Allowance NSW'
      END,
      ARRAY['mon','tue','wed','thu','fri','sat','sun'],
      'after_n_hours',
      10,
      'flat_daily',
      'hours_gte_threshold',
      'daily_flat_1x',
      next_sort
    );
  END LOOP;
END $$;

UPDATE pay_rates_and_rules
SET meal_allowance_threshold = 10
WHERE meal_allowance_threshold IS NULL OR meal_allowance_threshold <= 0 OR meal_allowance_threshold <> 10;

COMMENT ON COLUMN pay_rates_and_rules.meal_allowance_threshold IS
  'Net worked hours (excluding unpaid breaks) required before meal allowance applies. Default 10.';
