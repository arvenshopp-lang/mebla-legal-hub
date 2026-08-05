-- ============ HR ============
CREATE TYPE public.hr_employment_status AS ENUM ('active','probation','on_notice','suspended','terminated','resigned');
CREATE TYPE public.hr_employment_type AS ENUM ('full_time','part_time','contract','intern','vendor');

CREATE TABLE public.hr_employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  user_id uuid,
  full_name text NOT NULL,
  email text NOT NULL,
  phone text,
  department_id uuid REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  manager_employee_id uuid REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  job_title text,
  employment_type public.hr_employment_type NOT NULL DEFAULT 'full_time',
  employment_status public.hr_employment_status NOT NULL DEFAULT 'active',
  joined_at date,
  ended_at date,
  work_location text,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_emp_name_len CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 160),
  CONSTRAINT hr_emp_email_chk CHECK (position('@' in email) > 1),
  CONSTRAINT hr_emp_dates_chk CHECK (ended_at IS NULL OR joined_at IS NULL OR ended_at >= joined_at)
);
CREATE UNIQUE INDEX hr_employees_email_key ON public.hr_employees (lower(btrim(email)));
CREATE UNIQUE INDEX hr_employees_staff_key ON public.hr_employees (staff_id) WHERE staff_id IS NOT NULL;
CREATE INDEX hr_employees_dept_idx ON public.hr_employees (department_id);

CREATE TABLE public.hr_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.hr_employees(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  storage_path text,
  issued_on date,
  expires_on date,
  notes text,
  uploaded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT hr_doc_kind_chk CHECK (kind IN ('contract','nda','id','certificate','offer','other')),
  CONSTRAINT hr_doc_title_len CHECK (char_length(btrim(title)) BETWEEN 2 AND 200)
);
CREATE INDEX hr_documents_emp_idx ON public.hr_documents (employee_id);

-- ============ Marketing ============
CREATE TYPE public.marketing_campaign_status AS ENUM ('draft','scheduled','running','paused','completed','cancelled');

CREATE TABLE public.marketing_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  channel text NOT NULL,
  objective text,
  status public.marketing_campaign_status NOT NULL DEFAULT 'draft',
  starts_on date,
  ends_on date,
  budget_amount numeric(14,2) NOT NULL DEFAULT 0,
  spend_amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  utm_source text,
  utm_medium text,
  utm_campaign text,
  landing_page_slug text,
  coupon_id uuid REFERENCES public.platform_coupons(id) ON DELETE SET NULL,
  owner_staff_id uuid REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mk_campaign_name_len CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  CONSTRAINT mk_campaign_channel_chk CHECK (channel IN ('email','in_app','social','search','referral','content','event','sms','other')),
  CONSTRAINT mk_campaign_amounts_chk CHECK (budget_amount >= 0 AND spend_amount >= 0),
  CONSTRAINT mk_campaign_dates_chk CHECK (ends_on IS NULL OR starts_on IS NULL OR ends_on >= starts_on)
);
CREATE UNIQUE INDEX marketing_campaigns_name_key ON public.marketing_campaigns (lower(btrim(name)));
CREATE UNIQUE INDEX marketing_campaigns_utm_key ON public.marketing_campaigns (lower(btrim(utm_campaign)))
  WHERE utm_campaign IS NOT NULL AND btrim(utm_campaign) <> '';

CREATE TABLE public.marketing_conversion_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  label text,
  campaign_id uuid REFERENCES public.marketing_campaigns(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  value_amount numeric(14,2) NOT NULL DEFAULT 0,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mk_event_key_chk CHECK (event_key ~ '^[a-z0-9_.]{2,60}$'),
  CONSTRAINT mk_event_value_chk CHECK (value_amount >= 0)
);
CREATE INDEX marketing_conversion_events_time_idx ON public.marketing_conversion_events (occurred_at DESC);
CREATE INDEX marketing_conversion_events_campaign_idx ON public.marketing_conversion_events (campaign_id);

