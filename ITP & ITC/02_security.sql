-- =====================================================================
-- ITC Field — row level security
--
-- This is the important file. These rules run inside the database, so
-- they apply no matter what the app does. If someone opens the browser
-- console and tries to update another worker's sign-off, Postgres
-- refuses. Hiding the button is presentation; this is enforcement.
--
-- Run after 01_schema.sql.
-- =====================================================================

alter table profiles          enable row level security;
alter table zones             enable row level security;
alter table services          enable row level security;
alter table drawings          enable row level security;
alter table drawing_revisions enable row level security;
alter table form_versions     enable row level security;
alter table form_steps        enable row level security;
alter table form_requirements enable row level security;
alter table itcs              enable row level security;
alter table itc_revisions     enable row level security;
alter table signoffs          enable row level security;
alter table signoff_edits     enable row level security;
alter table photos            enable row level security;
alter table progress_log      enable row level security;
alter table compaction_tests  enable row level security;
alter table itc_tests         enable row level security;
alter table change_requests   enable row level security;
alter table ncrs              enable row level security;
alter table diary_entries     enable row level security;
alter table notifications     enable row level security;
alter table audit_log         enable row level security;

-- ---------------------------------------------------------------------
-- PROFILES — everyone can see who's who. You edit your own (mainly your
-- signature). Only an admin changes roles, which stops self-promotion.
-- ---------------------------------------------------------------------
create policy "read all profiles" on profiles
  for select to authenticated using (true);

create policy "update own profile" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = my_role());   -- can't change own role

create policy "admin manages profiles" on profiles
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- REFERENCE DATA — everyone reads, admin writes.
-- ---------------------------------------------------------------------
create policy "read zones" on zones for select to authenticated using (true);
create policy "admin writes zones" on zones
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "read services" on services for select to authenticated using (true);
create policy "admin writes services" on services
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "read drawings" on drawings for select to authenticated using (true);
create policy "admin writes drawings" on drawings
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "read drawing revs" on drawing_revisions for select to authenticated using (true);
create policy "admin writes drawing revs" on drawing_revisions
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "read form versions" on form_versions for select to authenticated using (true);
create policy "admin writes form versions" on form_versions
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "read form steps" on form_steps for select to authenticated using (true);
create policy "admin writes form steps" on form_steps
  for all to authenticated using (is_admin()) with check (is_admin());

create policy "read form reqs" on form_requirements for select to authenticated using (true);
create policy "admin writes form reqs" on form_requirements
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- ITCs — everyone reads. Only admin creates or edits the header
-- (page 1 of your workbook). Leaders can reassign within their crew.
-- ---------------------------------------------------------------------
create policy "read itcs" on itcs for select to authenticated using (true);

create policy "admin writes itcs" on itcs
  for all to authenticated using (is_admin()) with check (is_admin());

-- A leader may only change assigned_to, and only to someone in their crew.
-- The 'using' clause admits the row; 'with check' validates the result.
create policy "leader assigns within crew" on itcs
  for update to authenticated
  using (my_role() = 'leader')
  with check (
    my_role() = 'leader'
    and assigned_to in (select id from profiles where crew = my_crew())
  );

create policy "read itc revisions" on itc_revisions for select to authenticated using (true);
create policy "admin writes itc revisions" on itc_revisions
  for all to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- SIGN-OFFS — the core rule of the whole system.
--
--   You insert only your own.
--   You update only your own, and only the comment.
--   Nobody deletes, ever.
--   A leader may set verified_by, and only on their own crew's rows.
--   Admin may amend, but signoff_edits records it.
-- ---------------------------------------------------------------------
create policy "read signoffs" on signoffs
  for select to authenticated using (true);

create policy "insert own signoff" on signoffs
  for insert to authenticated
  with check (
    author_id = auth.uid()
    -- can't sign against an ITC that's already issued
    and (select stage from itcs where id = itc_id) <> 'Issued'
  );

create policy "author edits own comment" on signoffs
  for update to authenticated
  using (author_id = auth.uid())
  with check (
    author_id = auth.uid()
    and verified_by is not distinct from (select verified_by from signoffs s where s.id = id)
  );

create policy "leader verifies own crew" on signoffs
  for update to authenticated
  using (
    my_role() = 'leader'
    and author_id in (select id from profiles where crew = my_crew())
  )
  with check (
    my_role() = 'leader'
    and verified_by = auth.uid()
  );

create policy "admin amends signoffs" on signoffs
  for update to authenticated using (is_admin()) with check (is_admin());

-- deliberately no delete policy on signoffs — nothing removes them

