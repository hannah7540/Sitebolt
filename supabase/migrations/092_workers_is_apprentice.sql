-- Apprentice flag on workers (used for pay rules, directory badge, onboarding).
ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS is_apprentice boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN workers.is_apprentice IS 'When true, worker is an apprentice (e.g. NSW Apprentice Site Worker pay rule).';
