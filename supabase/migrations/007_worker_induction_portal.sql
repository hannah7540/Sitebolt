-- SiteBolt: Worker self-service induction — signature & completion tracking
-- Run in Supabase SQL Editor

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS induction_signature_url text,
  ADD COLUMN IF NOT EXISTS induction_completed_at timestamptz;
