-- Per-user SMS/email notification read state.
-- Clearing a badge for one admin must not clear it for another.

CREATE TABLE IF NOT EXISTS user_notification_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  message_id uuid NOT NULL,
  type text NOT NULL CHECK (type IN ('sms', 'email')),
  read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, message_id, type)
);

CREATE INDEX IF NOT EXISTS idx_user_notification_reads_user_type
  ON user_notification_reads (user_id, type, read_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_notification_reads_message
  ON user_notification_reads (message_id, type);

ALTER TABLE user_notification_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_notification_reads_own_rows" ON user_notification_reads;
CREATE POLICY "user_notification_reads_own_rows"
  ON user_notification_reads
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "user_notification_reads_service_role_all" ON user_notification_reads;
CREATE POLICY "user_notification_reads_service_role_all"
  ON user_notification_reads
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
