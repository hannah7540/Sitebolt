-- Refresh WA Site Worker pay rule conditions to match current specifications

DO $$
DECLARE
  template_id uuid;
BEGIN
  SELECT id INTO template_id
  FROM pay_rule_templates
  WHERE name = 'WA Site Worker'
  LIMIT 1;

  IF template_id IS NULL THEN
    INSERT INTO pay_rule_templates (name)
    VALUES ('WA Site Worker')
    RETURNING id INTO template_id;
  ELSE
    DELETE FROM pay_rule_conditions WHERE template_id = template_id;
  END IF;

  INSERT INTO pay_rule_conditions (
    template_id, condition_name, applicable_days, time_condition,
    hours_threshold, pay_multiplier_type, sort_order
  )
  VALUES
    (template_id, 'Base Hourly', ARRAY['mon','tue','wed','thu','fri'], 'first_n_hours', 8, 'standard_1x', 0),
    (template_id, 'Overtime 1.5x (Mon-Fri)', ARRAY['mon','tue','wed','thu','fri'], 'after_n_hours', 8, 'time_and_half_1_5x', 1),
    (template_id, 'Overtime 1.5x (Weekend)', ARRAY['sat','sun'], 'all_hours_worked', 0, 'time_and_half_1_5x', 2),
    (template_id, 'Personal Leave Pay', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'flat_daily_allowance', 8, 'flat_daily', 3),
    (template_id, 'Annual Leave Pay', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'flat_daily_allowance', 8, 'flat_daily', 4),
    (template_id, 'Annual Leave Loading', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'flat_daily_allowance', 8, 'flat_daily', 5),
    (template_id, 'RDO Taken', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'flat_daily_allowance', 8, 'flat_daily', 6),
    (template_id, 'Leave Without Pay', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'flat_daily_allowance', 0, 'flat_daily', 7),
    (template_id, 'Public Holiday Pay', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'flat_daily_allowance', 8, 'flat_daily', 8);
END $$;
