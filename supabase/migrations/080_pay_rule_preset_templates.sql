-- Seed WA Site Worker and NSW Apprentice Site Worker pay rule templates

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

    INSERT INTO pay_rule_conditions (
      template_id, condition_name, applicable_days, time_condition,
      hours_threshold, pay_multiplier_type, sort_order
    )
    VALUES
      (template_id, 'Basic Pay', ARRAY['mon','tue','wed','thu','fri'], 'first_n_hours', 8, 'standard_1x', 0),
      (template_id, 'Overtime', ARRAY['mon','tue','wed','thu','fri'], 'after_n_hours', 8, 'double_2x', 1),
      (template_id, 'Double Pay', ARRAY['sat','sun'], 'all_hours_worked', 0, 'double_2x', 2),
      (template_id, 'Site Allowance WA', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'all_hours_worked', 0, 'standard_1x', 3),
      (template_id, 'Travel Allowance WA', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'flat_daily_allowance', 0, 'flat_daily', 4),
      (template_id, 'Meal Allowance WA', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'after_n_hours', 10, 'flat_daily', 5);
  END IF;
END $$;

DO $$
DECLARE
  template_id uuid;
BEGIN
  SELECT id INTO template_id
  FROM pay_rule_templates
  WHERE name = 'NSW Apprentice Site Worker'
  LIMIT 1;

  IF template_id IS NULL THEN
    INSERT INTO pay_rule_templates (name)
    VALUES ('NSW Apprentice Site Worker')
    RETURNING id INTO template_id;

    INSERT INTO pay_rule_conditions (
      template_id, condition_name, applicable_days, time_condition,
      hours_threshold, pay_multiplier_type, sort_order
    )
    VALUES
      (template_id, 'Apprentice Basic Pay', ARRAY['mon','tue','wed','thu','fri'], 'first_n_hours', 8, 'standard_1x', 0),
      (template_id, 'Apprentice Overtime', ARRAY['mon','tue','wed','thu','fri'], 'after_n_hours', 8, 'time_and_half_1_5x', 1),
      (template_id, 'Weekend Pay', ARRAY['sat','sun'], 'all_hours_worked', 0, 'double_2x', 2),
      (template_id, 'Site Allowance 2026', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'all_hours_worked', 0, 'standard_1x', 3),
      (template_id, 'Apprentice Travel NSW', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'flat_daily_allowance', 0, 'flat_daily', 4),
      (template_id, 'Meal Allowance NSW', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'after_n_hours', 10, 'flat_daily', 5);
  END IF;
END $$;
