-- ITC checklist step-level audit trail
-- checklist_answers / form_data.checklist items may include:
--   completed_by_name text  — authenticated user who marked the step complete
--   completed_at timestamptz — when the step was marked complete

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_itcs' AND column_name = 'checklist_answers'
  ) THEN
    COMMENT ON COLUMN public.project_itcs.checklist_answers IS
      'ITC checklist JSON array. Each step: key, text, result, remarks, photos, completed_by_name, completed_at.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'itcs' AND column_name = 'checklist_answers'
  ) THEN
    COMMENT ON COLUMN public.itcs.checklist_answers IS
      'ITC checklist JSON array. Each step: key, text, result, remarks, photos, completed_by_name, completed_at.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_itcs' AND column_name = 'form_data'
  ) THEN
    COMMENT ON COLUMN public.project_itcs.form_data IS
      'ITC form JSON. checklist/checklist_answers steps may include completed_by_name and completed_at audit fields.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'itcs' AND column_name = 'form_data'
  ) THEN
    COMMENT ON COLUMN public.itcs.form_data IS
      'ITC form JSON. checklist/checklist_answers steps may include completed_by_name and completed_at audit fields.';
  END IF;
END $$;
