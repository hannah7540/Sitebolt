-- Additional organisation columns for admin API payload normalization

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS website text,
  ADD COLUMN IF NOT EXISTS street_address text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'Australia',
  ADD COLUMN IF NOT EXISTS postal_code text;

UPDATE organisations
SET name = company_name
WHERE name IS NULL AND company_name IS NOT NULL;

UPDATE organisations
SET street_address = address
WHERE street_address IS NULL AND address IS NOT NULL;

UPDATE organisations
SET city = suburb
WHERE city IS NULL AND suburb IS NOT NULL;

UPDATE organisations
SET postal_code = postcode
WHERE postal_code IS NULL AND postcode IS NOT NULL;

UPDATE organisations
SET country = 'Australia'
WHERE country IS NULL;
