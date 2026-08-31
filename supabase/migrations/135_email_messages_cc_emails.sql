-- Ensure optional email_messages columns exist for Communication module inserts.
-- Safe to re-run; older deployments may lack cc_emails in the PostgREST schema cache.

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS cc_emails jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE email_messages
  ADD COLUMN IF NOT EXISTS attachment_urls jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN email_messages.cc_emails IS 'Optional CC recipients (JSON array of email strings)';
