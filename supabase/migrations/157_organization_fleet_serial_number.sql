-- Optional serial number on organisation fleet vehicles.

ALTER TABLE organization_fleet
  ADD COLUMN IF NOT EXISTS serial_number text;
