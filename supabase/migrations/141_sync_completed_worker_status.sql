-- Align worker status with onboarding completion and link auth users by email.

UPDATE workers
SET
  status = 'active',
  invite_status = 'accepted',
  updated_at = now()
WHERE onboarding_completed IS TRUE
  AND COALESCE(is_revoked, false) = false
  AND COALESCE(is_archived, false) = false
  AND COALESCE(status, '') NOT IN ('Revoked', 'expired_ticket');

UPDATE workers w
SET
  auth_user_id = u.id,
  updated_at = now()
FROM auth.users u
WHERE w.auth_user_id IS NULL
  AND u.email IS NOT NULL
  AND w.email IS NOT NULL
  AND lower(trim(w.email)) = lower(trim(u.email::text))
  AND NOT EXISTS (
    SELECT 1
    FROM workers other
    WHERE other.auth_user_id = u.id
      AND other.id <> w.id
  );
