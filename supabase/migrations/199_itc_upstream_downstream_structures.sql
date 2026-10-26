-- Electrical / HV ITC header structures (replaces free-text Description / area notes).
ALTER TABLE public.project_itcs
  ADD COLUMN IF NOT EXISTS upstream_structure text,
  ADD COLUMN IF NOT EXISTS downstream_structure text;

COMMENT ON COLUMN public.project_itcs.upstream_structure IS
  'Upstream structure / pit label selected or typed on the ITC form';
COMMENT ON COLUMN public.project_itcs.downstream_structure IS
  'Downstream structure / pit label selected or typed on the ITC form';