CREATE TABLE public.marketing_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text,
  referrer_kind text NOT NULL DEFAULT 'partner',
  referrer_name text,
  referrer_email text,
  coupon_id uuid REFERENCES public.platform_coupons(id) ON DELETE SET NULL,
  reward_note text,
  is_active boolean NOT NULL DEFAULT true,
  uses_count integer NOT NULL DEFAULT 0,
  max_uses integer,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT mk_ref_code_chk CHECK (code ~ '^[A-Za-z0-9_-]{3,40}$'),
  CONSTRAINT mk_ref_kind_chk CHECK (referrer_kind IN ('partner','organization','staff','influencer')),
  CONSTRAINT mk_ref_uses_chk CHECK (uses_count >= 0 AND (max_uses IS NULL OR max_uses > 0))
);
CREATE UNIQUE INDEX marketing_referrals_code_key ON public.marketing_referrals (upper(btrim(code)));

-- ============ محركات عامة ============
CREATE TABLE public.platform_feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  label text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ff_key_chk CHECK (key ~ '^[a-z0-9_.]{3,60}$')
);
CREATE UNIQUE INDEX platform_feature_flags_key ON public.platform_feature_flags (key);

CREATE TABLE public.platform_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  source text NOT NULL DEFAULT 'app',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id text,
  request_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  process_error text,
  CONSTRAINT platform_events_topic_chk CHECK (topic ~ '^[a-z0-9_.]{3,80}$')
);
CREATE INDEX platform_events_topic_idx ON public.platform_events (topic, occurred_at DESC);
CREATE INDEX platform_events_pending_idx ON public.platform_events (occurred_at) WHERE processed_at IS NULL;

CREATE TABLE public.platform_notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  label text NOT NULL,
  channel text NOT NULL DEFAULT 'email',
  target text NOT NULL,
  template_key text,
  is_enabled boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nr_topic_chk CHECK (topic ~ '^[a-z0-9_.*]{3,80}$'),
  CONSTRAINT nr_channel_chk CHECK (channel IN ('email','in_app','sms'))
);
CREATE UNIQUE INDEX platform_notification_rules_key ON public.platform_notification_rules (topic, channel, lower(btrim(target)));

CREATE TABLE public.platform_backup_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text,
  kind text NOT NULL DEFAULT 'daily',
  status text NOT NULL DEFAULT 'unknown',
  started_at timestamptz,
  finished_at timestamptz,
  size_bytes bigint,
  checksum text,
  verified_at timestamptz,
  verified_by uuid,
  retention_until date,
  notes text,
  recorded_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT backup_source_chk CHECK (source IN ('managed_platform','manual_export','external')),
  CONSTRAINT backup_kind_chk CHECK (kind IN ('daily','weekly','pre_release','manual')),
  CONSTRAINT backup_status_chk CHECK (status IN ('unknown','completed','failed','in_progress'))
);
CREATE INDEX platform_backup_snapshots_time_idx ON public.platform_backup_snapshots (coalesce(finished_at, created_at) DESC);

CREATE TABLE public.platform_backup_restore_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_id uuid REFERENCES public.platform_backup_snapshots(id) ON DELETE SET NULL,
  reason text NOT NULL,
  scope text NOT NULL DEFAULT 'full',
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL,
  requested_by_email text NOT NULL,
  approved_by uuid,
  approved_by_email text,
  approved_at timestamptz,
  decision_note text,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT restore_reason_len CHECK (char_length(btrim(reason)) BETWEEN 10 AND 1000),
  CONSTRAINT restore_status_chk CHECK (status IN ('pending','approved','rejected','executed','cancelled')),
  CONSTRAINT restore_scope_chk CHECK (scope IN ('full','table','point_in_time'))
);

