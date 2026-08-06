-- SiteBolt: Tag-Out resolution & service contact fields
-- Run in Supabase SQL Editor after 001_plant_prestarts.sql

ALTER TABLE plant
  ADD COLUMN IF NOT EXISTS service_contact_name text,
  ADD COLUMN IF NOT EXISTS service_contact_phone text,
  ADD COLUMN IF NOT EXISTS next_service_hours numeric,
  ADD COLUMN IF NOT EXISTS next_service_kms numeric;

ALTER TABLE plant_prestarts
  ADD COLUMN IF NOT EXISTS repair_notes text,
  ADD COLUMN IF NOT EXISTS mechanic_invoice_ref text,
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz;

DROP POLICY IF EXISTS "Allow public update plant_prestarts" ON plant_prestarts;
CREATE POLICY "Allow public update plant_prestarts"
  ON plant_prestarts FOR UPDATE USING (true);
