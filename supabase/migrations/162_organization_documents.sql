-- Organisation-wide useful documents library (admin manage, workers read).

CREATE TABLE IF NOT EXISTS organization_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  file_url text NOT NULL,
  file_name text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE organization_documents ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON organization_documents TO anon, authenticated;

DROP POLICY IF EXISTS "Authenticated read organization_documents" ON organization_documents;
CREATE POLICY "Authenticated read organization_documents"
  ON organization_documents FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Authenticated insert organization_documents" ON organization_documents;
CREATE POLICY "Authenticated insert organization_documents"
  ON organization_documents FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated update organization_documents" ON organization_documents;
CREATE POLICY "Authenticated update organization_documents"
  ON organization_documents FOR UPDATE
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated delete organization_documents" ON organization_documents;
CREATE POLICY "Authenticated delete organization_documents"
  ON organization_documents FOR DELETE
  USING (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('organization-documents', 'organization-documents', true)
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

DROP POLICY IF EXISTS "Public read organization-documents bucket" ON storage.objects;
CREATE POLICY "Public read organization-documents bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'organization-documents');

DROP POLICY IF EXISTS "Authenticated upload organization-documents bucket" ON storage.objects;
CREATE POLICY "Authenticated upload organization-documents bucket"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'organization-documents');

DROP POLICY IF EXISTS "Authenticated update organization-documents bucket" ON storage.objects;
CREATE POLICY "Authenticated update organization-documents bucket"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'organization-documents');

DROP POLICY IF EXISTS "Authenticated delete organization-documents bucket" ON storage.objects;
CREATE POLICY "Authenticated delete organization-documents bucket"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'organization-documents');

NOTIFY pgrst, 'reload schema';
