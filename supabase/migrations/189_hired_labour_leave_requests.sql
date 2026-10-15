-- Hired labour workers may insert and read their own leave_requests.
-- current_worker_id() resolves via workers.auth_user_id and does not
-- filter on worker_category / employment type.

DROP POLICY IF EXISTS "Workers manage own leave requests" ON public.leave_requests;
CREATE POLICY "Workers manage own leave requests"
  ON public.leave_requests FOR ALL
  USING (worker_id = public.current_worker_id())
  WITH CHECK (worker_id = public.current_worker_id());

COMMENT ON POLICY "Workers manage own leave requests" ON public.leave_requests IS
  'Own-row access for all workers including hired labour; no category restriction.';
