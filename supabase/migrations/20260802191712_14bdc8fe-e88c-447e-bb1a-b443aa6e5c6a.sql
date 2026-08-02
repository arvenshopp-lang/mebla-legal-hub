-- سمات التصميم
CREATE TABLE public.design_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.design_themes TO service_role;
ALTER TABLE public.design_themes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.design_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid NOT NULL REFERENCES public.design_themes(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  page_key text NOT NULL DEFAULT 'global',
  design_tokens_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_tokens_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_css text NOT NULL DEFAULT '',
  sanitized_css text NOT NULL DEFAULT '',
  page_css_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  change_summary text,
  published_at timestamptz,
  published_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (theme_id, version_number)
);
GRANT ALL ON public.design_versions TO service_role;
ALTER TABLE public.design_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.design_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid NOT NULL REFERENCES public.design_themes(id) ON DELETE CASCADE,
  page_key text NOT NULL DEFAULT 'global',
  design_tokens_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_css text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision_number integer NOT NULL DEFAULT 1,
  UNIQUE (theme_id, page_key)
);
GRANT ALL ON public.design_drafts TO service_role;
ALTER TABLE public.design_drafts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.design_publish_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid REFERENCES public.design_themes(id) ON DELETE SET NULL,
  active_version_id uuid REFERENCES public.design_versions(id) ON DELETE SET NULL,
  previous_version_id uuid REFERENCES public.design_versions(id) ON DELETE SET NULL,
  rollback_available boolean NOT NULL DEFAULT false,
  rollback_used_at timestamptz,
  rollback_used_by uuid,
  cache_version integer NOT NULL DEFAULT 1,
  last_published_at timestamptz,
  last_published_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  singleton boolean NOT NULL DEFAULT true,
  UNIQUE (singleton)
);
GRANT ALL ON public.design_publish_state TO service_role;
ALTER TABLE public.design_publish_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.design_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  page_key text,
  version_id uuid,
  before_summary jsonb,
  after_summary jsonb,
  ip_address text,
  user_agent text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.design_audit_logs TO service_role;
ALTER TABLE public.design_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX design_versions_theme_idx ON public.design_versions (theme_id, version_number DESC);
CREATE INDEX design_audit_logs_created_idx ON public.design_audit_logs (created_at DESC);

CREATE TRIGGER design_themes_updated_at BEFORE UPDATE ON public.design_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER design_publish_state_updated_at BEFORE UPDATE ON public.design_publish_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.design_themes (name, status, is_active) VALUES ('تصميم مِهلة الافتراضي', 'active', true);
INSERT INTO public.design_publish_state (theme_id, singleton)
  SELECT id, true FROM public.design_themes LIMIT 1;