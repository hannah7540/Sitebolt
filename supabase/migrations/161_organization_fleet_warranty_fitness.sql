-- Optional warranty / fitness expiry and document on organisation fleet vehicles.

ALTER TABLE organization_fleet
  ADD COLUMN IF NOT EXISTS warranty_fitness_expiry_date date,
  ADD COLUMN IF NOT EXISTS warranty_fitness_document_url text;
