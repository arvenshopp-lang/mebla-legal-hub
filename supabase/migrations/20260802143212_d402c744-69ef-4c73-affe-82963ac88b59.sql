CREATE TABLE public.document_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('view','preview','download','print','export','share','process')),
  token_hash text NOT NULL UNIQUE,
  watermark_office text NOT NULL,
  watermark_user text NOT NULL,
  watermark_note text,
  classification text NOT NULL DEFAULT 'internal',
  recipient_label text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamp with time zone NOT NULL,
  max_uses integer NOT NULL DEFAULT 3,
  used_count integer NOT NULL DEFAULT 0,
  last_used_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_access_tokens TO authenticated;
GRANT ALL ON public.document_access_tokens TO service_role;

ALTER TABLE public.document_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_share_links_select" ON public.document_access_tokens
  FOR SELECT TO authenticated
  USING (kind = 'share' AND private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role]));

CREATE INDEX document_access_tokens_org_idx ON public.document_access_tokens (organization_id, created_at DESC);
CREATE INDEX document_access_tokens_document_idx ON public.document_access_tokens (document_id, kind);

CREATE TRIGGER document_access_tokens_touch
  BEFORE UPDATE ON public.document_access_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.document_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  share_token_id uuid REFERENCES public.document_access_tokens(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name text,
  office_name text,
  document_name text,
  action_type text NOT NULL CHECK (action_type IN ('VIEW','PREVIEW','DOWNLOAD','SHARE','PRINT','EXPORT')),
  print_id text,
  ip text,
  browser text,
  os text,
  device text,
  session_id text,
  source_page text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_access_logs TO authenticated;
GRANT ALL ON public.document_access_logs TO service_role;

ALTER TABLE public.document_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_access_logs_select_admins" ON public.document_access_logs
  FOR SELECT TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

CREATE INDEX document_access_logs_org_idx ON public.document_access_logs (organization_id, created_at DESC);
CREATE INDEX document_access_logs_document_idx ON public.document_access_logs (document_id, created_at DESC);

DROP POLICY IF EXISTS "docs_storage_select" ON storage.objects;