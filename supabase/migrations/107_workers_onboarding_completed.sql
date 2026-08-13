-- Post-invite worker account setup completion flag
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

UPDATE workers
SET onboarding_completed = true
WHERE status = 'active'
   OR induction_completed_at IS NOT NULL;
