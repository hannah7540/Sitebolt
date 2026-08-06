-- SiteBolt: Inline service/calibration contact fields on assets
-- Run in Supabase SQL Editor after 043_asset_management.sql

ALTER TABLE assets ADD COLUMN IF NOT EXISTS service_contact_name text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS service_contact_company text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS service_contact_phone text;
ALTER TABLE assets ADD COLUMN IF NOT EXISTS service_contact_email text;

COMMENT ON COLUMN assets.service_contact_name IS 'Servicing/calibration contact person';
COMMENT ON COLUMN assets.service_contact_company IS 'Servicing/calibration company name';
COMMENT ON COLUMN assets.service_contact_phone IS 'Servicing/calibration contact phone';
COMMENT ON COLUMN assets.service_contact_email IS 'Servicing/calibration contact email';
