-- Outlook-style live email signatures for the EMAIL's module

CREATE TABLE IF NOT EXISTS user_email_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT 'Email Signature',
  body_html text NOT NULL DEFAULT '',
  body_text text,
  is_live boolean NOT NULL DEFAULT false,
  created_by text,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_email_signatures_live
  ON user_email_signatures (is_live, updated_at DESC)
  WHERE is_live = true;

CREATE INDEX IF NOT EXISTS idx_user_email_signatures_updated
  ON user_email_signatures (updated_at DESC);

ALTER TABLE user_email_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read user_email_signatures" ON user_email_signatures;
CREATE POLICY "Allow public read user_email_signatures"
  ON user_email_signatures FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public write user_email_signatures" ON user_email_signatures;
CREATE POLICY "Allow public write user_email_signatures"
  ON user_email_signatures FOR ALL USING (true) WITH CHECK (true);
