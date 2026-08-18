-- Organisation insurance policy start / date obtained

ALTER TABLE company_insurances
  ADD COLUMN IF NOT EXISTS date_obtained date,
  ADD COLUMN IF NOT EXISTS start_date date;

COMMENT ON COLUMN company_insurances.date_obtained IS 'Policy start / date obtained';
COMMENT ON COLUMN company_insurances.start_date IS 'Alias for date_obtained (kept in sync)';

CREATE OR REPLACE FUNCTION sync_company_insurance_start_dates()
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
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_company_insurances_sync_start_dates ON company_insurances;
CREATE TRIGGER trg_company_insurances_sync_start_dates
  BEFORE INSERT OR UPDATE ON company_insurances
  FOR EACH ROW
  EXECUTE FUNCTION sync_company_insurance_start_dates();
