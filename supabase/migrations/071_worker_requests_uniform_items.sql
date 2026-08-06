-- SiteBolt: multi-item uniform requests (jsonb array)

ALTER TABLE worker_requests
  ADD COLUMN IF NOT EXISTS uniform_items jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN worker_requests.uniform_items IS
  'Array of uniform line items: [{ item, size, quantity }, ...]';
