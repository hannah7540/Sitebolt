-- Unread tracking for master dashboard Plant Pre-starts widget.

ALTER TABLE plant_prestarts
  ADD COLUMN IF NOT EXISTS is_read boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_at timestamptz;

NOTIFY pgrst, 'reload schema';
