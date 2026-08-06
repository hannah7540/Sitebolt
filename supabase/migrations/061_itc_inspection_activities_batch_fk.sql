-- Repoint inspection activities to itc_batch_items (batch workflow primary table)

ALTER TABLE itc_inspection_activities
  DROP CONSTRAINT IF EXISTS itc_inspection_activities_itc_id_fkey;

ALTER TABLE itc_inspection_activities
  ADD CONSTRAINT itc_inspection_activities_itc_id_fkey
  FOREIGN KEY (itc_id) REFERENCES itc_batch_items(id) ON DELETE CASCADE;

COMMENT ON COLUMN itc_inspection_activities.itc_id IS 'References itc_batch_items.id for generated batch ITCs';
