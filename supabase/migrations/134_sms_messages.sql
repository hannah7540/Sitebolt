-- Two-way SMS Communication Hub

CREATE TABLE IF NOT EXISTS sms_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  direction text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  from_number text NOT NULL DEFAULT '',
  to_number text NOT NULL DEFAULT '',
  message_body text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'sent', 'delivered', 'failed', 'received')),
  worker_id uuid REFERENCES workers(id) ON DELETE SET NULL,
  project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  is_read boolean NOT NULL DEFAULT false,
  scheduled_at timestamptz,
  recurrence text,
  twilio_sid text,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_messages_direction_created
  ON sms_messages (direction, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sms_messages_worker_id
  ON sms_messages (worker_id);

CREATE INDEX IF NOT EXISTS idx_sms_messages_project_id
  ON sms_messages (project_id);

CREATE INDEX IF NOT EXISTS idx_sms_messages_inbound_unread
  ON sms_messages (is_read)
  WHERE direction = 'inbound' AND is_read = false;

CREATE INDEX IF NOT EXISTS idx_sms_messages_from_number
  ON sms_messages (from_number);

CREATE INDEX IF NOT EXISTS idx_sms_messages_to_number
  ON sms_messages (to_number);

CREATE INDEX IF NOT EXISTS idx_sms_messages_scheduled
  ON sms_messages (scheduled_at)
  WHERE status = 'queued' AND scheduled_at IS NOT NULL;

ALTER TABLE sms_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_messages_service_role_all" ON sms_messages;
CREATE POLICY "sms_messages_service_role_all"
  ON sms_messages
  FOR ALL
  USING (true)
  WITH CHECK (true);
