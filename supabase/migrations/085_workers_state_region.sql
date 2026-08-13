-- Worker state / region for pay rules and directory filtering (NSW, ACT, WA, NZ)

ALTER TABLE workers
  ADD COLUMN IF NOT EXISTS state text;

COMMENT ON COLUMN workers.state IS
  'Worker state or region code (NSW, ACT, WA, NZ).';
