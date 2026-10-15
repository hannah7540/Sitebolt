-- External guest SWMS signature assignments.
-- Production may already have this table; statements are idempotent.

CREATE TABLE IF NOT EXISTS public.swms_guest_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swms_id uuid NOT NULL,
  guest_email text NOT NULL,
  guest_name text,
  signature_data text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'signed')),
  signed_at timestamptz,
  assigned_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_swms_guest_assignments_email_status
  ON public.swms_guest_assignments (lower(guest_email), status);

CREATE INDEX IF NOT EXISTS idx_swms_guest_assignments_swms_id
  ON public.swms_guest_assignments (swms_id);

ALTER TABLE public.swms_guest_assignments ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.swms_guest_assignments IS
  'SWMS sent to external guests (no SiteBolt account). Reads/writes go through service-role server actions.';
