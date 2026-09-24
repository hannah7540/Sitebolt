-- Automatically copy existing company public holidays onto newly created workers.
-- Does not update company_calendar_days or existing worker calendar rows.

CREATE UNIQUE INDEX IF NOT EXISTS worker_calendar_events_public_holiday_uidx
  ON public.worker_calendar_events (worker_id, start_date)
  WHERE leave_kind = 'public_holiday';

CREATE OR REPLACE FUNCTION public.handle_new_worker_public_holidays()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF to_regclass('public.company_calendar_days') IS NULL
     OR to_regclass('public.worker_calendar_events') IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.worker_calendar_events (
    worker_id,
    worker_name,
    project_id,
    project_name,
    event_type,
    start_date,
    end_date,
    is_full_day,
    notes,
    trade,
    display_code,
    bg_color,
    text_color,
    leave_kind,
    leave_status
  )
  SELECT
    NEW.id,
    NULLIF(
      trim(
        COALESCE(
          NEW.full_name,
          NEW.worker_name,
          concat_ws(' ', NEW.first_name, NEW.last_name)
        )
      ),
      ''
    ),
    NULLIF(NEW.assigned_project_id::text, ''),
    NULL,
    'Leave',
    d.date,
    d.date,
    true,
    d.title,
    NEW.trade,
    'PH',
    '#6366f1',
    '#ffffff',
    'public_holiday',
    'Approved'
  FROM public.company_calendar_days d
  WHERE d.day_type = 'public_holiday'
    AND d.date >= CURRENT_DATE
    AND (
      upper(trim(COALESCE(d.state, 'ALL'))) IN ('ALL', 'NATIONAL', '')
      OR (
        NULLIF(trim(COALESCE(NEW.state, '')), '') IS NOT NULL
        AND upper(trim(d.state)) = upper(trim(NEW.state))
      )
    )
    AND (
      d.applicable_roles IS NULL
      OR cardinality(d.applicable_roles) = 0
      OR (
        NULLIF(trim(COALESCE(NEW.trade, '')), '') IS NULL
        AND NULLIF(trim(COALESCE(NEW.worker_type, '')), '') IS NULL
        AND NULLIF(trim(COALESCE(NEW.employment_type, '')), '') IS NULL
      )
      OR EXISTS (
        SELECT 1
        FROM unnest(d.applicable_roles) AS role
        WHERE lower(trim(role)) IN (
          lower(trim(COALESCE(NEW.trade, ''))),
          lower(trim(COALESCE(NEW.worker_type, ''))),
          lower(trim(COALESCE(NEW.employment_type, '')))
        )
      )
    )
  ON CONFLICT (worker_id, start_date) WHERE (leave_kind = 'public_holiday')
  DO NOTHING;

  RETURN NEW;
EXCEPTION
  WHEN undefined_column THEN
    RAISE WARNING 'handle_new_worker_public_holidays skipped missing column: %', SQLERRM;
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_worker_public_holidays failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_public_holidays ON public.workers;

CREATE TRIGGER trg_auto_assign_public_holidays
  AFTER INSERT ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_worker_public_holidays();

COMMENT ON FUNCTION public.handle_new_worker_public_holidays() IS
  'After a worker is created, assign current/future company public holidays. Idempotent; never mutates existing holiday rows.';

NOTIFY pgrst, 'reload schema';
