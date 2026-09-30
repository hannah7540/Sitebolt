-- End-to-end ITP/ITC schema reconciliation.
-- Adds missing tables/columns only. Does not drop or rename existing data columns.
-- Safe to re-run.

-- ---------------------------------------------------------------------------
-- Missing tables (CREATE IF NOT EXISTS, nullable FKs)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.project_itp_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itp_id uuid,
  project_id text,
  item_number integer,
  description text,
  acceptance_criteria text,
  spec_reference text,
  point_type text DEFAULT 'S',
  status text DEFAULT 'pending',
  photo_urls jsonb DEFAULT '[]'::jsonb,
  evidence_urls jsonb DEFAULT '[]'::jsonb,
  photos jsonb DEFAULT '[]'::jsonb,
  attachments jsonb DEFAULT '[]'::jsonb,
  checklist jsonb DEFAULT '[]'::jsonb,
  items jsonb DEFAULT '[]'::jsonb,
  signatures jsonb DEFAULT '[]'::jsonb,
  signoffs jsonb DEFAULT '[]'::jsonb,
  inspector_id text,
  inspector_name text,
  signed_off_at timestamptz,
  signoff_date timestamptz,
  signature_url text,
  notes text,
  form_data jsonb DEFAULT '{}'::jsonb,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_signoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid,
  project_id text,
  step_key text,
  step_index integer,
  author_id text,
  author_name text,
  comments text,
  field_data jsonb DEFAULT '{}'::jsonb,
  form_data jsonb DEFAULT '{}'::jsonb,
  signature_url text,
  signatures jsonb DEFAULT '[]'::jsonb,
  signoffs jsonb DEFAULT '[]'::jsonb,
  status text DEFAULT 'draft',
  submitted_at timestamptz,
  signed_at timestamptz,
  signed_by_worker_id text,
  signoff_date timestamptz,
  verified_by text,
  verified_by_name text,
  verified_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_step_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid,
  project_id text,
  step_key text DEFAULT 'general',
  activity_number integer,
  photo_url text,
  gps_lat numeric,
  gps_lng numeric,
  captured_at timestamptz,
  uploaded_by text,
  uploaded_by_name text,
  is_approved_for_export boolean DEFAULT false,
  approved_by text,
  approved_by_name text,
  approved_at timestamptz,
  form_data jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,
  zone_code text,
  zone_name text,
  map_x numeric,
  map_y numeric,
  pin_x numeric,
  pin_y numeric,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_form_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,
  step_key text,
  step_index integer,
  title text,
  description text,
  field_spec jsonb DEFAULT '{}'::jsonb,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_signoff_edits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  signoff_id uuid,
  previous_comments text,
  previous_field_data jsonb,
  edit_reason text,
  edited_by text,
  edited_by_name text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_compaction_test_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid,
  itc_id uuid,
  project_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_project_drawings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id text,
  file_name text,
  file_url text,
  file_type text DEFAULT 'image/png',
  uploaded_by text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_drawing_pins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id uuid,
  project_id text,
  map_x numeric,
  map_y numeric,
  pin_x numeric,
  pin_y numeric,
  service_type text,
  upstream_pit_number text,
  downstream_pit_number text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.itc_inspection_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid,
  project_id text,
  activity_number integer,
  title text,
  inspection_criteria text,
  check_result text,
  requires_photo boolean DEFAULT false,
  check_by text,
  checked_date date,
  comments text,
  photo_url text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.project_itc_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itc_id uuid,
  project_id text,
  item_number integer,
  activity_number integer,
  description text,
  acceptance_criteria text,
  spec_reference text,
  status text DEFAULT 'pending',
  notes text,
  inspector_id text,
  inspector_name text,
  completed_at timestamptz,
  signoff_date timestamptz,
  photos jsonb DEFAULT '[]'::jsonb,
  attachments jsonb DEFAULT '[]'::jsonb,
  form_data jsonb DEFAULT '{}'::jsonb,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- project_itps: app columns missing from live
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS revision text DEFAULT 'A';
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS trade_category text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS subcontractor_name text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS location_area text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS template_key text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS drawing_name text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS drawing_url text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS service_run_coordinates jsonb;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS itp_number text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS inspector_id text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS inspector_name text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS checklist jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS signatures jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS signoffs jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS checklist_answers jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS service text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS service_type text;
ALTER TABLE public.project_itps ADD COLUMN IF NOT EXISTS spec_reference text;

