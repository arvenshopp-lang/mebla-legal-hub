-- ============ 1) Global unique 10-digit case codes ============
CREATE TABLE IF NOT EXISTS public.case_code_registry (
  code text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.case_code_registry TO service_role;
ALTER TABLE public.case_code_registry ENABLE ROW LEVEL SECURITY;
-- no policies: registry is internal only (accessed by SECURITY DEFINER functions)

CREATE OR REPLACE FUNCTION private.generate_case_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_code text;
  i int := 0;
BEGIN
  PERFORM 1;
  LOOP
    i := i + 1;
    -- cryptographically random 10 digits, never starting with 0
    v_code := (1 + (get_byte(extensions.gen_random_bytes(1), 0) % 9))::text
      || lpad((((get_byte(extensions.gen_random_bytes(4), 0)::bigint << 24)
              + (get_byte(extensions.gen_random_bytes(4), 0)::bigint << 16)
              + (get_byte(extensions.gen_random_bytes(4), 0)::bigint << 8)
              + get_byte(extensions.gen_random_bytes(4), 0)::bigint) % 1000000000)::text, 9, '0');
    BEGIN
      INSERT INTO public.case_code_registry (code) VALUES (v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF i > 50 THEN RAISE EXCEPTION 'CASE_CODE_GENERATION_FAILED'; END IF;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.generate_case_code() FROM PUBLIC;

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS public_code text;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.cases WHERE public_code IS NULL LOOP
    UPDATE public.cases SET public_code = private.generate_case_code() WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cases_public_code_key ON public.cases (public_code);

CREATE OR REPLACE FUNCTION private.cases_set_public_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.public_code := private.generate_case_code();
  ELSE
    NEW.public_code := OLD.public_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cases_public_code ON public.cases;
CREATE TRIGGER trg_cases_public_code
BEFORE INSERT OR UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION private.cases_set_public_code();

-- ============ 2) client-visible flag on case updates ============
ALTER TABLE public.case_updates
  ADD COLUMN IF NOT EXISTS is_client_visible boolean NOT NULL DEFAULT false;

-- ============ 3) document requests ============
CREATE TABLE IF NOT EXISTS public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  requested_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  completed_at timestamptz,
  file_count integer NOT NULL DEFAULT 0,
  submitted_ip text,
  submitted_user_agent text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_requests TO authenticated;
GRANT ALL ON public.document_requests TO service_role;
ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_requests_select" ON public.document_requests FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "doc_requests_insert" ON public.document_requests FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));
CREATE POLICY "doc_requests_update" ON public.document_requests FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));
CREATE POLICY "doc_requests_delete" ON public.document_requests FOR DELETE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));

CREATE TRIGGER trg_doc_requests_updated_at BEFORE UPDATE ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_doc_requests_case ON public.document_requests (case_id, created_at DESC);

-- ============ 4) request activity log ============
CREATE TABLE IF NOT EXISTS public.document_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_request_events TO authenticated;
GRANT ALL ON public.document_request_events TO service_role;
ALTER TABLE public.document_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_request_events_select" ON public.document_request_events FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_doc_request_events_request ON public.document_request_events (request_id, created_at DESC);

-- ============ 5) documents provenance ============
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS document_request_id uuid REFERENCES public.document_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_ip text;

-- ============ 6) case lookup rate limiting ============
CREATE TABLE IF NOT EXISTS public.case_lookup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  code_attempt text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.case_lookup_attempts TO service_role;
ALTER TABLE public.case_lookup_attempts ENABLE ROW LEVEL SECURITY;
-- no policies: server-only table

CREATE INDEX IF NOT EXISTS idx_case_lookup_ip ON public.case_lookup_attempts (ip_hash, created_at DESC);
