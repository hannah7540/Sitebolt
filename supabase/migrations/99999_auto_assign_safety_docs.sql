-- Replace the broken safety-docs trigger.
-- Live schema (do not invent columns):
--   SWMS docs: public.swms, public.swms_documents
--   SWMS assign: public.swms_assignments  (no organisation_id)
--   Inductions: public.induction_form_templates  (no state column)
--   Induction assign: public.form_worker_assignments
--     assigned_by uuid, project_id uuid, no organisation_id
--   worker_swms / worker_inductions do not exist
--   workers.assigned_project_id uuid, workers.project_id uuid,
--   workers.assigned_project_ids text[] (may contain slugs like marsden-park)
--
-- Paste this entire file into the Supabase SQL Editor and run it.

DROP TRIGGER IF EXISTS trg_auto_assign_safety_docs ON public.workers;
DROP FUNCTION IF EXISTS public.handle_worker_auto_assign_safety_docs();
DROP FUNCTION IF EXISTS public.sitebolt_expand_project_keys(text[]);
DROP FUNCTION IF EXISTS public.sitebolt_company_induction_matches_state(text, text, text, text);
DROP FUNCTION IF EXISTS public.sitebolt_company_induction_matches_state(text, text, text);
DROP FUNCTION IF EXISTS public.sitebolt_row_matches_worker_org(uuid, uuid);
DROP FUNCTION IF EXISTS public.sitebolt_rel_has_column(regclass, text);
DROP FUNCTION IF EXISTS public.sitebolt_uuid_or_null(text);

