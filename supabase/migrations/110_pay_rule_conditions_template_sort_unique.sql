-- Enable idempotent upsert of payroll conditions per template row.
CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_rule_conditions_template_sort
  ON pay_rule_conditions (template_id, sort_order);
