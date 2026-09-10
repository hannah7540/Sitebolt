-- Company public holidays / RDOs and leave deduction ledger.
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS public.company_calendar_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organisation_id uuid,
  date date NOT NULL,
  day_type text NOT NULL
    CHECK (day_type IN ('public_holiday', 'rdo')),
  title text NOT NULL,
  state text NOT NULL DEFAULT 'ALL',
  applicable_roles text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.company_calendar_days
  DROP CONSTRAINT IF EXISTS company_calendar_days_date_type_state_key;
ALTER TABLE public.company_calendar_days
  ADD CONSTRAINT company_calendar_days_date_type_state_key
  UNIQUE (date, day_type, state);

CREATE INDEX IF NOT EXISTS company_calendar_days_date_idx
  ON public.company_calendar_days (date);

CREATE INDEX IF NOT EXISTS company_calendar_days_state_idx
  ON public.company_calendar_days (state);

CREATE TABLE IF NOT EXISTS public.worker_leave_balance_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id uuid NOT NULL REFERENCES public.workers(id) ON DELETE CASCADE,
  leave_request_id uuid REFERENCES public.leave_requests(id) ON DELETE SET NULL,
  leave_type text NOT NULL,
  days_delta numeric(8, 2) NOT NULL,
  hours_delta numeric(8, 2),
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS worker_leave_balance_ledger_request_uidx
  ON public.worker_leave_balance_ledger (leave_request_id)
  WHERE leave_request_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS worker_leave_balance_ledger_worker_idx
  ON public.worker_leave_balance_ledger (worker_id, created_at DESC);

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS effective_days_deducted numeric(8, 2);

ALTER TABLE public.leave_requests
  ADD COLUMN IF NOT EXISTS calendar_breakdown jsonb;

ALTER TABLE public.company_calendar_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.worker_leave_balance_ledger ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read company calendar days" ON public.company_calendar_days;
CREATE POLICY "Authenticated read company calendar days"
  ON public.company_calendar_days
  FOR SELECT
  USING (public.is_authenticated_user());

DROP POLICY IF EXISTS "Managers write company calendar days" ON public.company_calendar_days;
CREATE POLICY "Managers write company calendar days"
  ON public.company_calendar_days
  FOR ALL
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
        FROM public.workers w
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

DROP POLICY IF EXISTS "Workers read own leave ledger" ON public.worker_leave_balance_ledger;
CREATE POLICY "Workers read own leave ledger"
  ON public.worker_leave_balance_ledger
  FOR SELECT
  USING (
    public.is_authenticated_user()
    AND (
      public.is_platform_admin()
      OR worker_id = public.current_worker_id()
    )
  );

DROP POLICY IF EXISTS "Managers write leave ledger" ON public.worker_leave_balance_ledger;
CREATE POLICY "Managers write leave ledger"
  ON public.worker_leave_balance_ledger
  FOR ALL
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
    )
  )
  WITH CHECK (true);

COMMENT ON TABLE public.company_calendar_days IS
  'Organisation public holidays and industry RDOs used by the leave deduction engine.';
COMMENT ON TABLE public.worker_leave_balance_ledger IS
  'Append-only leave balance movements. Annual leave deductions use negative days_delta.';
COMMENT ON COLUMN public.leave_requests.effective_days_deducted IS
  'Chargeable working days after weekends, public holidays, and RDOs are excluded.';
COMMENT ON COLUMN public.leave_requests.calendar_breakdown IS
  'JSON breakdown of each date in the leave period and excluded-day counts.';

NOTIFY pgrst, 'reload schema';