-- ============ GRANTS ============
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_employees, public.hr_documents,
  public.marketing_campaigns, public.marketing_conversion_events, public.marketing_referrals,
  public.platform_feature_flags, public.platform_notification_rules,
  public.platform_backup_snapshots, public.platform_backup_restore_requests TO authenticated;
GRANT SELECT ON public.platform_events TO authenticated;
GRANT ALL ON public.hr_employees, public.hr_documents, public.marketing_campaigns,
  public.marketing_conversion_events, public.marketing_referrals, public.platform_feature_flags,
  public.platform_events, public.platform_notification_rules, public.platform_backup_snapshots,
  public.platform_backup_restore_requests TO service_role;

ALTER TABLE public.hr_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hr_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_conversion_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_notification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_backup_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_backup_restore_requests ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('hr_employees','hr.read','hr.manage'),
      ('hr_documents','hr.documents.read','hr.manage'),
      ('marketing_campaigns','marketing.read','marketing.manage'),
      ('marketing_conversion_events','marketing.read','marketing.manage'),
      ('marketing_referrals','marketing.read','marketing.manage'),
      ('platform_feature_flags','settings.manage','settings.manage'),
      ('platform_notification_rules','settings.manage','settings.manage'),
      ('platform_backup_snapshots','backups.manage','backups.manage'),
      ('platform_backup_restore_requests','backups.manage','backups.manage')
    ) AS v(tbl, read_perm, write_perm)
  LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_staff_read ON public.%1$I FOR SELECT TO authenticated
        USING (private.has_platform_permission(auth.uid(), %2$L));
      CREATE POLICY %1$s_staff_insert ON public.%1$I FOR INSERT TO authenticated
        WITH CHECK (private.has_platform_permission(auth.uid(), %3$L));
      CREATE POLICY %1$s_staff_update ON public.%1$I FOR UPDATE TO authenticated
        USING (private.has_platform_permission(auth.uid(), %3$L))
        WITH CHECK (private.has_platform_permission(auth.uid(), %3$L));
      CREATE POLICY %1$s_staff_delete ON public.%1$I FOR DELETE TO authenticated
        USING (private.has_platform_permission(auth.uid(), %3$L));
    $f$, r.tbl, r.read_perm, r.write_perm);
  END LOOP;
END $$;

CREATE POLICY platform_events_staff_read ON public.platform_events FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'monitoring.read'));

