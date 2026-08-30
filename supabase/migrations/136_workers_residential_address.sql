-- Structured residential address fields for workers

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS suburb text,
  ADD COLUMN IF NOT EXISTS postcode text;

COMMENT ON COLUMN workers.address_line_1 IS 'Residential address line 1';
COMMENT ON COLUMN workers.address_line_2 IS 'Residential address line 2 (optional)';
COMMENT ON COLUMN workers.suburb IS 'Residential suburb / city';
COMMENT ON COLUMN workers.postcode IS 'Residential postal / zip code';
