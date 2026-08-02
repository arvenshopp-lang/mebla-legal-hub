-- =========================================================
-- 1. Plan capability columns
-- =========================================================
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS max_clients integer,
  ADD COLUMN IF NOT EXISTS ocr_pages_monthly integer,
  ADD COLUMN IF NOT EXISTS esignature_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_search_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS client_upload_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_level text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS sla_hours integer NOT NULL DEFAULT 24;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;

-- Fallback plan used when an office has no active subscription.
INSERT INTO public.platform_plans
  (code, name_ar, name_en, description, price_monthly, price_yearly, currency,
   max_users, max_cases, max_documents, max_clients, storage_gb, ocr_pages_monthly,
   ai_enabled, esignature_enabled, voice_enabled, api_enabled,
   pdf_search_enabled, client_upload_enabled, support_level, sla_hours,
   is_active, is_public, sort_order, color, duration_months, features)
VALUES
  ('free', 'الباقة المجانية', 'Free', 'وصول محدود يُطبّق تلقائياً عند عدم وجود اشتراك نشط.',
   0, 0, 'SAR', 1, 5, 20, 5, 1, 0,
   false, false, false, false, true, false, 'community', 72,
   true, false, 0, '#6B7280', 1, '[]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- =========================================================
-- 2. Invoices
-- =========================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id uuid,
  number text NOT NULL UNIQUE,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  status text NOT NULL DEFAULT 'paid',
  payment_method text,
  paid_at timestamptz,
  issued_at timestamptz NOT NULL DEFAULT now(),
  pdf_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices org members read" ON public.invoices;
CREATE POLICY "invoices org members read" ON public.invoices FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_organization_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "invoices staff read" ON public.invoices;
CREATE POLICY "invoices staff read" ON public.invoices FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'subscriptions.manage'));

DROP TRIGGER IF EXISTS invoices_set_updated_at ON public.invoices;
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS invoices_org_idx ON public.invoices(organization_id, issued_at DESC);

-- =========================================================
-- 3. Metered usage counters (OCR pages, API calls, ...)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric text NOT NULL,
  period_start date NOT NULL,
  used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, metric, period_start)
);

GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage org members read" ON public.usage_counters;
CREATE POLICY "usage org members read" ON public.usage_counters FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));

DROP TRIGGER IF EXISTS usage_counters_set_updated_at ON public.usage_counters;
CREATE TRIGGER usage_counters_set_updated_at BEFORE UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Organization members can read their own office subscriptions.
DROP POLICY IF EXISTS "org members read org subscriptions" ON public.subscriptions;
CREATE POLICY "org members read org subscriptions" ON public.subscriptions FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));

-- =========================================================
-- 4. Entitlement resolution (server-side source of truth)
-- =========================================================
CREATE OR REPLACE FUNCTION private.org_subscription(_org uuid)
RETURNS public.subscriptions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT s.* FROM public.subscriptions s
  WHERE s.organization_id = _org
  ORDER BY (s.status = 'active' AND s.ends_at > now()) DESC,
           (s.status = 'trial' AND s.ends_at > now()) DESC,
           s.ends_at DESC
  LIMIT 1
$$;