-- ---------------------------------------------------------------------------
-- project_itp_items extras
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS spec_reference text;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS inspector_id text;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS signoff_date timestamptz;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS checklist jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS signatures jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS signoffs jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS photo_urls jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itp_items ADD COLUMN IF NOT EXISTS evidence_urls jsonb DEFAULT '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- project_itcs: add missing app columns; do not change existing itc_number type
-- Live uses integer itc_number + text activity_number/title for the display code.
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS activity_number text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS itc_id text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS checklist jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS items jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS photo_slot jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS photo_slots jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS photos_data jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS signatures jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS signoffs jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS checklist_answers jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS spec_values jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS spec_reference text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS zone_id text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS zone_code text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS zone text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS building text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS service text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS service_type text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS service_discipline text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS trade_discipline text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS pipe_size text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS pipe_material text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS lines_count integer;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS drawing_name text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS drawing_rev text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS drawing_markup jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS service_run_coordinates jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS run_number text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS material_colour text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS start_location text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS end_location text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS conduits jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS length_m numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS length_of_run_m numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS number_of_tees integer;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS redline_markup_url text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS redline_image_url text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS gps_lat numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS gps_lng numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS status text DEFAULT 'not_started';
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS progress_percent numeric DEFAULT 0;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS map_x numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS map_y numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS pin_x numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS pin_y numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS trench_group text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS assigned_to text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS assigned_name text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS has_open_cr boolean DEFAULT false;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS package_name text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS client_name text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS subcontractor_name text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS material_and_size text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS upstream_pit_number text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS downstream_pit_number text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS number_of_conduits integer;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS min_horizontal_sep_mm numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS min_vertical_sep_mm numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS min_bedding_mm numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS min_side_mm numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS min_overlay_mm numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS min_cover_mm numeric;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS bedding_and_overlay_material text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS cover_material text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS batch_item_id uuid;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS itp_id uuid;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS plan_id uuid;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS form_version_id text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS service_id text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS completed_by text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS completed_by_name text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS inspector_id text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS inspector_name text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS signoff_date timestamptz;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS step_key text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS uploaded_by text;
ALTER TABLE public.project_itcs ADD COLUMN IF NOT EXISTS uploaded_by_name text;

-- ---------------------------------------------------------------------------
-- itc_signoffs extras
-- ---------------------------------------------------------------------------
ALTER TABLE public.itc_signoffs ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.itc_signoffs ADD COLUMN IF NOT EXISTS signatures jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.itc_signoffs ADD COLUMN IF NOT EXISTS signoffs jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.itc_signoffs ADD COLUMN IF NOT EXISTS signed_at timestamptz;
ALTER TABLE public.itc_signoffs ADD COLUMN IF NOT EXISTS signed_by_worker_id text;
ALTER TABLE public.itc_signoffs ADD COLUMN IF NOT EXISTS signoff_date timestamptz;
ALTER TABLE public.itc_signoffs ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.itc_signoffs ADD COLUMN IF NOT EXISTS project_id text;

-- ---------------------------------------------------------------------------
-- itc_checklist_entries: live uses passed/attachment_urls
-- ---------------------------------------------------------------------------
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS is_mandatory boolean DEFAULT true;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS is_checked boolean DEFAULT false;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS passed boolean;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS photo_url text;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS attachment_urls jsonb;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS worker_id text;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS worker_name text;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.itc_checklist_entries ADD COLUMN IF NOT EXISTS value text;

-- ---------------------------------------------------------------------------
-- itc_photos: live uses taken_at / slot_title / is_not_required
-- ---------------------------------------------------------------------------
ALTER TABLE public.itc_photos ADD COLUMN IF NOT EXISTS captured_at timestamptz;
ALTER TABLE public.itc_photos ADD COLUMN IF NOT EXISTS taken_at timestamptz;
ALTER TABLE public.itc_photos ADD COLUMN IF NOT EXISTS slot_title text;
ALTER TABLE public.itc_photos ADD COLUMN IF NOT EXISTS not_required boolean DEFAULT false;
ALTER TABLE public.itc_photos ADD COLUMN IF NOT EXISTS is_not_required boolean DEFAULT false;
ALTER TABLE public.itc_photos ADD COLUMN IF NOT EXISTS not_required_reason text;
ALTER TABLE public.itc_photos ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.itc_photos ADD COLUMN IF NOT EXISTS photos jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.itc_photos ADD COLUMN IF NOT EXISTS uploaded_by text;
ALTER TABLE public.itc_photos ADD COLUMN IF NOT EXISTS uploaded_by_name text;

