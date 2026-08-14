-- Production pay_rule_templates rows use id, name, created_at only.
-- Drop updated_at when present so queries never reference a missing column.

ALTER TABLE pay_rule_templates
  DROP COLUMN IF EXISTS updated_at;
