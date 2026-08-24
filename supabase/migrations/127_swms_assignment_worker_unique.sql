-- Idempotent SWMS assignment uniqueness: one row per worker/subcontractor per SWMS document.
-- Deduplicate existing rows before adding the constraint (prefer Signed, then oldest).

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY swms_id, assignee_type, assignee_id
      ORDER BY
        CASE WHEN status = 'Signed' THEN 0 ELSE 1 END,
        created_at ASC NULLS LAST,
        id ASC
    ) AS rn
  FROM swms_assignments
  WHERE assignee_id IS NOT NULL
)
DELETE FROM swms_assignments
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

CREATE UNIQUE INDEX IF NOT EXISTS swms_assignments_swms_assignee_uidx
  ON swms_assignments (swms_id, assignee_type, assignee_id);