CREATE TRIGGER hr_employees_updated BEFORE UPDATE ON public.hr_employees FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER hr_documents_updated BEFORE UPDATE ON public.hr_documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER marketing_campaigns_updated BEFORE UPDATE ON public.marketing_campaigns FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER marketing_referrals_updated BEFORE UPDATE ON public.marketing_referrals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER platform_feature_flags_updated BEFORE UPDATE ON public.platform_feature_flags FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER platform_notification_rules_updated BEFORE UPDATE ON public.platform_notification_rules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER platform_restore_updated BEFORE UPDATE ON public.platform_backup_restore_requests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- أرقام نظامية للمقترحات والعقود
CREATE OR REPLACE FUNCTION public.next_financial_number(_kind text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_period text := to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY');
  v_default_prefix text;
  v_prefix text;
  v_pad integer;
  v_val bigint;
BEGIN
  IF _kind NOT IN ('invoice','quote','credit_note','proposal','contract') THEN
    RAISE EXCEPTION 'INVALID_SEQUENCE_KIND' USING ERRCODE = 'P0001';
  END IF;
  v_default_prefix := CASE _kind WHEN 'invoice' THEN 'MEH-INV'
                                 WHEN 'quote' THEN 'MEH-QT'
                                 WHEN 'proposal' THEN 'MEH-PR'
                                 WHEN 'contract' THEN 'MEH-CT'
                                 ELSE 'MEH-CN' END;

  PERFORM pg_advisory_xact_lock(hashtextextended(_kind || ':' || v_period, 77));

  INSERT INTO public.platform_number_sequences (kind, period_key, prefix)
  VALUES (_kind, v_period, v_default_prefix)
  ON CONFLICT (kind, period_key) DO NOTHING;

  UPDATE public.platform_number_sequences
     SET next_value = next_value + 1, updated_at = now()
   WHERE kind = _kind AND period_key = v_period
  RETURNING next_value - 1, prefix, padding INTO v_val, v_prefix, v_pad;

  RETURN v_prefix || '-' || v_period || '-' || lpad(v_val::text, v_pad, '0');
END;
$function$;

-- مزوّدو التحليلات والإعلانات داخل مركز التكاملات الحالي (غير مربوطين حتى إضافة الحسابات)
INSERT INTO public.integration_definitions
  (provider_key, display_name, display_name_ar, category, category_label, adapter_type,
   website_url, supported_auth_types, required_fields, optional_fields, capabilities, health_hint, sort_order)
VALUES
  ('google_analytics','Google Analytics 4','تحليلات جوجل','analytics','قياس وتحليلات','custom_rest',
   'https://analytics.google.com','{api_key,oauth}','{measurement_id}','{api_secret,property_id}',
   '{"metrics":true,"events":true}'::jsonb,'يتطلب معرّف القياس ومفتاح واجهة القياس',10),
  ('google_ads','Google Ads','إعلانات جوجل','ads','منصات إعلانية','custom_rest',
   'https://ads.google.com','{oauth}','{customer_id}','{developer_token}',
   '{"spend":true,"conversions":true}'::jsonb,'يتطلب حساب إعلاني ورمز مطوّر معتمد',20),
  ('meta_ads','Meta Ads','إعلانات ميتا','ads','منصات إعلانية','custom_rest',
   'https://business.facebook.com','{oauth,api_key}','{ad_account_id}','{pixel_id}',
   '{"spend":true,"conversions":true}'::jsonb,'يتطلب حساب أعمال ميتا ورمز وصول طويل الأجل',30),
  ('tiktok_ads','TikTok Ads','إعلانات تيك توك','ads','منصات إعلانية','custom_rest',
   'https://ads.tiktok.com','{api_key,oauth}','{advertiser_id}','{pixel_code}',
   '{"spend":true,"conversions":true}'::jsonb,'يتطلب معرّف المعلن ورمز وصول',40),
  ('snapchat_ads','Snapchat Ads','إعلانات سناب شات','ads','منصات إعلانية','custom_rest',
   'https://ads.snapchat.com','{oauth}','{ad_account_id}','{pixel_id}',
   '{"spend":true,"conversions":true}'::jsonb,'يتطلب حساب إعلاني معتمد',50),
  ('linkedin_ads','LinkedIn Ads','إعلانات لينكدإن','ads','منصات إعلانية','custom_rest',
   'https://business.linkedin.com','{oauth}','{account_id}','{}',
   '{"spend":true,"conversions":true}'::jsonb,'يتطلب حساب إعلاني على لينكدإن',60)
ON CONFLICT (provider_key) DO NOTHING;

INSERT INTO public.platform_feature_flags (key, label, description, is_enabled) VALUES
  ('crm.enabled','مركز علاقات العملاء','تشغيل وحدة CRM داخل لوحة الإدارة.', true),
  ('sales_docs.enabled','عروض الأسعار والعقود','تشغيل وحدة المستندات البيعية.', true),
  ('sales_docs.esign','التوقيع الإلكتروني','تمكين توقيع العقود إلكترونياً داخل المنصة.', true),
  ('marketing.enabled','مركز التسويق','تشغيل وحدة الحملات والتحويلات.', true),
  ('hr.enabled','مركز الموظفين','تشغيل سجل موظفي الشركة.', true),
  ('backups.center','مركز النسخ الاحتياطية','عرض سجل النسخ وطلبات الاستعادة.', true)
ON CONFLICT (key) DO NOTHING;