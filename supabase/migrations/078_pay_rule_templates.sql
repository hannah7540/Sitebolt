-- Pay rule templates with dynamic conditions + worker assignment

CREATE TABLE IF NOT EXISTS pay_rule_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pay_rule_templates_name ON pay_rule_templates(name);

CREATE TABLE IF NOT EXISTS pay_rule_conditions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES pay_rule_templates(id) ON DELETE CASCADE,
  condition_name text NOT NULL,
  applicable_days text[] NOT NULL DEFAULT '{}',
  time_condition text NOT NULL,
  hours_threshold numeric(5, 2) NOT NULL DEFAULT 0,
  pay_multiplier_type text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pay_rule_conditions_template_id
  ON pay_rule_conditions(template_id);

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS pay_rule_template_id uuid
    REFERENCES pay_rule_templates(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workers_pay_rule_template_id
  ON workers(pay_rule_template_id);

COMMENT ON TABLE pay_rule_templates IS 'Named pay rule templates for accounts payroll.';
COMMENT ON TABLE pay_rule_conditions IS 'Dynamic pay conditions belonging to a pay rule template.';
COMMENT ON COLUMN workers.pay_rule_template_id IS
  'Assigned pay_rule_templates row for payroll rule lookup.';

ALTER TABLE pay_rule_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE pay_rule_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read pay_rule_templates" ON pay_rule_templates;
CREATE POLICY "Allow public read pay_rule_templates"
  ON pay_rule_templates FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert pay_rule_templates" ON pay_rule_templates;
CREATE POLICY "Allow public insert pay_rule_templates"
  ON pay_rule_templates FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update pay_rule_templates" ON pay_rule_templates;
CREATE POLICY "Allow public update pay_rule_templates"
  ON pay_rule_templates FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete pay_rule_templates" ON pay_rule_templates;
CREATE POLICY "Allow public delete pay_rule_templates"
  ON pay_rule_templates FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public read pay_rule_conditions" ON pay_rule_conditions;
CREATE POLICY "Allow public read pay_rule_conditions"
  ON pay_rule_conditions FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert pay_rule_conditions" ON pay_rule_conditions;
CREATE POLICY "Allow public insert pay_rule_conditions"
  ON pay_rule_conditions FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update pay_rule_conditions" ON pay_rule_conditions;
CREATE POLICY "Allow public update pay_rule_conditions"
  ON pay_rule_conditions FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete pay_rule_conditions" ON pay_rule_conditions;
CREATE POLICY "Allow public delete pay_rule_conditions"
  ON pay_rule_conditions FOR DELETE USING (true);

-- Seed NSW Site Worker template if missing
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
      (
        template_id,
        'Basic Pay',
        ARRAY['mon','tue','wed','thu','fri'],
        'first_n_hours',
        8,
        'standard_1x',
        0
      ),
      (
        template_id,
        'Overtime',
        ARRAY['mon','tue','wed','thu','fri'],
        'after_n_hours',
        8,
        'double_2x',
        1
      ),
      (
        template_id,
        'Double Pay',
        ARRAY['sat'],
        'all_hours_worked',
        0,
        'double_2x',
        2
      ),
      (
        template_id,
        'Double Pay',
        ARRAY['sun'],
        'all_hours_worked',
        0,
        'double_2x',
        3
      ),
      (
        template_id,
        'Site Allowance',
        ARRAY['mon','tue','wed','thu','fri','sat','sun'],
        'all_hours_worked',
        0,
        'standard_1x',
        4
      ),
      (
        template_id,
        'Travel',
        ARRAY['mon','tue','wed','thu','fri','sat','sun'],
        'flat_daily_allowance',
        0,
        'flat_daily',
        5
      ),
      (
        template_id,
        'Meal Allowance',
        ARRAY['mon','tue','wed','thu','fri','sat','sun'],
        'after_n_hours',
        10,
        'flat_daily',
        6
      );
  END IF;
END $$;
