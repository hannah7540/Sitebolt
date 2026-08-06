-- Worker profile: cards/vocs JSONB and employment fields
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS worker_code text,
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10, 2),
  ADD COLUMN IF NOT EXISTS cards_vocs jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN workers.cards_vocs IS 'Structured ticket/VOC entries (white card, HRWL, plant VOCs, first aid, inductions)';
COMMENT ON COLUMN workers.worker_code IS 'Internal worker number or code';
COMMENT ON COLUMN workers.employment_type IS 'Employment classification e.g. Full-time, Casual';
COMMENT ON COLUMN workers.hourly_rate IS 'Base hourly pay rate';
