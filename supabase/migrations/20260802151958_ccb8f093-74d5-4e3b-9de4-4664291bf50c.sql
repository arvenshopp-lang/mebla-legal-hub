CREATE TABLE IF NOT EXISTS public.system_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE,
  surface text NOT NULL,
  action text NOT NULL,
  error_code text,
  error_message text NOT NULL,
  http_status integer,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  document_id uuid,
  ticket_id uuid,
  path text,
  ip text,
  browser text,
  os text,
  device text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(ref, '') || ' ' ||
      coalesce(surface, '') || ' ' ||
      coalesce(action, '') || ' ' ||
      coalesce(error_code, '') || ' ' ||
      public.normalize_ar(coalesce(error_message, ''))
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS system_failures_created_idx ON public.system_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS system_failures_surface_idx ON public.system_failures (surface, created_at DESC);
CREATE INDEX IF NOT EXISTS system_failures_search_idx ON public.system_failures USING gin (search_vector);

GRANT SELECT ON public.system_failures TO authenticated;
GRANT ALL ON public.system_failures TO service_role;

ALTER TABLE public.system_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform staff read failures" ON public.system_failures;
CREATE POLICY "platform staff read failures"
ON public.system_failures FOR SELECT TO authenticated
USING (private.has_platform_permission(auth.uid(), 'monitoring.read'));