-- Expand asset types for laptops, iPads, lasers, pressure gauges, and assigned accounts

ALTER TABLE assets DROP CONSTRAINT IF EXISTS assets_asset_type_check;

UPDATE assets
SET asset_type = 'laser'
WHERE asset_type = 'site_laser';

ALTER TABLE assets
  ADD CONSTRAINT assets_asset_type_check
  CHECK (
    asset_type IN (
      'laptop',
      'ipad',
      'laser',
      'pressure_gauge',
      'assigned_accounts'
    )
  );

COMMENT ON COLUMN assets.asset_type IS
  'Asset category: laptop, ipad, laser, pressure_gauge, or assigned_accounts.';
