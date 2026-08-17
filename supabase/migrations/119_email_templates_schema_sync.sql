-- Sync legacy email_templates columns (name/body_html) to canonical title/body schema

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'name'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'title'
  ) THEN
    ALTER TABLE email_templates RENAME COLUMN name TO title;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'body_html'
  ) AND NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'body'
  ) THEN
    ALTER TABLE email_templates RENAME COLUMN body_html TO body;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'name'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'title'
  ) THEN
    UPDATE email_templates
    SET title = COALESCE(NULLIF(title, ''), name)
    WHERE COALESCE(title, '') = '';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'body_html'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'body'
  ) THEN
    UPDATE email_templates
    SET body = COALESCE(NULLIF(body, ''), body_html)
    WHERE COALESCE(body, '') = '';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'name'
  ) THEN
    ALTER TABLE email_templates DROP COLUMN name;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'body_html'
  ) THEN
    ALTER TABLE email_templates DROP COLUMN body_html;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'body_text'
  ) THEN
    ALTER TABLE email_templates DROP COLUMN body_text;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'email_templates'
      AND column_name = 'created_by_name'
  ) THEN
    ALTER TABLE email_templates DROP COLUMN created_by_name;
  END IF;
END $$;

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS body text,
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general';

UPDATE email_templates
SET title = COALESCE(NULLIF(title, ''), subject, 'Untitled template')
WHERE title IS NULL OR title = '';

UPDATE email_templates
SET body = COALESCE(body, '')
WHERE body IS NULL;

ALTER TABLE email_templates
  ALTER COLUMN title SET NOT NULL,
  ALTER COLUMN body SET NOT NULL,
  ALTER COLUMN subject SET DEFAULT '',
  ALTER COLUMN category SET DEFAULT 'general';

CREATE INDEX IF NOT EXISTS idx_email_templates_title ON email_templates(title);
CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);

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

DROP POLICY IF EXISTS "Allow public read email_templates" ON email_templates;
DROP POLICY IF EXISTS "Allow public write email_templates" ON email_templates;
