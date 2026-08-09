-- ============================================================
-- MEHLA FEATURE 01 — Public Office Profile
-- ============================================================

-- 1) office_public_pages -------------------------------------
CREATE TABLE public.office_public_pages (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  suspended_by_platform boolean NOT NULL DEFAULT false,
  suspension_reason text,
  draft jsonb NOT NULL DEFAULT '{}'::jsonb,
  published jsonb,
  published_at timestamptz,
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_pages_status_check CHECK (status IN ('draft','published','unpublished')),
  CONSTRAINT office_pages_slug_check CHECK (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$')
);
CREATE UNIQUE INDEX office_public_pages_slug_key ON public.office_public_pages (slug);
CREATE INDEX office_public_pages_status_idx ON public.office_public_pages (status);

GRANT SELECT, INSERT, UPDATE ON public.office_public_pages TO authenticated;
GRANT ALL ON public.office_public_pages TO service_role;
ALTER TABLE public.office_public_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office members read their public page" ON public.office_public_pages
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = office_public_pages.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
    )
  );
CREATE POLICY "office managers create their public page" ON public.office_public_pages
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = office_public_pages.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('owner','admin')
    )
  );
CREATE POLICY "office managers update their public page" ON public.office_public_pages
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = office_public_pages.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('owner','admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = office_public_pages.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('owner','admin')
    )
  );
CREATE TRIGGER office_public_pages_updated_at BEFORE UPDATE ON public.office_public_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2) office_leads --------------------------------------------
CREATE TABLE public.office_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  phone text,
  email text,
  city text,
  service_key text,
  message text,
  preferred_contact text,
  consent_at timestamptz,
  consent_policy_version text,
  consent_document_key text,
  consent_text_hash text,
  page_version integer,
  status text NOT NULL DEFAULT 'new',
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  internal_note text,
  source text NOT NULL DEFAULT 'office_page',
  channel text NOT NULL DEFAULT 'direct',
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  referrer_host text,
  converted_client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  dedupe_hash text NOT NULL,
  dedupe_window timestamptz NOT NULL DEFAULT now(),
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_leads_status_check CHECK (
    status IN ('new','contacted','qualified','unqualified','converted','archived')
  ),
  CONSTRAINT office_leads_contact_check CHECK (
    preferred_contact IS NULL OR preferred_contact IN ('phone','whatsapp','email')
  ),
  CONSTRAINT office_leads_reach_check CHECK (phone IS NOT NULL OR email IS NOT NULL)
);

CREATE INDEX office_leads_org_created_idx ON public.office_leads (organization_id, created_at DESC);
CREATE INDEX office_leads_org_status_idx ON public.office_leads (organization_id, status);
CREATE UNIQUE INDEX office_leads_dedupe_key
  ON public.office_leads (organization_id, dedupe_hash, dedupe_window);

-- نافذة منع التكرار تُحسب في القاعدة (10 دقائق) فلا يمكن للعميل التلاعب بها.
CREATE OR REPLACE FUNCTION public.office_leads_set_dedupe_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.dedupe_window := to_timestamp(floor(extract(epoch FROM now()) / 600) * 600);
  RETURN NEW;
END;
$$;
CREATE TRIGGER office_leads_dedupe_window BEFORE INSERT ON public.office_leads
  FOR EACH ROW EXECUTE FUNCTION public.office_leads_set_dedupe_window();

GRANT SELECT, INSERT, UPDATE ON public.office_leads TO authenticated;
GRANT ALL ON public.office_leads TO service_role;
ALTER TABLE public.office_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office members read their leads" ON public.office_leads
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = office_leads.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
    )
  );
CREATE POLICY "office staff update their leads" ON public.office_leads
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = office_leads.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('owner','admin','lawyer','legal_assistant')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = office_leads.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('owner','admin','lawyer','legal_assistant')
    )
  );

CREATE TRIGGER office_leads_updated_at BEFORE UPDATE ON public.office_leads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) office_page_events (aggregated, anonymous) ---------------
CREATE TABLE public.office_page_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL,
  channel text NOT NULL DEFAULT 'direct',
  count bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT office_page_events_kind_check CHECK (
    kind IN ('view','whatsapp','call','email','map','lead','service_click')
  )
);
CREATE UNIQUE INDEX office_page_events_unique
  ON public.office_page_events (organization_id, day, kind, channel);
CREATE INDEX office_page_events_org_day_idx ON public.office_page_events (organization_id, day DESC);

GRANT SELECT ON public.office_page_events TO authenticated;
GRANT ALL ON public.office_page_events TO service_role;
ALTER TABLE public.office_page_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office members read their page metrics" ON public.office_page_events
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = office_page_events.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
    )
  );
-- زيادة ذرّية في القاعدة: لا قراءة-ثم-كتابة في كود التطبيق.
CREATE OR REPLACE FUNCTION public.bump_office_page_event(
  _organization_id uuid,
  _kind text,
  _channel text DEFAULT 'direct',
  _amount integer DEFAULT 1
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.office_page_events (organization_id, day, kind, channel, count)
  VALUES (
    _organization_id,
    (now() AT TIME ZONE 'Asia/Riyadh')::date,
    _kind,
    COALESCE(NULLIF(_channel, ''), 'direct'),
    GREATEST(COALESCE(_amount, 1), 1)
  )
  ON CONFLICT (organization_id, day, kind, channel)
  DO UPDATE SET
    count = public.office_page_events.count + GREATEST(COALESCE(_amount, 1), 1),
    updated_at = now();
$$;
REVOKE ALL ON FUNCTION public.bump_office_page_event(uuid, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_office_page_event(uuid, text, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_office_page_event(uuid, text, text, integer) TO service_role;

CREATE TRIGGER office_page_events_updated_at BEFORE UPDATE ON public.office_page_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) entitlement flag ----------------------------------------
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS public_office_page boolean NOT NULL DEFAULT true;

-- 5) storage policies ----------------------------------------
-- مستودع المسودة خاص بالكامل: أعضاء المكتب فقط، بمسار يبدأ بمعرّف المكتب.
CREATE POLICY "office members read draft media" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'office-media-draft'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
        AND om.organization_id::text = (storage.foldername(name))[1]
    )
  );
CREATE POLICY "office managers write draft media" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'office-media-draft'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('owner','admin')
        AND om.organization_id::text = (storage.foldername(name))[1]
    )
  );
CREATE POLICY "office managers delete draft media" ON storage.objects
  FOR DELETE TO authenticated USING (
    bucket_id = 'office-media-draft'
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('owner','admin')
        AND om.organization_id::text = (storage.foldername(name))[1]
    )
  );

-- المستودع المنشور: القراءة عامة، والكتابة/الحذف من الخدمة وقت النشر فقط.
CREATE POLICY "published office media is readable" ON storage.objects
  FOR SELECT TO anon, authenticated USING (bucket_id = 'office-public-media');