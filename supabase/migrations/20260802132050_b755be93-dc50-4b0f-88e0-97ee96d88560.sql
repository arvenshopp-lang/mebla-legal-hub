CREATE TABLE public.print_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  print_ref text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name text,
  user_email text,
  user_role text,
  action text NOT NULL,
  document_id uuid,
  document_type text NOT NULL,
  document_ref text,
  document_title text,
  document_version text NOT NULL DEFAULT 'v1',
  classification text NOT NULL DEFAULT 'internal',
  pages_count integer NOT NULL DEFAULT 1,
  copy_number integer NOT NULL DEFAULT 1,
  watermark_override boolean NOT NULL DEFAULT false,
  ip text,
  country text,
  browser text,
  os text,
  device text,
  session_id text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX print_audit_logs_org_created_idx ON public.print_audit_logs (organization_id, created_at DESC);
CREATE INDEX print_audit_logs_document_idx ON public.print_audit_logs (document_id);
CREATE UNIQUE INDEX print_audit_logs_print_ref_idx ON public.print_audit_logs (print_ref);

GRANT SELECT, INSERT ON public.print_audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.print_audit_logs TO service_role;

ALTER TABLE public.print_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Office members read their office print logs"
ON public.print_audit_logs FOR SELECT TO authenticated
USING (private.is_organization_member(organization_id, auth.uid()));

CREATE POLICY "Office members append their own print logs"
ON public.print_audit_logs FOR INSERT TO authenticated
WITH CHECK (private.is_organization_member(organization_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.print_audit_enforce_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE ua text;
BEGIN
  NEW.user_id := auth.uid();
  NEW.created_at := now();
  ua := left(coalesce(NEW.user_agent, ''), 400);
  NEW.user_agent := ua;
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  NEW.action := lower(coalesce(NEW.action, 'print'));
  IF NEW.action NOT IN ('print', 'export_pdf', 'download') THEN
    RAISE EXCEPTION 'INVALID_PRINT_ACTION' USING ERRCODE = 'P0001';
  END IF;
  NEW.pages_count := greatest(coalesce(NEW.pages_count, 1), 1);
  NEW.copy_number := greatest(coalesce(NEW.copy_number, 1), 1);
  RETURN NEW;
END;
$$;

CREATE TRIGGER print_audit_logs_enforce_actor
BEFORE INSERT ON public.print_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.print_audit_enforce_actor();

CREATE OR REPLACE FUNCTION public.print_copy_number(_organization_id uuid, _document_id uuid, _document_ref text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE WHEN private.is_organization_member(_organization_id, auth.uid())
    THEN (SELECT count(*)::int + 1 FROM public.print_audit_logs l
          WHERE l.organization_id = _organization_id
            AND ((_document_id IS NOT NULL AND l.document_id = _document_id)
                 OR (_document_id IS NULL AND _document_ref IS NOT NULL AND l.document_ref = _document_ref)))
    ELSE 1 END
$$;

REVOKE ALL ON FUNCTION public.print_copy_number(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.print_copy_number(uuid, uuid, text) TO authenticated, service_role;