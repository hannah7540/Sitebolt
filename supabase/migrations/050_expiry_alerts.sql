-- Expiry alert settings, audit logs, and optional insurer on company insurances

ALTER TABLE company_insurances
  ADD COLUMN IF NOT EXISTS insurer text;

CREATE TABLE IF NOT EXISTS expiry_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automated_emails_enabled boolean NOT NULL DEFAULT true,
  secondary_recipient_emails text[] NOT NULL DEFAULT '{}'::text[],
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO expiry_alert_settings (automated_emails_enabled, secondary_recipient_emails)
SELECT true, '{}'::text[]
WHERE NOT EXISTS (SELECT 1 FROM expiry_alert_settings LIMIT 1);

CREATE TABLE IF NOT EXISTS expiry_alert_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('worker_qualification', 'company_insurance')),
  entity_id text NOT NULL,
  entity_key text NOT NULL,
  alert_kind text NOT NULL CHECK (
    alert_kind IN ('worker_digest', 'insurance_digest', 'manual_worker_notify')
  ),
  recipient_email text NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expiry_alert_logs_entity_key_sent
  ON expiry_alert_logs(entity_key, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_expiry_alert_logs_entity_type_sent
  ON expiry_alert_logs(entity_type, sent_at DESC);

ALTER TABLE expiry_alert_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE expiry_alert_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read expiry_alert_settings" ON expiry_alert_settings;
CREATE POLICY "Allow public read expiry_alert_settings"
  ON expiry_alert_settings FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public update expiry_alert_settings" ON expiry_alert_settings;
CREATE POLICY "Allow public update expiry_alert_settings"
  ON expiry_alert_settings FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public insert expiry_alert_settings" ON expiry_alert_settings;
CREATE POLICY "Allow public insert expiry_alert_settings"
  ON expiry_alert_settings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public read expiry_alert_logs" ON expiry_alert_logs;
CREATE POLICY "Allow public read expiry_alert_logs"
  ON expiry_alert_logs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert expiry_alert_logs" ON expiry_alert_logs;
CREATE POLICY "Allow public insert expiry_alert_logs"
  ON expiry_alert_logs FOR INSERT WITH CHECK (true);

COMMENT ON TABLE expiry_alert_settings IS 'Automated 30-day expiry email alert configuration';
COMMENT ON TABLE expiry_alert_logs IS 'Dedupe log for expiry alert emails (7-day window per entity)';
