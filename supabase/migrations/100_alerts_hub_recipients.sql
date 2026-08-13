-- Alerts Hub: designate worker/manager notification recipients

ALTER TABLE expiry_alert_settings
  ADD COLUMN IF NOT EXISTS notification_recipient_worker_ids text[] NOT NULL DEFAULT '{}'::text[];

COMMENT ON COLUMN expiry_alert_settings.notification_recipient_worker_ids IS
  'Worker IDs selected in Organisation > Alerts to receive automated expiry notification emails.';