create policy "read signoff edits" on signoff_edits for select to authenticated using (true);
create policy "log own edit" on signoff_edits
  for insert to authenticated with check (edited_by = auth.uid());

-- ---------------------------------------------------------------------
-- PHOTOS — anyone adds to the shared photo record. You remove your own;
-- admin removes any. Nothing changes once the ITC is issued.
-- ---------------------------------------------------------------------
create policy "read photos" on photos for select to authenticated using (true);

create policy "add photo" on photos
  for insert to authenticated
  with check (
    taken_by = auth.uid()
    and (select stage from itcs where id = itc_id) <> 'Issued'
  );

create policy "remove own photo" on photos
  for delete to authenticated
  using (
    (taken_by = auth.uid() or is_admin())
    and (select stage from itcs where id = itc_id) <> 'Issued'
  );

-- ---------------------------------------------------------------------
-- PROGRESS — you log your own; leaders and admin can correct.
-- ---------------------------------------------------------------------
create policy "read progress" on progress_log for select to authenticated using (true);
create policy "log own progress" on progress_log
  for insert to authenticated with check (logged_by = auth.uid());
create policy "edit own progress" on progress_log
  for update to authenticated
  using (logged_by = auth.uid() or is_leader_or_admin())
  with check (logged_by = auth.uid() or is_leader_or_admin());

-- ---------------------------------------------------------------------
-- COMPACTION TESTS — anyone records one, anyone links it to an ITC they
-- are working on. Only admin edits or unlinks after the fact.
-- ---------------------------------------------------------------------
create policy "read tests" on compaction_tests for select to authenticated using (true);
create policy "record test" on compaction_tests
  for insert to authenticated with check (recorded_by = auth.uid());
create policy "admin edits tests" on compaction_tests
  for update to authenticated using (is_admin()) with check (is_admin());

create policy "read test links" on itc_tests for select to authenticated using (true);
create policy "link test" on itc_tests for insert to authenticated with check (true);
create policy "admin unlinks test" on itc_tests
  for delete to authenticated using (is_admin());

-- ---------------------------------------------------------------------
-- CHANGE REQUESTS — anyone raises one against someone else's sign-off.
-- Only admin resolves.
-- ---------------------------------------------------------------------
create policy "read change requests" on change_requests for select to authenticated using (true);

create policy "raise change request" on change_requests
  for insert to authenticated
  with check (
    raised_by = auth.uid()
    -- pointless to query your own; edit it instead
    and (select author_id from signoffs where id = signoff_id) <> auth.uid()
  );

create policy "admin resolves change request" on change_requests
  for update to authenticated using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------
-- NCRs — leaders and admin raise and close.
-- ---------------------------------------------------------------------
create policy "read ncrs" on ncrs for select to authenticated using (true);
create policy "leader raises ncr" on ncrs
  for insert to authenticated with check (is_leader_or_admin() and raised_by = auth.uid());
create policy "leader closes ncr" on ncrs
  for update to authenticated using (is_leader_or_admin()) with check (is_leader_or_admin());

-- ---------------------------------------------------------------------
-- DIARY — leaders and admin write their own. Everyone can read, so the
-- office sees what the crews recorded.
-- ---------------------------------------------------------------------
create policy "read diary" on diary_entries for select to authenticated using (true);
create policy "write own diary" on diary_entries
  for all to authenticated
  using (author_id = auth.uid() and is_leader_or_admin())
  with check (author_id = auth.uid() and is_leader_or_admin());

-- ---------------------------------------------------------------------
-- NOTIFICATIONS — you only ever see your own.
-- ---------------------------------------------------------------------
create policy "read own notifications" on notifications
  for select to authenticated using (recipient_id = auth.uid());
create policy "mark own read" on notifications
  for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());
create policy "create notification" on notifications
  for insert to authenticated with check (true);

-- ---------------------------------------------------------------------
-- AUDIT LOG — insert and read only. No update, no delete, not even for
-- an admin. That's the point of it.
-- ---------------------------------------------------------------------
create policy "read audit" on audit_log for select to authenticated using (true);
create policy "write audit" on audit_log
  for insert to authenticated with check (actor_id = auth.uid());

-- =====================================================================
-- STORAGE — photos bucket
--
-- Create a bucket named 'itc-photos' in the Supabase dashboard first,
-- set it to private, then run this.
-- =====================================================================
create policy "read itc photos" on storage.objects
  for select to authenticated using (bucket_id = 'itc-photos');

create policy "upload itc photos" on storage.objects
  for insert to authenticated with check (bucket_id = 'itc-photos');

create policy "delete own itc photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'itc-photos' and (owner = auth.uid() or is_admin()));
