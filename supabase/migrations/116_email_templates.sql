-- Migration 116: canonical email_templates table for the EMAILs module

CREATE TABLE IF NOT EXISTS email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT 'general',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_title ON email_templates(title);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);
CREATE INDEX IF NOT EXISTS idx_email_templates_updated_at ON email_templates(updated_at DESC);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_templates TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_templates TO PUBLIC;

DROP POLICY IF EXISTS "email_templates_select_public" ON email_templates;
CREATE POLICY "email_templates_select_public"
  ON email_templates FOR SELECT
  TO public, anon, authenticated, service_role
  USING (true);

DROP POLICY IF EXISTS "email_templates_insert_public" ON email_templates;
CREATE POLICY "email_templates_insert_public"
  ON email_templates FOR INSERT
  TO public, anon, authenticated, service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "email_templates_update_public" ON email_templates;
CREATE POLICY "email_templates_update_public"
  ON email_templates FOR UPDATE
  TO public, anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "email_templates_delete_public" ON email_templates;
CREATE POLICY "email_templates_delete_public"
  ON email_templates FOR DELETE
  TO public, anon, authenticated, service_role
  USING (true);

COMMENT ON TABLE email_templates IS 'Reusable email templates for the EMAILs module';
COMMENT ON COLUMN email_templates.title IS 'Template display name';
COMMENT ON COLUMN email_templates.body IS 'HTML or rich-text template body';
