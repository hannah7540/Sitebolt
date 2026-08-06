-- Extend RFIs with full register field set

ALTER TABLE rfis ADD COLUMN IF NOT EXISTS zone_area text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS discipline text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS subject text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS priority text DEFAULT 'Medium';
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS due_date date;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS response_resolution text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS action_required text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS close_out_date timestamptz;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS closed_by text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS document_url text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS comments text;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS date_raised date;
ALTER TABLE rfis ADD COLUMN IF NOT EXISTS raised_by text;

UPDATE rfis SET subject = title WHERE subject IS NULL OR subject = '';
UPDATE rfis SET raised_by = requested_by_name WHERE raised_by IS NULL OR raised_by = '';
UPDATE rfis
SET response_resolution = action_response
WHERE response_resolution IS NULL AND action_response IS NOT NULL;
UPDATE rfis SET date_raised = created_at::date WHERE date_raised IS NULL;

UPDATE rfis SET status = 'Open' WHERE status = 'Outstanding';
UPDATE rfis SET status = 'Pending' WHERE status = 'Assigned';
UPDATE rfis SET status = 'Closed' WHERE status = 'Completed';

ALTER TABLE rfis DROP CONSTRAINT IF EXISTS rfis_status_check;

CREATE INDEX IF NOT EXISTS idx_rfis_priority ON rfis(priority);
CREATE INDEX IF NOT EXISTS idx_rfis_category ON rfis(category);
CREATE INDEX IF NOT EXISTS idx_rfis_zone_area ON rfis(zone_area);
CREATE INDEX IF NOT EXISTS idx_rfis_due_date ON rfis(due_date);

COMMENT ON COLUMN rfis.zone_area IS 'Site zone or area for the RFI';
COMMENT ON COLUMN rfis.attachments IS 'JSON array of {name,url,type} file/link attachments';
