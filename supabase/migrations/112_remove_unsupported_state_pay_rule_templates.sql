-- Remove pay rule templates for states no longer supported (VIC, QLD, SA, TAS, NT).

DELETE FROM pay_rule_conditions
WHERE template_id IN (
  SELECT id
  FROM pay_rule_templates
  WHERE name IN (
    'VIC Site Worker',
    'QLD Site Worker',
    'SA Site Worker',
    'TAS Site Worker',
    'NT Site Worker'
  )
);

DELETE FROM pay_rule_templates
WHERE name IN (
  'VIC Site Worker',
  'QLD Site Worker',
  'SA Site Worker',
  'TAS Site Worker',
  'NT Site Worker'
);

COMMENT ON TABLE pay_rule_templates IS
  'Named pay rule templates for accounts payroll. Baseline templates: ACT, NSW, WA, NZ Site Worker.';
