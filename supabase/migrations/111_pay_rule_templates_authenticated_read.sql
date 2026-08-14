-- Restore read access to pay rule tables for signed-in users (migration 090 removed public read).
-- Writes remain platform-admin / service-role only.

DROP POLICY IF EXISTS "Authenticated read pay_rule_templates" ON pay_rule_templates;
CREATE POLICY "Authenticated read pay_rule_templates"
  ON pay_rule_templates FOR SELECT
  USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "Authenticated read pay_rule_conditions" ON pay_rule_conditions;
CREATE POLICY "Authenticated read pay_rule_conditions"
  ON pay_rule_conditions FOR SELECT
  USING (public.is_authenticated_user());