CREATE OR REPLACE FUNCTION public.sitebolt_uuid_or_null(p text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p IS NULL THEN
    RETURN NULL;
  END IF;
  p := btrim(p);
  IF p ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN p::uuid;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sitebolt_company_induction_matches_state(
  p_title text,
  p_system_template_key text,
  p_worker_state text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  worker_state text := upper(btrim(COALESCE(p_worker_state, '')));
  key text := upper(btrim(COALESCE(p_system_template_key, '')));
  title text := btrim(COALESCE(p_title, ''));
BEGIN
  IF worker_state = '' THEN
    RETURN false;
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
  worker_name text;
  worker_state text;
  project_uuids uuid[] := ARRAY[]::uuid[];
  project_keys text[] := ARRAY[]::text[];
  project_names text[] := ARRAY[]::text[];
  k text;
  resolved_uuid uuid;
  signing_token text;
  swms_assigned int := 0;
  induction_assigned int := 0;
  rec record;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_archived, false) OR COALESCE(NEW.is_revoked, false) THEN
    RETURN NEW;
  END IF;

  worker_state := upper(btrim(COALESCE(NEW.state, '')));
  worker_name := NULLIF(
    btrim(
      COALESCE(
        NEW.full_name,
        NEW.worker_name,
        concat_ws(' ', NEW.first_name, NEW.last_name)
      )
    ),
    ''
  );
  IF worker_name IS NULL THEN
    worker_name := 'Worker';
  END IF;

  IF NEW.assigned_project_id IS NOT NULL THEN
    project_uuids := array_append(project_uuids, NEW.assigned_project_id);
  END IF;

  IF NEW.project_id IS NOT NULL AND NOT (NEW.project_id = ANY(project_uuids)) THEN
    project_uuids := array_append(project_uuids, NEW.project_id);
  END IF;

  IF NEW.assigned_project_ids IS NOT NULL THEN
    FOREACH k IN ARRAY NEW.assigned_project_ids
    LOOP
      k := NULLIF(btrim(k), '');
      IF k IS NULL THEN
        CONTINUE;
      END IF;
      IF NOT (k = ANY(project_keys)) THEN
        project_keys := array_append(project_keys, k);
      END IF;
      resolved_uuid := public.sitebolt_uuid_or_null(k);
      IF resolved_uuid IS NOT NULL AND NOT (resolved_uuid = ANY(project_uuids)) THEN
        project_uuids := array_append(project_uuids, resolved_uuid);
      END IF;
    END LOOP;
  END IF;

  -- Resolve slugs/names (e.g. marsden-park) to project UUIDs. Never insert the slug.
  IF cardinality(project_uuids) > 0 OR cardinality(project_keys) > 0 THEN
    FOR rec IN
      SELECT
        p.id AS pid,
        COALESCE(p.project_name, p.name) AS pname
      FROM public.projects p
      WHERE (
        cardinality(project_uuids) > 0
        AND p.id = ANY(project_uuids)
      )
      OR (
        cardinality(project_keys) > 0
        AND (
          COALESCE(p.slug, '') = ANY(project_keys)
          OR COALESCE(p.project_name, '') = ANY(project_keys)
          OR COALESCE(p.name, '') = ANY(project_keys)
        )
      )
    LOOP
      IF rec.pid IS NOT NULL AND NOT (rec.pid = ANY(project_uuids)) THEN
        project_uuids := array_append(project_uuids, rec.pid);
      END IF;
      IF rec.pname IS NOT NULL AND btrim(rec.pname) <> '' THEN
        project_names := array_append(project_names, rec.pname);
      END IF;
    END LOOP;
  END IF;

  FOR rec IN
    SELECT DISTINCT doc_id, doc_project_id
    FROM (
      SELECT d.id AS doc_id, d.project_id AS doc_project_id
      FROM public.swms_documents d
      WHERE COALESCE(d.is_archived, false) = false
        AND COALESCE(d.status, 'Active') NOT ILIKE 'archived'
        AND (
          d.project_id IS NULL
          OR (
            cardinality(project_uuids) > 0
            AND d.project_id = ANY(project_uuids)
          )
        )
      UNION
      SELECT s.id AS doc_id, s.project_id AS doc_project_id
      FROM public.swms s
      WHERE COALESCE(s.is_archived, false) = false
        AND COALESCE(s.status, 'Active') NOT ILIKE 'archived'
        AND (
          s.project_id IS NULL
          OR (
            cardinality(project_uuids) > 0
            AND s.project_id = ANY(project_uuids)
          )
        )
        AND EXISTS (
          SELECT 1 FROM public.swms_documents d2 WHERE d2.id = s.id
        )
    ) docs
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.swms_assignments a
      WHERE a.swms_id = rec.doc_id
        AND (
          a.assignee_id = NEW.id
          OR a.worker_id = NEW.id
        )
    ) THEN
      signing_token := replace(gen_random_uuid()::text, '-', '');
      INSERT INTO public.swms_assignments (
        swms_id,
        assignee_type,
        assignee_id,
        worker_id,
        assignee_name,
        worker_name,
        name,
        signing_token,
        token,
        signature_token,
        status,
        project_id
      )
      VALUES (
        rec.doc_id,
        'worker',
        NEW.id,
        NEW.id,
        worker_name,
        worker_name,
        worker_name,
        signing_token,
        signing_token,
        signing_token,
        'Pending',
        rec.doc_project_id
      );
      swms_assigned := swms_assigned + 1;
    END IF;
  END LOOP;

  -- Company induction = template.project_id IS NULL + NSW/ACT/WA/NZ title/key match.
  -- Project induction = template.project_id equals a worker project UUID.
  -- Do not read induction_form_templates.state. Do not classify by scope text.
  FOR rec IN
    SELECT
      t.id,
      t.title,
      t.project_id,
      t.project_name
    FROM public.induction_form_templates t
    WHERE COALESCE(t.status, 'active') ILIKE 'active'
      AND COALESCE(t.is_active, true) = true
      AND (
        (
          t.project_id IS NULL
          AND worker_state <> ''
          AND public.sitebolt_company_induction_matches_state(
            t.title,
            t.system_template_key,
            worker_state
          )
        )
        OR (
          t.project_id IS NOT NULL
          AND cardinality(project_uuids) > 0
          AND t.project_id = ANY(project_uuids)
        )
      )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM public.form_worker_assignments a
      WHERE a.worker_id = NEW.id
        AND (
          a.form_id = rec.id
          OR a.form_template_id = rec.id
          OR a.template_id = rec.id
          OR a.induction_form_id = rec.id
        )
    ) THEN
      INSERT INTO public.form_worker_assignments (
        form_id,
        form_template_id,
        template_id,
        induction_form_id,
        form_title,
        title,
        worker_id,
        worker_name,
        project_id,
        project_name,
        status,
        assigned_at,
        assigned_by_name
      )
      VALUES (
        rec.id,
        rec.id,
        rec.id,
        rec.id,
        rec.title,
        rec.title,
        NEW.id,
        worker_name,
        rec.project_id,
        COALESCE(rec.project_name, project_names[1]),
        'Pending',
        now(),
        'SiteBolt Auto-Assign'
      );
      induction_assigned := induction_assigned + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'Safety auto-assign worker %: % SWMS, % inductions',
    NEW.id, swms_assigned, induction_assigned;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_worker_auto_assign_safety_docs failed for worker %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_assign_safety_docs ON public.workers;

CREATE TRIGGER trg_auto_assign_safety_docs
  AFTER INSERT OR UPDATE OF state, assigned_project_id, assigned_project_ids, project_id
  ON public.workers
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_worker_auto_assign_safety_docs();

COMMENT ON FUNCTION public.handle_worker_auto_assign_safety_docs() IS
  'Assign company+project SWMS into swms_assignments and matching inductions into form_worker_assignments. UUID-only project_id. No ON CONFLICT. No organisation_id.';

UPDATE public.workers
SET assigned_project_id = assigned_project_id
WHERE deleted_at IS NULL
  AND COALESCE(is_archived, false) = false
  AND COALESCE(is_revoked, false) = false;

NOTIFY pgrst, 'reload schema';
