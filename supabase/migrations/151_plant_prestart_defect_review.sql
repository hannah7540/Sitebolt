-- Dashboard review / ignore flags for plant pre-start defects.

ALTER TABLE plant_prestarts
  ADD COLUMN IF NOT EXISTS defect_notes text,
  ADD COLUMN IF NOT EXISTS defect_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS defect_ignored boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamptz,
  ADD COLUMN IF NOT EXISTS acknowledged_by uuid;

UPDATE plant_prestarts
SET defect_notes = defect_comments
WHERE defect_notes IS NULL
  AND defect_comments IS NOT NULL
  AND btrim(defect_comments) <> '';

CREATE INDEX IF NOT EXISTS idx_plant_prestarts_active_defects
  ON plant_prestarts (created_at DESC)
  WHERE defect_reviewed = false
    AND defect_ignored = false
    AND (
      has_defect = true
      OR (defect_notes IS NOT NULL AND btrim(defect_notes) <> '')
      OR (defect_comments IS NOT NULL AND btrim(defect_comments) <> '')
    );

DROP POLICY IF EXISTS "Managers review plant prestart defects" ON plant_prestarts;
CREATE POLICY "Managers review plant prestart defects"
  ON plant_prestarts
  FOR UPDATE
  USING (
    public.is_authenticated_user()
    AND (
      public.is_platform_admin()
      OR public.current_profile_role() IN (
        'owner',
        'full_access',
        'super_admin',
        'admin_access',
        'project_super_admin',
        'project_admin',
        'project_manager',
        'supervisor',
        'site_supervisor'
      )
      OR EXISTS (
        SELECT 1
        FROM workers w
        WHERE w.auth_user_id = auth.uid()
          AND COALESCE(w.security_role, 'general_worker') IN (
            'owner',
            'full_access',
            'super_admin',
            'admin_access',
            'project_super_admin',
            'project_admin',
            'project_manager',
            'supervisor',
            'site_supervisor'
          )
      )
    )
  )
  WITH CHECK (true);

COMMENT ON COLUMN plant_prestarts.defect_reviewed IS
  'True after a manager marks the defect as read on a dashboard feed.';
COMMENT ON COLUMN plant_prestarts.defect_ignored IS
  'True when a manager ignores the defect and returns the plant to operational.';
COMMENT ON COLUMN plant_prestarts.acknowledged_at IS
  'Timestamp when a manager reviewed or ignored the defect.';
COMMENT ON COLUMN plant_prestarts.acknowledged_by IS
  'auth.uid() of the manager who reviewed or ignored the defect.';

NOTIFY pgrst, 'reload schema';
