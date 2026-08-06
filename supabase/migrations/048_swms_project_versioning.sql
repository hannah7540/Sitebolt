-- SWMS project scope, versioning, and master/site-specific library support

ALTER TABLE swms_documents
  ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS swms_scope text NOT NULL DEFAULT 'company'
    CHECK (swms_scope IN ('company', 'site_specific')),
  ADD COLUMN IF NOT EXISTS version text NOT NULL DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS master_swms_id uuid REFERENCES swms_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS previous_version_id uuid REFERENCES swms_documents(id) ON DELETE SET NULL;

ALTER TABLE swms
  ADD COLUMN IF NOT EXISTS project_id uuid,
  ADD COLUMN IF NOT EXISTS swms_scope text DEFAULT 'company',
  ADD COLUMN IF NOT EXISTS version text DEFAULT '1.0',
  ADD COLUMN IF NOT EXISTS master_swms_id uuid,
  ADD COLUMN IF NOT EXISTS previous_version_id uuid;

CREATE INDEX IF NOT EXISTS idx_swms_documents_project_id ON swms_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_swms_documents_scope ON swms_documents(swms_scope);
CREATE INDEX IF NOT EXISTS idx_swms_documents_master ON swms_documents(master_swms_id);
CREATE INDEX IF NOT EXISTS idx_swms_project_id ON swms(project_id);
