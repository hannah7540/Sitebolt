-- Broaden expiry_alert_logs for Organisation Alerts email coverage
-- (plant/fleet/heavy vehicle/worker tickets/insurance)

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE c.contype = 'c'
      AND n.nspname = 'public'
      AND t.relname = 'expiry_alert_logs'
      AND (
        pg_get_constraintdef(c.oid) ILIKE '%entity_type%'
        OR pg_get_constraintdef(c.oid) ILIKE '%alert_kind%'
      )
  LOOP
    EXECUTE format('ALTER TABLE public.expiry_alert_logs DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE expiry_alert_logs
  ADD CONSTRAINT expiry_alert_logs_entity_type_check
  CHECK (
    entity_type IN (
      'worker_qualification',
      'company_insurance',
      'compliance_alert',
      'heavy_vehicle_check',
      'fleet_registration',
      'plant_registration',
      'worker_ticket'
    )
  );

ALTER TABLE expiry_alert_logs
  ADD CONSTRAINT expiry_alert_logs_alert_kind_check
  CHECK (
    alert_kind IN (
      'worker_digest',
      'insurance_digest',
      'manual_worker_notify',
      'compliance_digest',
      'compliance_item'
    )
  );

COMMENT ON TABLE expiry_alert_logs IS
  'Dedupe log for Organisation Alerts emails (7-day window per entity_key)';

NOTIFY pgrst, 'reload schema';
