-- Ensure worker request admin notes exist without breaking existing rows.
-- Live DBs may be missing admin_comments from 070; add admin_comment as the
-- defensive write target and keep admin_comments if already present.

ALTER TABLE public.worker_requests
  ADD COLUMN IF NOT EXISTS admin_comment text;

ALTER TABLE public.worker_requests
  ADD COLUMN IF NOT EXISTS admin_comments text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'worker_requests'
      AND column_name = 'admin_comments'
  ) THEN
    UPDATE public.worker_requests
    SET admin_comment = COALESCE(admin_comment, admin_comments)
    WHERE admin_comment IS NULL
      AND admin_comments IS NOT NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.worker_requests.admin_comment IS
  'Admin notes when marking a worker request in progress, completed, or fulfilled.';

NOTIFY pgrst, 'reload schema';
