-- Additive tables/columns for interactive plant calendar workflows.
-- Does not alter existing A Plus plant rows.

ALTER TABLE public.plant_prestarts
  ADD COLUMN IF NOT EXISTS is_resolved boolean DEFAULT false;
ALTER TABLE public.plant_prestarts
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

CREATE TABLE IF NOT EXISTS public.plant_maintenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL,
  maintenance_type text NOT NULL CHECK (maintenance_type IN ('maintenance', 'service')),
  scheduled_date date NOT NULL,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plant_maintenance_plant_idx
  ON public.plant_maintenance (plant_id);
CREATE INDEX IF NOT EXISTS plant_maintenance_date_idx
  ON public.plant_maintenance (scheduled_date);

CREATE TABLE IF NOT EXISTS public.plant_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid NOT NULL,
  file_name text NOT NULL,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS plant_documents_plant_idx
  ON public.plant_documents (plant_id);

ALTER TABLE public.plant_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plant_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read plant_maintenance" ON public.plant_maintenance;
CREATE POLICY "authenticated read plant_maintenance" ON public.plant_maintenance
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated write plant_maintenance" ON public.plant_maintenance;
CREATE POLICY "authenticated write plant_maintenance" ON public.plant_maintenance
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated read plant_documents" ON public.plant_documents;
CREATE POLICY "authenticated read plant_documents" ON public.plant_documents
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated write plant_documents" ON public.plant_documents;
CREATE POLICY "authenticated write plant_documents" ON public.plant_documents
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO storage.buckets (id, name, public)
VALUES ('plant-documents', 'plant-documents', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "authenticated plant-documents" ON storage.objects;
CREATE POLICY "authenticated plant-documents" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'plant-documents')
  WITH CHECK (bucket_id = 'plant-documents');
