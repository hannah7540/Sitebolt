-- Automated SWMS + Induction assignment on worker insert / project / state change.
--
-- Live schema (this repo):
--   Documents:  public.swms_documents, public.induction_form_templates
--   Assignments: public.swms_assignments, public.form_worker_assignments
--   Company SWMS:     swms_documents.project_id IS NULL
--   Project SWMS:     swms_documents.project_id matches workers.assigned_project_id
--   Company induction: induction_form_templates.scope = 'company' AND status = 'active'
--                      AND title/system_template_key matches workers.state (NSW/ACT/WA/NZ)
--   Project induction: induction_form_templates.scope = 'project'
--                      AND project_id matches workers.assigned_project_id
--
-- public.worker_swms is not created in this schema.
-- public.worker_inductions is only referenced by 179 (organisation_id patch) and may
-- be absent. This function writes the live assignment tables first, then mirrors into
-- worker_swms / worker_inductions only when those relations exist.
--
-- Apply in the Supabase SQL Editor if this file is not run via `supabase db push`.

CREATE OR REPLACE FUNCTION public.sitebolt_rel_has_column(p_rel regclass, p_column text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM pg_attribute
    WHERE attrelid = p_rel
      AND attname = p_column
      AND attnum > 0
      AND NOT attisdropped
  );
$$;

