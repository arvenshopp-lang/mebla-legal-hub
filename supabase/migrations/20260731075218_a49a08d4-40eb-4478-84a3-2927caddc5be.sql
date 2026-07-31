
-- 1) Internal-only tables: no Data API access at all
REVOKE ALL ON public.case_code_registry FROM anon, authenticated;
REVOKE ALL ON public.case_lookup_attempts FROM anon, authenticated;
GRANT ALL ON public.case_code_registry TO service_role;
GRANT ALL ON public.case_lookup_attempts TO service_role;
COMMENT ON TABLE public.case_code_registry IS 'Internal only: service_role access, RLS on with no policies by design.';
COMMENT ON TABLE public.case_lookup_attempts IS 'Internal only: rate-limit ledger, service_role access, RLS on with no policies by design.';

-- 2) Audit log enrichment (immutable: no UPDATE/DELETE policies exist)
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS user_agent text;

CREATE OR REPLACE FUNCTION public.activity_logs_enforce_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.created_at := now();
  NEW.user_agent := left(coalesce(NEW.user_agent, ''), 300);
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS activity_logs_enforce_actor_trg ON public.activity_logs;
CREATE TRIGGER activity_logs_enforce_actor_trg
BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.activity_logs_enforce_actor();

-- 3) Upload links: bounded lifetime + no resurrection
CREATE OR REPLACE FUNCTION public.document_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.expires_at IS NULL THEN
      NEW.expires_at := now() + interval '7 days';
    ELSIF NEW.expires_at > now() + interval '30 days' THEN
      NEW.expires_at := now() + interval '30 days';
    ELSIF NEW.expires_at <= now() THEN
      RAISE EXCEPTION 'EXPIRY_MUST_BE_FUTURE' USING ERRCODE = 'P0001';
    END IF;
    NEW.status := 'active';
    RETURN NEW;
  END IF;

  IF OLD.status <> 'active' AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'LINK_CANNOT_BE_REACTIVATED' USING ERRCODE = 'P0001';
  END IF;
  NEW.token_hash := OLD.token_hash;
  NEW.organization_id := OLD.organization_id;
  NEW.case_id := OLD.case_id;
  IF OLD.status <> 'active' THEN
    NEW.expires_at := OLD.expires_at;
  ELSIF NEW.expires_at IS NOT NULL AND NEW.expires_at > now() + interval '30 days' THEN
    NEW.expires_at := now() + interval '30 days';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_requests_guard_trg ON public.document_requests;
CREATE TRIGGER document_requests_guard_trg
BEFORE INSERT OR UPDATE ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION public.document_requests_guard();