-- ---------------------------------------------------------------------------
-- project_itc_plans: live uses title / plan_image_url
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_itc_plans ADD COLUMN IF NOT EXISTS plan_name text;
ALTER TABLE public.project_itc_plans ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.project_itc_plans ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE public.project_itc_plans ADD COLUMN IF NOT EXISTS plan_image_url text;
ALTER TABLE public.project_itc_plans ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE public.project_itc_plans ADD COLUMN IF NOT EXISTS uploaded_by text;

-- ---------------------------------------------------------------------------
-- itc_change_requests: live requires requester_name
-- ---------------------------------------------------------------------------
ALTER TABLE public.itc_change_requests ADD COLUMN IF NOT EXISTS requested_by text;
ALTER TABLE public.itc_change_requests ADD COLUMN IF NOT EXISTS requested_by_name text;
ALTER TABLE public.itc_change_requests ADD COLUMN IF NOT EXISTS requester_name text;
ALTER TABLE public.itc_change_requests ADD COLUMN IF NOT EXISTS requester_worker_id uuid;
ALTER TABLE public.itc_change_requests ADD COLUMN IF NOT EXISTS signoff_id text;
ALTER TABLE public.itc_change_requests ADD COLUMN IF NOT EXISTS resolution_notes text;
ALTER TABLE public.itc_change_requests ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE public.itc_change_requests ADD COLUMN IF NOT EXISTS reviewed_by text;
ALTER TABLE public.itc_change_requests ADD COLUMN IF NOT EXISTS reviewed_by_name text;

-- ---------------------------------------------------------------------------
-- Legacy itcs table used as a prototype fallback
-- ---------------------------------------------------------------------------
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS checklist_answers jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS photo_slots jsonb;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS spec_values jsonb;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS itp_id uuid;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS zone text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS zone_id text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS stage text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS from_pit text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS to_pit text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS drawing_rev text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS start_location text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS end_location text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS length_m numeric;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS map_x numeric;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS map_y numeric;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS pin_x numeric;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS pin_y numeric;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS form_version_id text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS service_id text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS service_type text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS project_id text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS completed_by text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS signature_url text;
ALTER TABLE public.itcs ADD COLUMN IF NOT EXISTS signed_at timestamptz;

-- ---------------------------------------------------------------------------
-- signoffs (live fallback for itc_signoffs)
-- ---------------------------------------------------------------------------
ALTER TABLE public.signoffs ADD COLUMN IF NOT EXISTS author_name text;
ALTER TABLE public.signoffs ADD COLUMN IF NOT EXISTS comments text;
ALTER TABLE public.signoffs ADD COLUMN IF NOT EXISTS field_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.signoffs ADD COLUMN IF NOT EXISTS signature_url text;
ALTER TABLE public.signoffs ADD COLUMN IF NOT EXISTS step_key text;
ALTER TABLE public.signoffs ADD COLUMN IF NOT EXISTS submitted_at timestamptz;
ALTER TABLE public.signoffs ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';
ALTER TABLE public.signoffs ADD COLUMN IF NOT EXISTS form_data jsonb DEFAULT '{}'::jsonb;
ALTER TABLE public.signoffs ADD COLUMN IF NOT EXISTS verified_by_name text;

-- ---------------------------------------------------------------------------
-- Relax status checks so in_progress / completed writes do not 400
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_itps DROP CONSTRAINT IF EXISTS project_itps_status_check;
ALTER TABLE public.project_itcs DROP CONSTRAINT IF EXISTS project_itcs_status_check;
ALTER TABLE public.itc_signoffs DROP CONSTRAINT IF EXISTS itc_signoffs_status_check;

-- ---------------------------------------------------------------------------
-- RLS for newly created tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_itp_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_signoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_step_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_form_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_signoff_edits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_compaction_test_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_project_drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_drawing_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itc_inspection_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_itc_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'project_itp_items',
    'itc_signoffs',
    'itc_step_photos',
    'itc_zones',
    'itc_form_steps',
    'itc_signoff_edits',
    'itc_compaction_test_links',
    'itc_project_drawings',
    'itc_drawing_pins',
    'itc_inspection_activities',
    'project_itc_items'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow public read ' || tbl, tbl);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (true)', 'Allow public read ' || tbl, tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Allow public write ' || tbl, tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL USING (true) WITH CHECK (true)',
      'Allow public write ' || tbl,
      tbl
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
