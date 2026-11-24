-- Safe CREATE TABLE IF NOT EXISTS for live UI tables missing from the hosted schema cache.
-- Types match existing repo migrations. Review before running in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY,
  email text,
  full_name text,
  role text NOT NULL DEFAULT 'general_worker',
  worker_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  project_id text
);

CREATE TABLE IF NOT EXISTS public.itc_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  zone_code text NOT NULL,
  zone_name text NOT NULL,
  map_x numeric(6, 4),
  map_y numeric(6, 4),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid,
  project_id text,
  step_key text NOT NULL,
  step_index integer NOT NULL,
  author_id text NOT NULL,
  author_name text NOT NULL,
  comments text,
  field_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  signature_url text,
  status text NOT NULL DEFAULT 'draft',
  submitted_at timestamptz,
  verified_by text,
  verified_by_name text,
  verified_at timestamptz,
  signed_at timestamptz,
  signed_by_worker_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_step_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid,
  project_id text,
  step_key text NOT NULL DEFAULT 'general',
  activity_number integer,
  photo_url text NOT NULL,
  gps_lat numeric(10, 7),
  gps_lng numeric(10, 7),
  captured_at timestamptz,
  uploaded_by text,
  uploaded_by_name text,
  is_approved_for_export boolean NOT NULL DEFAULT false,
  approved_by text,
  approved_by_name text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_project_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text NOT NULL DEFAULT 'image/png',
  uploaded_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_drawing_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid,
  project_id text NOT NULL,
  map_x numeric(6, 4) NOT NULL,
  map_y numeric(6, 4) NOT NULL,
  service_type text NOT NULL,
  upstream_pit_number text,
  downstream_pit_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_inspection_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid,
  project_id text,
  activity_number integer NOT NULL,
  title text NOT NULL,
  requires_photo boolean NOT NULL DEFAULT false,
  check_by text,
  checked_date date,
  comments text,
  photo_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_compaction_test_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL,
  itc_id uuid NOT NULL,
  project_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (test_id, itc_id)
);

CREATE TABLE IF NOT EXISTS public.project_itp_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itp_id uuid,
  project_id text,
  item_number integer NOT NULL,
  description text NOT NULL,
  acceptance_criteria text,
  point_type text NOT NULL DEFAULT 'S',
  status text NOT NULL DEFAULT 'pending',
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidence_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  inspector_name text,
  signed_off_at timestamptz,
  signature_url text,
  form_data jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pipe_dimension_specs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,
  category text,
  diameter_mm numeric,
  material_and_size text,
  min_horizontal_sep_mm numeric,
  min_vertical_sep_mm numeric,
  min_bedding_mm numeric,
  min_side_mm numeric,
  min_overlay_mm numeric,
  min_cover_mm numeric,
  bedding_and_overlay_material text,
  cover_material text,
  sort_order integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_asset_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text NOT NULL,
  asset_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_id, asset_id)
);

CREATE TABLE IF NOT EXISTS public.asset_laser_signouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL,
  project_id text NOT NULL,
  worker_name text,
  signed_out_at timestamptz NOT NULL DEFAULT now(),
  signed_in_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.expiry_alert_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,
  automated_emails_enabled boolean NOT NULL DEFAULT true,
  secondary_recipient_emails text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plant_service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_id uuid,
  project_id text,
  service_date date NOT NULL,
  hours_logged numeric,
  description text,
  technician_company text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.subcontractor_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subcontractor_id uuid,
  project_id text,
  full_name text NOT NULL,
  phone text,
  email text,
  white_card_number text,
  white_card_expiry date,
  licence_expiry date,
  assigned_project_ids text[] NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_swms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,
  swms_id text,
  swms_document_id text,
  document_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.worker_leave_balance_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id text NOT NULL,
  project_id text,
  leave_request_id text,
  leave_type text,
  days_delta numeric,
  hours_delta numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (leave_request_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.profiles,
  public.itc_zones,
  public.itc_signoffs,
  public.itc_step_photos,
  public.itc_project_drawings,
  public.itc_drawing_pins,
  public.itc_inspection_activities,
  public.itc_compaction_test_links,
  public.project_itp_items,
  public.pipe_dimension_specs,
  public.project_asset_assignments,
  public.asset_laser_signouts,
  public.expiry_alert_settings,
  public.plant_service_history,
  public.subcontractor_workers,
  public.project_swms,
  public.worker_leave_balance_ledger
TO anon, authenticated, service_role;

ALTER TABLE public.pay_rates_and_rules
  ADD COLUMN IF NOT EXISTS leave_flat_hours numeric;

NOTIFY pgrst, 'reload schema';
