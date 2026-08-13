-- Add standard leave conditions (including Annual Leave Loading) to all pay rule templates.

DO $$
DECLARE
  template_row record;
  next_sort integer;
  leave_spec record;
BEGIN
  FOR template_row IN SELECT id FROM pay_rule_templates LOOP
    FOR leave_spec IN
      SELECT *
      FROM (
        VALUES
          ('Personal Leave Pay', 8::numeric),
          ('Annual Leave Pay', 8::numeric),
          ('Annual Leave Loading', 8::numeric),
          ('RDO Taken', 8::numeric),
          ('Leave Without Pay', 0::numeric),
          ('Public Holiday Pay', 8::numeric)
      ) AS specs(condition_name, hours_threshold)
    LOOP
      IF EXISTS (
        SELECT 1
        FROM pay_rule_conditions
        WHERE template_id = template_row.id
          AND lower(condition_name) = lower(leave_spec.condition_name)
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
        leave_spec.condition_name,
        ARRAY['mon','tue','wed','thu','fri','sat','sun'],
        'flat_daily_allowance',
        leave_spec.hours_threshold,
        'flat_daily',
        'flat_per_day_worked',
        'daily_flat_1x',
        next_sort
      );
    END LOOP;
  END LOOP;
END $$;

COMMENT ON TABLE pay_rule_conditions IS
  'Dynamic pay conditions belonging to a pay rule template. Standard leave rows include Annual Leave Loading.';
