-- SiteBolt Phase 3: Worker onboarding & project scheduling
-- Run in Supabase SQL Editor after previous migrations

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS emergency_contact text,
  ADD COLUMN IF NOT EXISTS dob date,
  ADD COLUMN IF NOT EXISTS white_card_number text,
  ADD COLUMN IF NOT EXISTS white_card_issue_date date,
  ADD COLUMN IF NOT EXISTS drivers_licence_number text,
  ADD COLUMN IF NOT EXISTS drivers_licence_class text,
  ADD COLUMN IF NOT EXISTS drivers_licence_expiry date,
  ADD COLUMN IF NOT EXISTS silica_cert_number text,
  ADD COLUMN IF NOT EXISTS voc_details text,
  ADD COLUMN IF NOT EXISTS tfn text,
  ADD COLUMN IF NOT EXISTS bank_bsb text,
  ADD COLUMN IF NOT EXISTS bank_account_number text,
  ADD COLUMN IF NOT EXISTS super_fund text,
  ADD COLUMN IF NOT EXISTS super_member_number text,
  ADD COLUMN IF NOT EXISTS assigned_project_id text,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending_induction';

CREATE TABLE IF NOT EXISTS worker_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  project_id text NOT NULL,
  project_name text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  role_on_site text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_worker_schedule_worker_id ON worker_schedule(worker_id);
CREATE INDEX IF NOT EXISTS idx_worker_schedule_dates ON worker_schedule(start_date, end_date);

ALTER TABLE worker_schedule ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read worker_schedule" ON worker_schedule;
CREATE POLICY "Allow public read worker_schedule"
  ON worker_schedule FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow public insert worker_schedule" ON worker_schedule;
CREATE POLICY "Allow public insert worker_schedule"
  ON worker_schedule FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow public update worker_schedule" ON worker_schedule;
CREATE POLICY "Allow public update worker_schedule"
  ON worker_schedule FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Allow public update workers" ON workers;
CREATE POLICY "Allow public update workers"
  ON workers FOR UPDATE USING (true);
