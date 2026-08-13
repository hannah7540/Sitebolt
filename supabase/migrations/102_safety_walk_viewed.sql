-- Safety walk dashboard viewed tracking

ALTER TABLE site_forms
  ADD COLUMN IF NOT EXISTS is_viewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS viewed_at timestamptz;

COMMENT ON COLUMN site_forms.is_viewed IS 'Whether an admin has marked this form as viewed on the project dashboard';
COMMENT ON COLUMN site_forms.viewed_at IS 'Timestamp when the form was marked viewed on the project dashboard';

-- Allow authenticated users to update viewed state (and other admin fields)
DROP POLICY IF EXISTS "Authenticated update site forms" ON site_forms;
CREATE POLICY "Authenticated update site forms"
  ON site_forms FOR UPDATE
  USING (public.is_authenticated_user())
  WITH CHECK (public.is_authenticated_user());