-- Effective state: active | trial | expired | suspended | cancelled | none
CREATE OR REPLACE FUNCTION private.org_subscription_state(_org uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE
    WHEN s.id IS NULL THEN 'none'
    WHEN s.status = 'cancelled' THEN 'cancelled'
    WHEN s.suspended_at IS NOT NULL THEN 'suspended'
    WHEN s.ends_at <= now() THEN 'expired'
    WHEN s.status = 'trial' THEN 'trial'
    WHEN s.status = 'active' THEN 'active'
    ELSE s.status::text
  END
  FROM (SELECT * FROM private.org_subscription(_org)) s
$$;

-- Plan actually in force right now (falls back to the free plan).
CREATE OR REPLACE FUNCTION private.org_effective_plan(_org uuid)
RETURNS public.platform_plans
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_state text := private.org_subscription_state(_org);
  v_sub public.subscriptions;
  v_plan public.platform_plans;
BEGIN
  IF v_state IN ('active', 'trial') THEN
    SELECT * INTO v_sub FROM private.org_subscription(_org);
    IF v_sub.plan_id IS NOT NULL THEN
      SELECT * INTO v_plan FROM public.platform_plans WHERE id = v_sub.plan_id;
    END IF;
    IF v_plan.id IS NULL AND v_sub.plan_code IS NOT NULL THEN
      SELECT * INTO v_plan FROM public.platform_plans WHERE code = v_sub.plan_code;
    END IF;
    IF v_plan.id IS NOT NULL THEN
      RETURN v_plan;
    END IF;
  END IF;
  SELECT * INTO v_plan FROM public.platform_plans WHERE code = 'free';
  RETURN v_plan;
END;
$$;

CREATE OR REPLACE FUNCTION private.org_usage(_org uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM public.organization_members m
              WHERE m.organization_id = _org AND m.status <> 'suspended'),
    'cases', (SELECT count(*) FROM public.cases c WHERE c.organization_id = _org),
    'clients', (SELECT count(*) FROM public.clients cl WHERE cl.organization_id = _org),
    'documents', (SELECT count(*) FROM public.documents d WHERE d.organization_id = _org),
    'storage_bytes', (SELECT coalesce(sum(d.file_size), 0) FROM public.documents d WHERE d.organization_id = _org),
    'ocr_pages', (SELECT coalesce(sum(u.used), 0) FROM public.usage_counters u
                  WHERE u.organization_id = _org AND u.metric = 'ocr_pages'
                    AND u.period_start = date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')::date)
  )
$$;

-- Public read API for the app: full subscription snapshot for one office.
CREATE OR REPLACE FUNCTION public.my_subscription_overview(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_sub public.subscriptions;
  v_plan public.platform_plans;
  v_state text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_organization_member(_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_sub FROM private.org_subscription(_organization_id);
  SELECT * INTO v_plan FROM private.org_effective_plan(_organization_id);
  v_state := private.org_subscription_state(_organization_id);

  RETURN jsonb_build_object(
    'state', v_state,
    'now', now(),
    'subscription', CASE WHEN v_sub.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_sub.id,
        'plan_code', v_sub.plan_code,
        'plan_label', v_sub.plan_label,
        'status', v_sub.status,
        'amount', v_sub.amount,
        'currency', v_sub.currency,
        'starts_at', v_sub.starts_at,
        'ends_at', v_sub.ends_at,
        'auto_renew', v_sub.auto_renew,
        'suspended_at', v_sub.suspended_at,
        'suspension_reason', v_sub.suspension_reason,
        'cancelled_at', v_sub.cancelled_at,
        'days_remaining', floor(extract(epoch FROM (v_sub.ends_at - now())) / 86400)::int
      ) END,
    'plan', jsonb_build_object(
        'code', v_plan.code,
        'name_ar', v_plan.name_ar,
        'description', v_plan.description,
        'price_monthly', v_plan.price_monthly,
        'price_yearly', v_plan.price_yearly,
        'currency', v_plan.currency,
        'max_users', v_plan.max_users,
        'max_cases', v_plan.max_cases,
        'max_clients', v_plan.max_clients,
        'max_documents', v_plan.max_documents,
        'storage_gb', v_plan.storage_gb,
        'ocr_pages_monthly', v_plan.ocr_pages_monthly,
        'ai_enabled', v_plan.ai_enabled,
        'esignature_enabled', v_plan.esignature_enabled,
        'voice_enabled', v_plan.voice_enabled,
        'api_enabled', v_plan.api_enabled,
        'pdf_search_enabled', v_plan.pdf_search_enabled,
        'client_upload_enabled', v_plan.client_upload_enabled,
        'support_level', v_plan.support_level,
        'sla_hours', v_plan.sla_hours,
        'features', v_plan.features
      ),
    'usage', private.org_usage(_organization_id),
    'history', (SELECT coalesce(jsonb_agg(h ORDER BY h->>'starts_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', s.id, 'plan_label', s.plan_label, 'status', s.status,
          'starts_at', s.starts_at, 'ends_at', s.ends_at,
          'amount', s.amount, 'currency', s.currency,
          'suspended_at', s.suspended_at
        ) AS h
        FROM public.subscriptions s WHERE s.organization_id = _organization_id
      ) x),
    'invoices', (SELECT coalesce(jsonb_agg(i ORDER BY i->>'issued_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', v.id, 'number', v.number, 'amount', v.amount, 'currency', v.currency,
          'status', v.status, 'payment_method', v.payment_method,
          'paid_at', v.paid_at, 'issued_at', v.issued_at, 'pdf_path', v.pdf_path
        ) AS i
        FROM public.invoices v WHERE v.organization_id = _organization_id
      ) y),
    'upgrade_plans', (SELECT coalesce(jsonb_agg(p ORDER BY p->>'sort_order'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'code', pl.code, 'name_ar', pl.name_ar, 'price_monthly', pl.price_monthly,
          'sort_order', pl.sort_order, 'max_users', pl.max_users, 'max_cases', pl.max_cases,
          'esignature_enabled', pl.esignature_enabled, 'voice_enabled', pl.voice_enabled,
          'api_enabled', pl.api_enabled, 'ai_enabled', pl.ai_enabled
        ) AS p
        FROM public.platform_plans pl WHERE pl.is_active AND pl.is_public
      ) z)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_subscription_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_subscription_overview(uuid) TO authenticated;

-- Metered usage recording (server-side only paths).
CREATE OR REPLACE FUNCTION public.record_metered_usage(_organization_id uuid, _metric text, _amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_period date := date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_limit integer;
  v_used integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_organization_member(_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;
  IF _metric <> 'ocr_pages' THEN
    RAISE EXCEPTION 'UNKNOWN_METRIC' USING ERRCODE = 'P0001';
  END IF;

  IF private.org_subscription_state(_organization_id) NOT IN ('active', 'trial') THEN
    RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT ocr_pages_monthly INTO v_limit FROM private.org_effective_plan(_organization_id);

  INSERT INTO public.usage_counters (organization_id, metric, period_start, used)
  VALUES (_organization_id, _metric, v_period, _amount)
  ON CONFLICT (organization_id, metric, period_start)
  DO UPDATE SET used = public.usage_counters.used + _amount
  RETURNING used INTO v_used;

  IF v_limit IS NOT NULL AND v_used > v_limit THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED:ocr_pages' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_used;
END;
$$;

REVOKE ALL ON FUNCTION public.record_metered_usage(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_metered_usage(uuid, text, integer) TO authenticated;

-- =========================================================
-- 5. Hard quota enforcement at the database layer
-- =========================================================
CREATE OR REPLACE FUNCTION private.enforce_plan_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_org uuid := NEW.organization_id;
  v_state text;
  v_plan public.platform_plans;
  v_count bigint;
  v_bytes bigint;
BEGIN
  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  v_state := private.org_subscription_state(v_org);
  SELECT * INTO v_plan FROM private.org_effective_plan(v_org);

  IF v_state = 'suspended' THEN
    RAISE EXCEPTION 'SUBSCRIPTION_SUSPENDED' USING ERRCODE = 'P0001';
  END IF;

  IF TG_TABLE_NAME = 'cases' AND v_plan.max_cases IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.cases WHERE organization_id = v_org;
    IF v_count >= v_plan.max_cases THEN
      RAISE EXCEPTION 'QUOTA_EXCEEDED:cases' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'clients' AND v_plan.max_clients IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.clients WHERE organization_id = v_org;
    IF v_count >= v_plan.max_clients THEN
      RAISE EXCEPTION 'QUOTA_EXCEEDED:clients' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'organization_members' THEN
    IF NEW.status <> 'suspended' AND v_plan.max_users IS NOT NULL THEN
      SELECT count(*) INTO v_count FROM public.organization_members
        WHERE organization_id = v_org AND status <> 'suspended';
      IF v_count >= v_plan.max_users THEN
        RAISE EXCEPTION 'QUOTA_EXCEEDED:users' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'organization_invitations' AND v_plan.max_users IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.organization_members
      WHERE organization_id = v_org AND status <> 'suspended';
    IF v_count >= v_plan.max_users THEN
      RAISE EXCEPTION 'QUOTA_EXCEEDED:users' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'documents' THEN
    IF v_plan.max_documents IS NOT NULL THEN
      SELECT count(*) INTO v_count FROM public.documents WHERE organization_id = v_org;
      IF v_count >= v_plan.max_documents THEN
        RAISE EXCEPTION 'QUOTA_EXCEEDED:documents' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF v_plan.storage_gb IS NOT NULL THEN
      SELECT coalesce(sum(file_size), 0) INTO v_bytes FROM public.documents WHERE organization_id = v_org;
      IF v_bytes + coalesce(NEW.file_size, 0) > (v_plan.storage_gb::bigint * 1073741824) THEN
        RAISE EXCEPTION 'QUOTA_EXCEEDED:storage' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'document_requests' THEN
    IF NOT v_plan.client_upload_enabled THEN
      RAISE EXCEPTION 'FEATURE_UNAVAILABLE:client_upload' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_enforce_quota ON public.cases;
CREATE TRIGGER cases_enforce_quota BEFORE INSERT ON public.cases
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

DROP TRIGGER IF EXISTS clients_enforce_quota ON public.clients;
CREATE TRIGGER clients_enforce_quota BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

DROP TRIGGER IF EXISTS documents_enforce_quota ON public.documents;
CREATE TRIGGER documents_enforce_quota BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

DROP TRIGGER IF EXISTS members_enforce_quota ON public.organization_members;
CREATE TRIGGER members_enforce_quota BEFORE INSERT ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

DROP TRIGGER IF EXISTS invitations_enforce_quota ON public.organization_invitations;
CREATE TRIGGER invitations_enforce_quota BEFORE INSERT ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

DROP TRIGGER IF EXISTS document_requests_enforce_quota ON public.document_requests;
CREATE TRIGGER document_requests_enforce_quota BEFORE INSERT ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();
