-- Consolidate NSW Apprentice into NSW Site Worker; seed ACT/NZ templates; remove apprentice template.

COMMENT ON COLUMN workers.is_apprentice IS
  'When true, NSW travel exports as Travel NSW Apprentice while using the NSW Site Worker pay rule.';

DO $$
DECLARE
  nsw_id uuid;
  apprentice_id uuid;
BEGIN
  SELECT id INTO nsw_id FROM pay_rule_templates WHERE name = 'NSW Site Worker' LIMIT 1;
  SELECT id INTO apprentice_id FROM pay_rule_templates WHERE name = 'NSW Apprentice Site Worker' LIMIT 1;

  IF nsw_id IS NOT NULL AND apprentice_id IS NOT NULL THEN
    UPDATE workers
    SET pay_rule_template_id = nsw_id
    WHERE pay_rule_template_id = apprentice_id;

    UPDATE workers
    SET pay_rule_id = nsw_id
    WHERE pay_rule_id = apprentice_id;

    DELETE FROM pay_rule_conditions WHERE template_id = apprentice_id;
    DELETE FROM pay_rule_templates WHERE id = apprentice_id;
  ELSIF apprentice_id IS NOT NULL THEN
    DELETE FROM pay_rule_conditions WHERE template_id = apprentice_id;
    DELETE FROM pay_rule_templates WHERE id = apprentice_id;
  END IF;
END $$;

DO $$
DECLARE
  template_id uuid;
BEGIN
  SELECT id INTO template_id FROM pay_rule_templates WHERE name = 'ACT Site Worker' LIMIT 1;
  IF template_id IS NULL THEN
    INSERT INTO pay_rule_templates (name) VALUES ('ACT Site Worker') RETURNING id INTO template_id;

    INSERT INTO pay_rule_conditions (
      template_id, condition_type, condition_name, applicable_days, time_condition,
      hours_threshold, pay_multiplier_type, allowance_trigger, payout_unit, sort_order
    )
    SELECT
      template_id,
      condition_type,
      CASE WHEN condition_name = 'Travel Allowance NSW' THEN 'Travel Allowance ACT' ELSE condition_name END,
      applicable_days,
      time_condition,
      hours_threshold,
      pay_multiplier_type,
      allowance_trigger,
      payout_unit,
      sort_order
    FROM pay_rule_conditions c
    JOIN pay_rule_templates t ON t.id = c.template_id
    WHERE t.name = 'NSW Site Worker';
  END IF;
END $$;

DO $$
DECLARE
  template_id uuid;
BEGIN
  SELECT id INTO template_id FROM pay_rule_templates WHERE name = 'NZ Site Worker' LIMIT 1;
  IF template_id IS NULL THEN
    INSERT INTO pay_rule_templates (name) VALUES ('NZ Site Worker') RETURNING id INTO template_id;

    INSERT INTO pay_rule_conditions (
      template_id, condition_type, condition_name, applicable_days, time_condition,
      hours_threshold, pay_multiplier_type, allowance_trigger, payout_unit, sort_order
    )
    SELECT
      template_id,
      condition_type,
      replace(condition_name, ' WA', ' NZ'),
      applicable_days,
      time_condition,
      hours_threshold,
      pay_multiplier_type,
      allowance_trigger,
      payout_unit,
      sort_order
    FROM pay_rule_conditions c
    JOIN pay_rule_templates t ON t.id = c.template_id
    WHERE t.name = 'WA Site Worker';
  END IF;
END $$;
