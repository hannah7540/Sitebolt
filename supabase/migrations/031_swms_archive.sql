-- Archive status on SWMS document tables
ALTER TABLE swms_documents
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE swms_documents
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active';

ALTER TABLE swms
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;

ALTER TABLE swms
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active';

COMMENT ON COLUMN swms_documents.is_archived IS 'When true, SWMS is hidden from active worker views';
COMMENT ON COLUMN swms_documents.status IS 'Active or Archived';
COMMENT ON COLUMN swms.is_archived IS 'When true, SWMS is hidden from active worker views';
COMMENT ON COLUMN swms.status IS 'Active or Archived';

DROP POLICY IF EXISTS "Allow public delete swms_documents" ON swms_documents;
CREATE POLICY "Allow public delete swms_documents"
  ON swms_documents FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public delete swms" ON swms;
CREATE POLICY "Allow public delete swms"
  ON swms FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow public delete swms_assignments" ON swms_assignments;
CREATE POLICY "Allow public delete swms_assignments"
  ON swms_assignments FOR DELETE USING (true);
