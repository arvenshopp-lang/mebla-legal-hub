
-- ============ 1) أدوار الإدارة المخصصة ============
CREATE TABLE public.platform_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description text,
  permissions text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_roles TO authenticated;
GRANT ALL ON public.platform_roles TO service_role;
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_staff ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.platform_roles(id) ON DELETE SET NULL;

-- ============ 2) دالة الصلاحيات على الخادم ============
CREATE OR REPLACE FUNCTION public.platform_staff_permissions(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.id IS NULL OR s.status <> 'active' THEN '{}'::text[]
    WHEN s.role = 'super_admin' THEN ARRAY['*']::text[]
    ELSE (SELECT ARRAY(SELECT DISTINCT x FROM unnest(coalesce(s.permissions,'{}'::text[]) || coalesce(r.permissions,'{}'::text[])) AS x))
  END
  FROM public.platform_staff s
  LEFT JOIN public.platform_roles r ON r.id = s.role_id
  WHERE s.user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.platform_has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(public.platform_staff_permissions(_user_id)) AS p
    WHERE p = '*' OR p = _permission
  )
$$;

CREATE OR REPLACE FUNCTION public.is_active_platform_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_staff WHERE user_id = _user_id AND status = 'active')
$$;

REVOKE EXECUTE ON FUNCTION public.platform_staff_permissions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_platform_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_staff_permissions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_platform_staff(uuid) TO authenticated, service_role;

CREATE POLICY "platform roles readable by active staff" ON public.platform_roles
  FOR SELECT TO authenticated USING (public.is_active_platform_staff(auth.uid()));
CREATE POLICY "platform roles managed with permission" ON public.platform_roles
  FOR ALL TO authenticated
  USING (public.platform_has_permission(auth.uid(), 'roles.manage'))
  WITH CHECK (public.platform_has_permission(auth.uid(), 'roles.manage') AND is_system = false);

CREATE TRIGGER platform_roles_updated_at BEFORE UPDATE ON public.platform_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_roles (code, name_ar, description, permissions, is_system) VALUES
  ('support_agent','موظف دعم','الرد على التذاكر ومتابعة الحسابات دون تعديل الإيرادات.',
   ARRAY['tickets.view','tickets.reply','tickets.assign','users.read','organizations.read','monitoring.read'], true),
  ('billing_manager','مسؤول الإيرادات','إدارة الاشتراكات والباقات والتقارير المالية.',
   ARRAY['subscriptions.manage','plans.manage','revenue.read','users.read','users.update','organizations.read','audit.read'], true),
  ('operations','مسؤول تشغيل','إعدادات المنصة والبريد والـ SEO والإشعارات والمراقبة.',
   ARRAY['settings.manage','seo.manage','email.manage','notifications.send','monitoring.read','audit.read','users.read','organizations.read'], true);

-- ============ 3) وصول الدعم المؤقت ============
CREATE TABLE public.support_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL,
  staff_email text NOT NULL,
  reason text NOT NULL,
  scope text[] NOT NULL DEFAULT ARRAY['cases'],
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_access_status_check CHECK (status IN ('pending','approved','revoked','expired','denied'))
);
CREATE INDEX support_access_org_idx ON public.support_access_grants (organization_id, status);
CREATE INDEX support_access_staff_idx ON public.support_access_grants (staff_user_id, status);
GRANT SELECT, INSERT, UPDATE ON public.support_access_grants TO authenticated;
GRANT ALL ON public.support_access_grants TO service_role;
ALTER TABLE public.support_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members see their support grants" ON public.support_access_grants
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = support_access_grants.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
    )
  );
CREATE POLICY "org owners decide on support grants" ON public.support_access_grants
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = support_access_grants.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active' AND om.role IN ('owner','admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = support_access_grants.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active' AND om.role IN ('owner','admin')
    )
  );
CREATE POLICY "staff read support grants" ON public.support_access_grants
  FOR SELECT TO authenticated USING (public.is_active_platform_staff(auth.uid()));

CREATE TRIGGER support_access_updated_at BEFORE UPDATE ON public.support_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.has_active_support_access(_organization_id uuid, _staff_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_access_grants g
    WHERE g.organization_id = _organization_id
      AND g.staff_user_id = _staff_user_id
      AND g.status = 'approved'
      AND g.expires_at > now()
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_active_support_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_support_access(uuid, uuid) TO authenticated, service_role;

-- ============ 4) سجل تدقيق أعمق ============
ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS before_data jsonb,
  ADD COLUMN IF NOT EXISTS after_data jsonb,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS browser text;

