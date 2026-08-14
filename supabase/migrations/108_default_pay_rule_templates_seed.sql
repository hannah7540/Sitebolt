-- Idempotent seed for baseline site worker pay rule templates (NSW, ACT, VIC, QLD, WA, NZ).

DO $$
DECLARE
  template_id uuid;
BEGIN
  SELECT id INTO template_id
  FROM pay_rule_templates
  WHERE name = 'NSW Site Worker'
  LIMIT 1;

  IF template_id IS NULL THEN
    INSERT INTO pay_rule_templates (name)
    VALUES ('NSW Site Worker')
    RETURNING id INTO template_id;

    INSERT INTO pay_rule_conditions (
      template_id,
      condition_name,
      applicable_days,
      time_condition,
      hours_threshold,
      pay_multiplier_type,
      sort_order
    )
    VALUES
      (template_id, 'Basic Pay', ARRAY['mon','tue','wed','thu','fri'], 'first_n_hours', 8, 'standard_1x', 0),
      (template_id, 'Overtime', ARRAY['mon','tue','wed','thu','fri'], 'after_n_hours', 8, 'double_2x', 1),
      (template_id, 'Double Pay', ARRAY['sat'], 'all_hours_worked', 0, 'double_2x', 2),
      (template_id, 'Double Pay', ARRAY['sun'], 'all_hours_worked', 0, 'double_2x', 3),
      (template_id, 'Site Allowance', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'all_hours_worked', 0, 'standard_1x', 4),
      (template_id, 'Travel', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'flat_daily_allowance', 0, 'flat_daily', 5),
      (template_id, 'Meal Allowance', ARRAY['mon','tue','wed','thu','fri','sat','sun'], 'after_n_hours', 10, 'flat_daily', 6);
  END IF;
END $$;

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
  source_id uuid;
  target_id uuid;
  target_name text;
  travel_label text;
BEGIN
  SELECT id INTO source_id FROM pay_rule_templates WHERE name = 'NSW Site Worker' LIMIT 1;
  IF source_id IS NULL THEN
    RETURN;
  END IF;

  FOR target_name, travel_label IN
    SELECT * FROM (VALUES
      ('ACT Site Worker', 'Travel Allowance ACT'),
      ('VIC Site Worker', 'Travel Allowance VIC'),
      ('QLD Site Worker', 'Travel Allowance QLD')
    ) AS presets(name, travel_name)
  LOOP
    SELECT id INTO target_id FROM pay_rule_templates WHERE name = target_name LIMIT 1;

    IF target_id IS NULL THEN
      INSERT INTO pay_rule_templates (name)
      VALUES (target_name)
      RETURNING id INTO target_id;

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
      SELECT
        target_id,
        c.condition_type,
        CASE
          WHEN c.condition_name = 'Travel Allowance NSW' THEN travel_label
          WHEN c.condition_name = 'Travel' THEN travel_label
          ELSE c.condition_name
        END,
        c.applicable_days,
        c.time_condition,
        c.hours_threshold,
        c.pay_multiplier_type,
        c.allowance_trigger,
        c.payout_unit,
        c.sort_order
      FROM pay_rule_conditions c
      WHERE c.template_id = source_id;
    END IF;
  END LOOP;
END $$;

DO $$
DECLARE
  source_id uuid;
  target_id uuid;
BEGIN
  SELECT id INTO source_id FROM pay_rule_templates WHERE name = 'WA Site Worker' LIMIT 1;
  IF source_id IS NULL THEN
    RETURN;
  END IF;

  SELECT id INTO target_id FROM pay_rule_templates WHERE name = 'NZ Site Worker' LIMIT 1;

  IF target_id IS NULL THEN
    INSERT INTO pay_rule_templates (name)
    VALUES ('NZ Site Worker')
    RETURNING id INTO target_id;

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
    SELECT
      target_id,
      c.condition_type,
      replace(c.condition_name, ' WA', ' NZ'),
      c.applicable_days,
      c.time_condition,
      c.hours_threshold,
      c.pay_multiplier_type,
      c.allowance_trigger,
      c.payout_unit,
      c.sort_order
    FROM pay_rule_conditions c
    WHERE c.template_id = source_id;
  END IF;
END $$;

COMMENT ON TABLE pay_rule_templates IS
  'Named pay rule templates for accounts payroll. Baseline templates: NSW, ACT, VIC, QLD, WA, NZ Site Worker.';
