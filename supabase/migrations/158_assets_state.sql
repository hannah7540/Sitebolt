-- Optional location state for lasers and pressure gauges.

ALTER TABLE assets
  ADD COLUMN IF NOT EXISTS state text;
