-- Per-tenant module and worker-profile field flags for the company wizard.
-- Existing organisations (including A Plus) keep an empty object; the app treats
-- missing keys as enabled so live tenants retain every feature by default.

ALTER TABLE organisations
  ADD COLUMN IF NOT EXISTS feature_flags jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN organisations.feature_flags IS
  'JSON module and worker-field flags for this tenant. Missing keys default to enabled.';
