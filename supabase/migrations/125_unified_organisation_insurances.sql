-- Unified organisation insurance schema (company_insurances + organisation_insurances)

ALTER TABLE company_insurances
  ADD COLUMN IF NOT EXISTS custom_type_name text,
  ADD COLUMN IF NOT EXISTS provider text,
  ADD COLUMN IF NOT EXISTS file_url text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS notes text;

UPDATE company_insurances
SET file_url = document_url
WHERE file_url IS NULL AND document_url IS NOT NULL;

UPDATE company_insurances
SET provider = insurer
WHERE provider IS NULL AND insurer IS NOT NULL;

CREATE TABLE IF NOT EXISTS organisation_insurances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  insurance_type text NOT NULL,
  custom_type_name text,
  policy_number text DEFAULT '',
  provider text DEFAULT '',
  all_states boolean NOT NULL DEFAULT false,
  states text[] NOT NULL DEFAULT '{}'::text[],
  start_date date,
  date_obtained date,
  expiry_date date,
  file_url text,
  file_name text,
  document_url text,
  insurer text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organisation_insurances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read organisation_insurances" ON organisation_insurances;
CREATE POLICY "Allow public read organisation_insurances"
  ON organisation_insurances FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert organisation_insurances" ON organisation_insurances;
CREATE POLICY "Allow public insert organisation_insurances"
  ON organisation_insurances FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update organisation_insurances" ON organisation_insurances;
CREATE POLICY "Allow public update organisation_insurances"
  ON organisation_insurances FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public delete organisation_insurances" ON organisation_insurances;
CREATE POLICY "Allow public delete organisation_insurances"
  ON organisation_insurances FOR DELETE USING (true);

CREATE OR REPLACE FUNCTION sync_organisation_insurance_start_dates()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.date_obtained IS NULL AND NEW.start_date IS NOT NULL THEN
    NEW.date_obtained := NEW.start_date;
  END IF;
  IF NEW.start_date IS NULL AND NEW.date_obtained IS NOT NULL THEN
    NEW.start_date := NEW.date_obtained;
  END IF;
  IF NEW.date_obtained IS NOT NULL AND NEW.start_date IS NOT NULL
     AND NEW.date_obtained IS DISTINCT FROM NEW.start_date THEN
    NEW.start_date := NEW.date_obtained;
  END IF;
  IF NEW.file_url IS NULL AND NEW.document_url IS NOT NULL THEN
    NEW.file_url := NEW.document_url;
  END IF;
  IF NEW.document_url IS NULL AND NEW.file_url IS NOT NULL THEN
    NEW.document_url := NEW.file_url;
  END IF;
  IF NEW.provider IS NULL AND NEW.insurer IS NOT NULL THEN
    NEW.provider := NEW.insurer;
  END IF;
  IF NEW.insurer IS NULL AND NEW.provider IS NOT NULL THEN
    NEW.insurer := NEW.provider;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organisation_insurances_sync_fields ON organisation_insurances;
CREATE TRIGGER trg_organisation_insurances_sync_fields
  BEFORE INSERT OR UPDATE ON organisation_insurances
  FOR EACH ROW
  EXECUTE FUNCTION sync_organisation_insurance_start_dates();

COMMENT ON TABLE organisation_insurances IS 'Mirror of company_insurances for unified organisation insurance API';
