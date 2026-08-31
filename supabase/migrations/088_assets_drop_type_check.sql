-- Allow any asset category / asset_type after the enum check was retired.
ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_asset_type_check;

ALTER TABLE assets ADD COLUMN IF NOT EXISTS category text;

COMMENT ON COLUMN assets.category IS
  'Asset category slug, kept in sync with asset_type (laptop, ipad, laser, pressure_gauge, assigned_accounts, general_equipment).';
