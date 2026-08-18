-- Logo alias column for organisation admin API mappings

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS logo text;

UPDATE organisations
SET logo = COALESCE(logo_url, company_logo)
WHERE logo IS NULL AND (logo_url IS NOT NULL OR company_logo IS NOT NULL);

UPDATE organisations
SET logo_url = COALESCE(logo_url, logo, company_logo)
WHERE logo_url IS NULL AND (logo IS NOT NULL OR company_logo IS NOT NULL);

UPDATE organisations
SET company_logo = COALESCE(company_logo, logo_url, logo)
WHERE company_logo IS NULL AND (logo_url IS NOT NULL OR logo IS NOT NULL);
