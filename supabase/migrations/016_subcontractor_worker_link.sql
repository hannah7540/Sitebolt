-- Link subcontractor workers to the main workers table
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS is_subcontractor boolean NOT NULL DEFAULT false;

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS subcontractor_id uuid REFERENCES subcontractors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workers_subcontractor_id ON workers(subcontractor_id);

COMMENT ON COLUMN workers.is_subcontractor IS 'True when the worker belongs to a subcontractor company';
COMMENT ON COLUMN workers.subcontractor_id IS 'Parent subcontractor company for subbie workers';