CREATE OR REPLACE FUNCTION public.sitebolt_row_matches_worker_org(
  p_row_org uuid,
  p_worker_org uuid
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_worker_org IS NULL THEN p_row_org IS NULL
    WHEN p_worker_org = '00000000-0000-0000-0000-000000000001'::uuid
      THEN p_row_org IS NULL OR p_row_org = p_worker_org
    ELSE p_row_org = p_worker_org
  END;
$$;

CREATE OR REPLACE FUNCTION public.sitebolt_expand_project_keys(p_keys text[])
RETURNS text[]
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  keys text[] := ARRAY[]::text[];
  k text;
BEGIN
  FOREACH k IN ARRAY COALESCE(p_keys, ARRAY[]::text[])
  LOOP
    k := btrim(k);
    IF k <> '' AND NOT (k = ANY(keys)) THEN
      keys := array_append(keys, k);
    END IF;
  END LOOP;

  IF to_regclass('public.projects') IS NULL OR cardinality(keys) = 0 THEN
    RETURN keys;
  END IF;

  SELECT COALESCE(array_agg(DISTINCT x.key), keys)
  INTO keys
  FROM (
    SELECT unnest(keys) AS key
    UNION
    SELECT p.id::text
    FROM public.projects p
    WHERE p.id::text = ANY(keys)
       OR (
         public.sitebolt_rel_has_column('public.projects'::regclass, 'slug')
         AND p.slug = ANY(keys)
       )
    UNION
    SELECT p.slug
    FROM public.projects p
    WHERE public.sitebolt_rel_has_column('public.projects'::regclass, 'slug')
      AND (
        p.id::text = ANY(keys)
        OR p.slug = ANY(keys)
      )
      AND NULLIF(btrim(COALESCE(p.slug, '')), '') IS NOT NULL
  ) x;

  RETURN keys;
END;
$$;

CREATE OR REPLACE FUNCTION public.sitebolt_company_induction_matches_state(
  p_title text,
  p_system_template_key text,
  p_template_state text,
  p_worker_state text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  worker_state text := upper(btrim(COALESCE(p_worker_state, '')));
  tagged text := upper(btrim(COALESCE(p_template_state, '')));
  key text := upper(btrim(COALESCE(p_system_template_key, '')));
  title text := btrim(COALESCE(p_title, ''));
BEGIN
  IF worker_state = '' THEN
    RETURN false;
  END IF;

  IF tagged <> '' THEN
    RETURN tagged = worker_state;
  END IF;

  IF key <> '' THEN
    IF key = worker_state || '-COMPANY-INDUCTION'
       OR key LIKE worker_state || '-COMPANY%'
       OR (position(worker_state || '-' IN key) > 0 AND position('COMPANY' IN key) > 0)
    THEN
      RETURN true;
    END IF;
  END IF;

  IF title = '' THEN
    RETURN false;
  END IF;

  RETURN title ~* ('(^|[^A-Za-z0-9])' || worker_state || '([^A-Za-z0-9]|$)');
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_worker_auto_assign_safety_docs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  worker_json jsonb := to_jsonb(NEW);
  worker_org uuid;
  worker_state text;
  worker_name text;
  project_id text;
  project_keys text[] := ARRAY[]::text[];
  signing_token text;
  swms_rec record;
  induction_rec record;
  alias_sql text;
BEGIN
  IF COALESCE(worker_json->>'deleted_at', '') <> '' THEN
    RETURN NEW;
  END IF;
  IF lower(COALESCE(worker_json->>'is_revoked', 'false')) IN ('true', 't', '1') THEN
    RETURN NEW;
  END IF;

  BEGIN
    worker_org := NULLIF(btrim(COALESCE(worker_json->>'organisation_id', '')), '')::uuid;
  EXCEPTION
    WHEN invalid_text_representation THEN
      worker_org := NULL;
  END;

  worker_state := upper(btrim(COALESCE(worker_json->>'state', '')));
  worker_name := NULLIF(
    btrim(
      COALESCE(
        worker_json->>'full_name',
        worker_json->>'worker_name',
        concat_ws(' ', worker_json->>'first_name', worker_json->>'last_name')
      )
    ),
    ''
  );
  IF worker_name IS NULL THEN
    worker_name := 'Worker';
  END IF;

  project_id := NULLIF(btrim(COALESCE(worker_json->>'assigned_project_id', '')), '');
  IF project_id IS NOT NULL THEN
    project_keys := array_append(project_keys, project_id);
  END IF;
  IF jsonb_typeof(worker_json->'assigned_project_ids') = 'array' THEN
    SELECT COALESCE(array_agg(NULLIF(btrim(value), '')), ARRAY[]::text[])
    INTO project_keys
    FROM (
      SELECT unnest(project_keys) AS value
      UNION
      SELECT jsonb_array_elements_text(worker_json->'assigned_project_ids')
    ) s
    WHERE NULLIF(btrim(value), '') IS NOT NULL;
  END IF;
  project_keys := public.sitebolt_expand_project_keys(project_keys);

  -- SWMS documents: company = project_id IS NULL; project = project_id match.
  -- Assignments live on swms_assignments (unique swms_id + assignee_type + assignee_id).
  BEGIN
  IF to_regclass('public.swms_documents') IS NOT NULL
     AND to_regclass('public.swms_assignments') IS NOT NULL THEN
    FOR swms_rec IN
      SELECT d.id
      FROM public.swms_documents d
      WHERE COALESCE(d.is_archived, false) = false
        AND COALESCE(d.status, 'Active') NOT ILIKE 'archived'
        AND (
          NOT public.sitebolt_rel_has_column('public.swms_documents'::regclass, 'organisation_id')
          OR public.sitebolt_row_matches_worker_org(
            CASE
              WHEN public.sitebolt_rel_has_column('public.swms_documents'::regclass, 'organisation_id')
                THEN d.organisation_id
              ELSE NULL
            END,
            worker_org
          )
        )
        AND (
          d.project_id IS NULL
          OR (
            cardinality(project_keys) > 0
            AND d.project_id::text = ANY(project_keys)
          )
        )
    LOOP
      signing_token := replace(gen_random_uuid()::text, '-', '');

      INSERT INTO public.swms_assignments (
        swms_id,
        assignee_type,
        assignee_id,
        assignee_name,
        signing_token,
        status
      )
      VALUES (
        swms_rec.id,
        'worker',
        NEW.id,
        worker_name,
        signing_token,
        'Pending'
      )
      ON CONFLICT (swms_id, assignee_type, assignee_id) DO NOTHING;

      IF public.sitebolt_rel_has_column('public.swms_assignments'::regclass, 'worker_id') THEN
        UPDATE public.swms_assignments
        SET worker_id = NEW.id
        WHERE swms_id = swms_rec.id
          AND assignee_type = 'worker'
          AND assignee_id = NEW.id
          AND worker_id IS NULL;
      END IF;
      IF public.sitebolt_rel_has_column('public.swms_assignments'::regclass, 'worker_name') THEN
        UPDATE public.swms_assignments
        SET worker_name = worker_name
        WHERE swms_id = swms_rec.id
          AND assignee_type = 'worker'
          AND assignee_id = NEW.id;
      END IF;
      IF public.sitebolt_rel_has_column('public.swms_assignments'::regclass, 'name') THEN
        UPDATE public.swms_assignments
        SET name = worker_name
        WHERE swms_id = swms_rec.id
          AND assignee_type = 'worker'
          AND assignee_id = NEW.id;
      END IF;
      IF public.sitebolt_rel_has_column('public.swms_assignments'::regclass, 'token') THEN
        UPDATE public.swms_assignments
        SET token = signing_token
        WHERE swms_id = swms_rec.id
          AND assignee_type = 'worker'
          AND assignee_id = NEW.id
          AND token IS NULL;
      END IF;
      IF public.sitebolt_rel_has_column('public.swms_assignments'::regclass, 'signature_token') THEN
        UPDATE public.swms_assignments
        SET signature_token = signing_token
        WHERE swms_id = swms_rec.id
          AND assignee_type = 'worker'
          AND assignee_id = NEW.id
          AND signature_token IS NULL;
      END IF;
      IF public.sitebolt_rel_has_column('public.swms_assignments'::regclass, 'organisation_id')
         AND worker_org IS NOT NULL THEN
        UPDATE public.swms_assignments
        SET organisation_id = worker_org
        WHERE swms_id = swms_rec.id
          AND assignee_type = 'worker'
          AND assignee_id = NEW.id
          AND organisation_id IS NULL;
      END IF;

      IF to_regclass('public.worker_swms') IS NOT NULL
         AND public.sitebolt_rel_has_column('public.worker_swms'::regclass, 'worker_id')
         AND public.sitebolt_rel_has_column('public.worker_swms'::regclass, 'swms_id')
      THEN
        alias_sql := 'INSERT INTO public.worker_swms (worker_id, swms_id';
        IF public.sitebolt_rel_has_column('public.worker_swms'::regclass, 'status') THEN
          alias_sql := alias_sql || ', status';
        END IF;
        IF public.sitebolt_rel_has_column('public.worker_swms'::regclass, 'organisation_id')
           AND worker_org IS NOT NULL THEN
          alias_sql := alias_sql || ', organisation_id';
        END IF;
        alias_sql := alias_sql || ') SELECT $1, $2';
        IF public.sitebolt_rel_has_column('public.worker_swms'::regclass, 'status') THEN
          alias_sql := alias_sql || ', ''Pending''';
        END IF;
        IF public.sitebolt_rel_has_column('public.worker_swms'::regclass, 'organisation_id')
           AND worker_org IS NOT NULL THEN
          alias_sql := alias_sql || ', $3';
        END IF;
        alias_sql := alias_sql ||
          ' WHERE NOT EXISTS (
              SELECT 1 FROM public.worker_swms x
              WHERE x.worker_id = $1 AND x.swms_id = $2
            )';
        EXECUTE alias_sql USING NEW.id, swms_rec.id, worker_org;
      END IF;
    END LOOP;
  END IF;
  EXCEPTION
    WHEN undefined_column OR undefined_table THEN
      RAISE WARNING 'SWMS auto-assign skipped: %', SQLERRM;
    WHEN OTHERS THEN
      RAISE WARNING 'SWMS auto-assign failed: %', SQLERRM;
  END;

  -- Induction templates: company scope matched by state key/title; project scope by project_id.
  -- Assignments live on form_worker_assignments (unique form_id + worker_id).
  BEGIN
  IF to_regclass('public.induction_form_templates') IS NOT NULL
     AND to_regclass('public.form_worker_assignments') IS NOT NULL THEN
    FOR induction_rec IN
      SELECT
        t.id,
        t.title,
        t.project_id
      FROM public.induction_form_templates t
      WHERE COALESCE(t.status, 'active') = 'active'
        AND (
          NOT public.sitebolt_rel_has_column(
            'public.induction_form_templates'::regclass,
            'organisation_id'
          )
          OR public.sitebolt_row_matches_worker_org(t.organisation_id, worker_org)
        )
        AND (
          (
            COALESCE(t.scope, 'company') = 'company'
            AND worker_state <> ''
            AND public.sitebolt_company_induction_matches_state(
              t.title,
              t.system_template_key,
              NULL,
              worker_state
            )
          )
          OR (
            COALESCE(t.scope, 'company') = 'project'
            AND cardinality(project_keys) > 0
            AND NULLIF(btrim(COALESCE(t.project_id, '')), '') IS NOT NULL
            AND btrim(t.project_id) = ANY(project_keys)
          )
        )
    LOOP
      INSERT INTO public.form_worker_assignments (
        form_id,
        worker_id,
        project_id,
        status,
        assigned_at,
        assigned_by
      )
      VALUES (
        induction_rec.id,
        NEW.id,
        COALESCE(NULLIF(btrim(COALESCE(induction_rec.project_id, '')), ''), project_id),
        'Pending',
        now(),
        'system'
      )
      ON CONFLICT (form_id, worker_id) DO NOTHING;

      IF public.sitebolt_rel_has_column('public.form_worker_assignments'::regclass, 'form_template_id') THEN
        UPDATE public.form_worker_assignments
        SET form_template_id = induction_rec.id
        WHERE form_id = induction_rec.id
          AND worker_id = NEW.id
          AND form_template_id IS NULL;
      END IF;
      IF public.sitebolt_rel_has_column('public.form_worker_assignments'::regclass, 'form_title') THEN
        UPDATE public.form_worker_assignments
        SET form_title = induction_rec.title
        WHERE form_id = induction_rec.id
          AND worker_id = NEW.id;
      END IF;
      IF public.sitebolt_rel_has_column('public.form_worker_assignments'::regclass, 'worker_name') THEN
        UPDATE public.form_worker_assignments
        SET worker_name = worker_name
        WHERE form_id = induction_rec.id
          AND worker_id = NEW.id;
      END IF;
      IF public.sitebolt_rel_has_column('public.form_worker_assignments'::regclass, 'organisation_id')
         AND worker_org IS NOT NULL THEN
        UPDATE public.form_worker_assignments
        SET organisation_id = worker_org
        WHERE form_id = induction_rec.id
          AND worker_id = NEW.id
          AND organisation_id IS NULL;
      END IF;

      IF to_regclass('public.worker_inductions') IS NOT NULL
         AND public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'worker_id')
         AND (
           public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'induction_id')
           OR public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'form_id')
         )
      THEN
        alias_sql := 'INSERT INTO public.worker_inductions (worker_id';
        IF public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'induction_id') THEN
          alias_sql := alias_sql || ', induction_id';
        END IF;
        IF public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'form_id') THEN
          alias_sql := alias_sql || ', form_id';
        END IF;
        IF public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'status') THEN
          alias_sql := alias_sql || ', status';
        END IF;
        alias_sql := alias_sql || ') SELECT $1';
        IF public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'induction_id') THEN
          alias_sql := alias_sql || ', $2';
        END IF;
        IF public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'form_id') THEN
          alias_sql := alias_sql || ', $2';
        END IF;
        IF public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'status') THEN
          alias_sql := alias_sql || ', ''Pending''';
        END IF;
        alias_sql := alias_sql || ' WHERE NOT EXISTS (SELECT 1 FROM public.worker_inductions x WHERE x.worker_id = $1';
        IF public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'induction_id') THEN
          alias_sql := alias_sql || ' AND x.induction_id = $2';
        ELSIF public.sitebolt_rel_has_column('public.worker_inductions'::regclass, 'form_id') THEN
          alias_sql := alias_sql || ' AND x.form_id = $2';
        END IF;
        alias_sql := alias_sql || ')';
        EXECUTE alias_sql USING NEW.id, induction_rec.id;
      END IF;
    END LOOP;
  END IF;
  EXCEPTION
    WHEN undefined_column OR undefined_table THEN
      RAISE WARNING 'Induction auto-assign skipped: %', SQLERRM;
    WHEN OTHERS THEN
      RAISE WARNING 'Induction auto-assign failed: %', SQLERRM;
  END;

  RETURN NEW;
EXCEPTION
  WHEN undefined_column OR undefined_table THEN
    RAISE WARNING 'handle_worker_auto_assign_safety_docs skipped missing relation/column: %', SQLERRM;
    RETURN NEW;
  WHEN OTHERS THEN
    RAISE WARNING 'handle_worker_auto_assign_safety_docs failed: %', SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_safety_docs ON public.workers;

CREATE TRIGGER trg_auto_assign_safety_docs
  AFTER INSERT OR UPDATE OF state, assigned_project_id, assigned_project_ids
  ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_worker_auto_assign_safety_docs();

COMMENT ON FUNCTION public.handle_worker_auto_assign_safety_docs() IS
  'After worker insert or state/project change, assign company+project SWMS (swms_assignments) and matching inductions (form_worker_assignments). Idempotent; never deletes existing signed/completed rows.';

NOTIFY pgrst, 'reload schema';
