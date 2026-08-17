-- SiteBolt EMAIL's communication module: messages, threading, scheduling
-- (email_templates is created in 116_email_templates.sql)

CREATE TABLE IF NOT EXISTS email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid,
  parent_message_id uuid REFERENCES email_messages(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'outbound'
    CHECK (direction IN ('inbound', 'outbound')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'scheduled', 'sent', 'failed', 'cancelled', 'paused')),
  subject text NOT NULL DEFAULT '',
  body_html text NOT NULL DEFAULT '',
  body_text text,
  from_email text,
  to_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  cc_emails jsonb NOT NULL DEFAULT '[]'::jsonb,
  target_mode text
    CHECK (target_mode IS NULL OR target_mode IN (
      'all_workers', 'selected_workers', 'by_project', 'custom_emails'
    )),
  target_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  template_id uuid REFERENCES email_templates(id) ON DELETE SET NULL,
  scheduled_for timestamptz,
  recurrence_rule text
    CHECK (recurrence_rule IS NULL OR recurrence_rule IN (
      'daily', 'weekly', 'fortnightly', 'monthly'
    )),
  recurrence_active boolean NOT NULL DEFAULT true,
  last_sent_at timestamptz,
  sent_at timestamptz,
  is_read boolean NOT NULL DEFAULT false,
  read_at timestamptz,
  sender_worker_id text,
  sender_name text,
  sender_email text,
  external_message_id text,
  error_message text,
  created_by text,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_messages_thread ON email_messages(thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_email_messages_direction ON email_messages(direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_messages_status ON email_messages(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_email_messages_unread ON email_messages(direction, is_read)
  WHERE direction = 'inbound';

ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read email_messages" ON email_messages;
CREATE POLICY "Allow public read email_messages"
  ON email_messages FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow public write email_messages" ON email_messages;
CREATE POLICY "Allow public write email_messages"
  ON email_messages FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE email_messages IS 'Outbound/inbound email messages with scheduling and threading';
