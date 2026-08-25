-- SMS thread completion lifecycle

ALTER TABLE sms_messages
  ADD COLUMN IF NOT EXISTS is_completed boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sms_messages_inbound_unread_active
  ON sms_messages (is_read)
  WHERE direction = 'inbound'
    AND is_read = false
    AND is_completed = false;

CREATE INDEX IF NOT EXISTS idx_sms_messages_is_completed
  ON sms_messages (is_completed);
