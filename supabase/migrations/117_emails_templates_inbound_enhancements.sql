-- EMAILs module enhancements: template categories, inbound status, attachments bucket

ALTER TABLE email_templates
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'General';

CREATE INDEX IF NOT EXISTS idx_email_templates_category ON email_templates(category);

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE email_messages DROP CONSTRAINT IF EXISTS email_messages_status_check;
ALTER TABLE email_messages ADD CONSTRAINT email_messages_status_check
  CHECK (status IN (
    'draft', 'scheduled', 'sent', 'failed', 'cancelled', 'paused', 'received'
  ));

INSERT INTO storage.buckets (id, name, public)
VALUES ('email-attachments', 'email-attachments', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "Allow public read email-attachments" ON storage.objects';
  EXECUTE 'CREATE POLICY "Allow public read email-attachments" ON storage.objects FOR SELECT USING (bucket_id = ''email-attachments'')';
  EXECUTE 'DROP POLICY IF EXISTS "Allow public insert email-attachments" ON storage.objects';
  EXECUTE 'CREATE POLICY "Allow public insert email-attachments" ON storage.objects FOR INSERT WITH CHECK (bucket_id = ''email-attachments'')';
  EXECUTE 'DROP POLICY IF EXISTS "Allow public update email-attachments" ON storage.objects';
  EXECUTE 'CREATE POLICY "Allow public update email-attachments" ON storage.objects FOR UPDATE USING (bucket_id = ''email-attachments'')';
END $$;

COMMENT ON COLUMN email_templates.category IS 'Template grouping: General, Safety, Timesheets, Operations, etc.';
COMMENT ON COLUMN email_messages.attachment_urls IS 'Public URLs for inbound/outbound email attachments';
