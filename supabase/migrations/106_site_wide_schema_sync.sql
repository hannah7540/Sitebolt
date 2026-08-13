-- Site-wide schema sync: idempotent columns referenced by app payloads.
-- Safe to run on databases that already applied earlier migrations.

-- ---------------------------------------------------------------------------
-- workers (core profile, pay rules, assignments, compliance)
-- ---------------------------------------------------------------------------
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS worker_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS trade text,
  ADD COLUMN IF NOT EXISTS worker_type text,
  ADD COLUMN IF NOT EXISTS worker_code text,
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS state text,
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS emergency_contact text,
  ADD COLUMN IF NOT EXISTS emergency_contact_name text,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone text,
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship text,
  ADD COLUMN IF NOT EXISTS white_card_number text,
  ADD COLUMN IF NOT EXISTS white_card_issue_date date,
  ADD COLUMN IF NOT EXISTS white_card_photo_url text,
  ADD COLUMN IF NOT EXISTS white_card_doc_url text,
  ADD COLUMN IF NOT EXISTS drivers_licence_number text,
  ADD COLUMN IF NOT EXISTS drivers_licence_class text,
  ADD COLUMN IF NOT EXISTS drivers_licence_expiry date,
  ADD COLUMN IF NOT EXISTS drivers_licence_photo_url text,
  ADD COLUMN IF NOT EXISTS silica_cert_number text,
  ADD COLUMN IF NOT EXISTS silica_cert_issue_date date,
  ADD COLUMN IF NOT EXISTS silica_cert_photo_url text,
  ADD COLUMN IF NOT EXISTS silica_cert_doc_url text,
  ADD COLUMN IF NOT EXISTS voc_details text,
  ADD COLUMN IF NOT EXISTS voc_title text,
  ADD COLUMN IF NOT EXISTS voc_issuing_org text,
  ADD COLUMN IF NOT EXISTS voc_document_url text,
  ADD COLUMN IF NOT EXISTS tfn text,
  ADD COLUMN IF NOT EXISTS bank_bsb text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS super_fund text,
  ADD COLUMN IF NOT EXISTS super_member_number text,
  ADD COLUMN IF NOT EXISTS super_usi text,
  ADD COLUMN IF NOT EXISTS redundancy_fund_name text,
  ADD COLUMN IF NOT EXISTS redundancy_member_number text,
  ADD COLUMN IF NOT EXISTS assigned_project_id text,
  ADD COLUMN IF NOT EXISTS assigned_project_ids text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS assigned_project_name text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending_induction',
  ADD COLUMN IF NOT EXISTS induction_signature_url text,
  ADD COLUMN IF NOT EXISTS induction_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS security_role text DEFAULT 'general_worker',
  ADD COLUMN IF NOT EXISTS accounts_access_role text NOT NULL DEFAULT 'disabled',
  ADD COLUMN IF NOT EXISTS can_access_accounts boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS hourly_rate numeric(10, 2),
  ADD COLUMN IF NOT EXISTS pay_rate_id uuid,
  ADD COLUMN IF NOT EXISTS pay_rule_template_id uuid,
  ADD COLUMN IF NOT EXISTS pay_rule_id uuid,
  ADD COLUMN IF NOT EXISTS cards_vocs jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_revoked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_subcontractor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subcontractor_id uuid,
  ADD COLUMN IF NOT EXISTS is_hsr boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_apprentice boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_company_vehicle boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS assigned_vehicle_asset_id uuid,
  ADD COLUMN IF NOT EXISTS auth_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_workers_pay_rule_id ON workers(pay_rule_id);

COMMENT ON COLUMN workers.pay_rule_id IS
  'Assigned pay rule/template id for payroll (mirrors pay_rule_template_id in newer flows).';
COMMENT ON COLUMN workers.worker_type IS
  'Optional employment classification label (e.g. Subcontractor).';

-- Backfill pay_rule_id from pay_rule_template_id when missing.
UPDATE workers
SET pay_rule_id = pay_rule_template_id
WHERE pay_rule_id IS NULL
  AND pay_rule_template_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- worker_timesheets (accounts approval metadata)
-- ---------------------------------------------------------------------------
ALTER TABLE worker_timesheets
  ADD COLUMN IF NOT EXISTS worker_trade text,
  ADD COLUMN IF NOT EXISTS activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS breaks jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS work_hours numeric(5, 2),
  ADD COLUMN IF NOT EXISTS break_hours numeric(5, 2),
  ADD COLUMN IF NOT EXISTS daily_total_hours numeric(5, 2),
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_draft boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS overtime_hours numeric(5, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS myob_export_status text NOT NULL DEFAULT 'not_exported',
  ADD COLUMN IF NOT EXISTS myob_exported_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS leave_request_id uuid;

COMMENT ON COLUMN worker_timesheets.approved_by IS
  'Display name or id of the accounts user who approved the timesheet.';

-- ---------------------------------------------------------------------------
-- projects (organisation management fields)
-- ---------------------------------------------------------------------------
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS location text,
  ADD COLUMN IF NOT EXISTS project_code text,
  ADD COLUMN IF NOT EXISTS client text,
  ADD COLUMN IF NOT EXISTS project_admins text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS project_managers text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS project_administrators text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS assigned_workers text[] DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_archived boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text;

-- ---------------------------------------------------------------------------
-- organization_fleet (worker vehicle assignment reads/writes)
-- ---------------------------------------------------------------------------
ALTER TABLE organization_fleet
  ADD COLUMN IF NOT EXISTS unit_number text,
  ADD COLUMN IF NOT EXISTS make text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS registration text,
  ADD COLUMN IF NOT EXISTS rego_expiry_date date,
  ADD COLUMN IF NOT EXISTS rego_document_url text,
  ADD COLUMN IF NOT EXISTS insurance_expiry_date date,
  ADD COLUMN IF NOT EXISTS insurance_document_url text,
  ADD COLUMN IF NOT EXISTS current_hours numeric(10, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assigned_worker_id uuid,
  ADD COLUMN IF NOT EXISTS assigned_worker_name text,
  ADD COLUMN IF NOT EXISTS assigned_project_id text,
  ADD COLUMN IF NOT EXISTS assigned_project_name text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'Active',
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- ---------------------------------------------------------------------------
-- leave_requests (dual date column aliases used by resilient inserts)
-- ---------------------------------------------------------------------------
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS first_date date,
  ADD COLUMN IF NOT EXISTS last_date date,
  ADD COLUMN IF NOT EXISTS start_date date,
  ADD COLUMN IF NOT EXISTS end_date date,
  ADD COLUMN IF NOT EXISTS leave_type text,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS signature_url text,
  ADD COLUMN IF NOT EXISTS project_id text,
  ADD COLUMN IF NOT EXISTS project_name text,
  ADD COLUMN IF NOT EXISTS worker_name text,
  ADD COLUMN IF NOT EXISTS number_of_days numeric(5, 2),
  ADD COLUMN IF NOT EXISTS days numeric(5, 2),
  ADD COLUMN IF NOT EXISTS duration_days numeric(5, 2),
  ADD COLUMN IF NOT EXISTS schedule_entry_id uuid;

-- ---------------------------------------------------------------------------
-- Legacy pay_rules table (optional assignment source; no-op if already present)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pay_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  rule_name text,
  title text,
  template_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE pay_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read pay_rules" ON pay_rules;
CREATE POLICY "Allow public read pay_rules"
  ON pay_rules FOR SELECT USING (true);

NOTIFY pgrst, 'reload schema';