CREATE OR REPLACE FUNCTION public.admin_audit_enforce_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE ua text;
BEGIN
  NEW.actor_id := auth.uid();
  NEW.created_at := now();
  ua := left(coalesce(NEW.user_agent, ''), 300);
  NEW.user_agent := ua;
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  NEW.device := CASE
    WHEN ua ~* 'ipad|tablet' THEN 'تابلت'
    WHEN ua ~* 'mobile|iphone|android' THEN 'جوال'
    WHEN ua = '' THEN NULL
    ELSE 'حاسب' END;
  NEW.browser := CASE
    WHEN ua ~* 'edg/' THEN 'Edge'
    WHEN ua ~* 'chrome|crios' THEN 'Chrome'
    WHEN ua ~* 'firefox|fxios' THEN 'Firefox'
    WHEN ua ~* 'safari' THEN 'Safari'
    WHEN ua = '' THEN NULL
    ELSE 'أخرى' END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS admin_audit_enforce_actor_trg ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_enforce_actor_trg BEFORE INSERT ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_enforce_actor();

-- ============ 5) ملاحظات داخلية على المستخدمين ============
CREATE TABLE public.platform_user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  body text NOT NULL,
  author_id uuid,
  author_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_user_notes_user_idx ON public.platform_user_notes (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.platform_user_notes TO authenticated;
GRANT ALL ON public.platform_user_notes TO service_role;
ALTER TABLE public.platform_user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read user notes" ON public.platform_user_notes
  FOR SELECT TO authenticated USING (public.platform_has_permission(auth.uid(), 'users.read'));
CREATE POLICY "staff write user notes" ON public.platform_user_notes
  FOR INSERT TO authenticated WITH CHECK (public.platform_has_permission(auth.uid(), 'users.update'));
CREATE POLICY "staff delete user notes" ON public.platform_user_notes
  FOR DELETE TO authenticated USING (public.platform_has_permission(auth.uid(), 'users.delete'));

-- ============ 6) الإشعارات الإدارية ============
CREATE TABLE public.platform_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL,
  target_user_id uuid,
  target_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  channels text[] NOT NULL DEFAULT ARRAY['in_app'],
  recipients_count integer NOT NULL DEFAULT 0,
  email_sent_count integer NOT NULL DEFAULT 0,
  sent_by uuid,
  sent_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_broadcast_audience_check CHECK (audience IN ('user','organization','all'))
);
GRANT SELECT, INSERT ON public.platform_broadcasts TO authenticated;
GRANT ALL ON public.platform_broadcasts TO service_role;
ALTER TABLE public.platform_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read broadcasts" ON public.platform_broadcasts
  FOR SELECT TO authenticated USING (public.platform_has_permission(auth.uid(), 'notifications.send'));

-- ============ 7) قوالب البريد ============
CREATE TABLE public.platform_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_email_templates TO authenticated;
GRANT ALL ON public.platform_email_templates TO service_role;
ALTER TABLE public.platform_email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read email templates" ON public.platform_email_templates
  FOR SELECT TO authenticated USING (public.is_active_platform_staff(auth.uid()));
CREATE POLICY "staff manage email templates" ON public.platform_email_templates
  FOR ALL TO authenticated
  USING (public.platform_has_permission(auth.uid(), 'email.manage'))
  WITH CHECK (public.platform_has_permission(auth.uid(), 'email.manage'));
CREATE TRIGGER platform_email_templates_updated_at BEFORE UPDATE ON public.platform_email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_email_templates (code, name_ar, subject, body_html) VALUES
  ('signup','ترحيب بالتسجيل','مرحباً بك في منصة مِهلة','<p>مرحباً {{name}}،</p><p>تم إنشاء حسابك في منصة مِهلة بنجاح.</p>'),
  ('verify','تفعيل الحساب','تفعيل حسابك في مِهلة','<p>مرحباً {{name}}،</p><p>لتفعيل حسابك اضغط على الرابط المرسل إليك.</p>'),
  ('reset_password','إعادة تعيين كلمة المرور','إعادة تعيين كلمة المرور','<p>مرحباً {{name}}،</p><p>وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>'),
  ('subscription_activated','تفعيل الاشتراك','تم تفعيل اشتراكك في مِهلة','<p>مرحباً {{name}}،</p><p>تم تفعيل باقة {{plan}} حتى {{ends_at}}.</p>'),
  ('subscription_expiring','قرب انتهاء الاشتراك','اشتراكك في مِهلة على وشك الانتهاء','<p>مرحباً {{name}}،</p><p>ينتهي اشتراكك في {{ends_at}}.</p>'),
  ('support_reply','رد الدعم الفني','رد على تذكرتك {{reference}}','<p>مرحباً {{name}}،</p><p>{{body}}</p>');

-- ============ 8) الباقات: اللون والمدة ============
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#123C32',
  ADD COLUMN IF NOT EXISTS duration_months integer NOT NULL DEFAULT 12;

-- ============ 9) الاشتراكات: طريقة التفعيل والتعليق ============
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS activation_method text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS last_modified_by uuid,
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz;

-- ============ 10) المكاتب: الإيقاف ============
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;
