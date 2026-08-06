-- Extended subcontractor plant machinery fields and document URLs
ALTER TABLE subcontractor_plant
  ADD COLUMN IF NOT EXISTS equipment_category text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS current_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_service_hours numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_service_date date,
  ADD COLUMN IF NOT EXISTS service_history_doc_url text,
  ADD COLUMN IF NOT EXISTS plant_risk_assessment_doc_url text,
  ADD COLUMN IF NOT EXISTS is_subcontractor_plant boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ownership_type text;

COMMENT ON COLUMN subcontractor_plant.equipment_category IS 'Plant category e.g. Excavator, Dozer, Dump Truck';
COMMENT ON COLUMN subcontractor_plant.is_subcontractor_plant IS 'True when plant belongs to a subcontractor company';
