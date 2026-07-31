-- ============ ENUMS ============
CREATE TYPE public.platform_role AS ENUM ('super_admin', 'staff');
CREATE TYPE public.platform_staff_status AS ENUM ('active', 'suspended');
CREATE TYPE public.subscription_status AS ENUM ('active', 'expired', 'cancelled', 'trial');
CREATE TYPE public.ticket_status AS ENUM ('new', 'awaiting_reply', 'in_progress', 'closed');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- ============ PLATFORM STAFF ============
CREATE TABLE public.platform_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL,
  job_title text,
  role public.platform_role NOT NULL DEFAULT 'staff',
  status public.platform_staff_status NOT NULL DEFAULT 'active',
  permissions text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_staff TO authenticated;
GRANT ALL ON public.platform_staff TO service_role;
ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;

-- ============ PRIVATE HELPERS ============
CREATE OR REPLACE FUNCTION private.is_platform_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = _user_id AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION private.is_platform_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = _user_id AND status = 'active' AND role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION private.has_platform_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = _user_id
      AND status = 'active'
      AND (role = 'super_admin' OR _permission = ANY(permissions))
  )
$$;

REVOKE ALL ON FUNCTION private.is_platform_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_platform_super_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_platform_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_platform_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_platform_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_platform_permission(uuid, text) TO authenticated, service_role;

CREATE POLICY "staff read own row" ON public.platform_staff
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "staff with permission read team" ON public.platform_staff
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'staff.view'));

CREATE TRIGGER platform_staff_updated_at BEFORE UPDATE ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PLANS ============
CREATE TABLE public.platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text,
  description text,
  price_monthly numeric(12,2) NOT NULL DEFAULT 0,
  price_yearly numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  max_users integer,
  max_cases integer,
  max_documents integer,
  max_branches integer,
  storage_gb integer,
  ai_enabled boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_plans TO anon, authenticated;
GRANT ALL ON public.platform_plans TO service_role;
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public can read active public plans" ON public.platform_plans
  FOR SELECT TO anon, authenticated USING (is_active AND is_public);
CREATE POLICY "plan managers read all" ON public.platform_plans
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'plans.manage'));
CREATE POLICY "plan managers insert" ON public.platform_plans
  FOR INSERT TO authenticated WITH CHECK (private.has_platform_permission(auth.uid(), 'plans.manage'));
CREATE POLICY "plan managers update" ON public.platform_plans
  FOR UPDATE TO authenticated USING (private.has_platform_permission(auth.uid(), 'plans.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'plans.manage'));
CREATE POLICY "plan managers delete" ON public.platform_plans
  FOR DELETE TO authenticated USING (private.has_platform_permission(auth.uid(), 'plans.manage'));

CREATE TRIGGER platform_plans_updated_at BEFORE UPDATE ON public.platform_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.platform_plans(id) ON DELETE SET NULL,
  plan_code text NOT NULL,
  plan_label text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  billing_note text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  status public.subscription_status NOT NULL DEFAULT 'active',
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_user_idx ON public.subscriptions(user_id);
CREATE INDEX subscriptions_status_idx ON public.subscriptions(status, ends_at);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "subscription managers read" ON public.subscriptions
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'subscriptions.manage'));
CREATE POLICY "subscription managers insert" ON public.subscriptions
  FOR INSERT TO authenticated WITH CHECK (private.has_platform_permission(auth.uid(), 'subscriptions.manage'));
CREATE POLICY "subscription managers update" ON public.subscriptions
  FOR UPDATE TO authenticated USING (private.has_platform_permission(auth.uid(), 'subscriptions.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'subscriptions.manage'));

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SUPPORT TICKETS ============
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  status public.ticket_status NOT NULL DEFAULT 'new',
  description text NOT NULL,
  assigned_to uuid,
  last_reply_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_user_idx ON public.support_tickets(user_id);
CREATE INDEX support_tickets_status_idx ON public.support_tickets(status, last_reply_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users create own tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "support staff read tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'tickets.view'));
CREATE POLICY "support staff update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated USING (private.has_platform_permission(auth.uid(), 'tickets.reply'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'tickets.reply'));

CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid,
  author_name text NOT NULL,
  is_staff boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_messages_ticket_idx ON public.support_ticket_messages(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket owner reads messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );
CREATE POLICY "ticket owner adds messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid() AND is_staff = false
    AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );
CREATE POLICY "support staff read messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'tickets.view'));
CREATE POLICY "support staff add messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid() AND private.has_platform_permission(auth.uid(), 'tickets.reply')
  );

-- ============ ADMIN AUDIT LOG (immutable) ============
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_logs_created_idx ON public.admin_audit_logs(created_at DESC);

GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read audit log" ON public.admin_audit_logs
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'logs.view'));
CREATE POLICY "staff write audit log" ON public.admin_audit_logs
  FOR INSERT TO authenticated WITH CHECK (private.is_platform_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_audit_enforce_actor()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.actor_id := auth.uid();
  NEW.created_at := now();
  NEW.user_agent := left(coalesce(NEW.user_agent, ''), 300);
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_audit_logs_enforce BEFORE INSERT ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_enforce_actor();

-- ============ PLATFORM SETTINGS ============
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads public settings" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (is_public);
CREATE POLICY "settings managers read" ON public.platform_settings
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'settings.manage'));
CREATE POLICY "settings managers insert" ON public.platform_settings
  FOR INSERT TO authenticated WITH CHECK (private.has_platform_permission(auth.uid(), 'settings.manage'));
CREATE POLICY "settings managers update" ON public.platform_settings
  FOR UPDATE TO authenticated USING (private.has_platform_permission(auth.uid(), 'settings.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'settings.manage'));

-- ============ SEED ============
INSERT INTO public.platform_plans (code, name_ar, name_en, description, price_monthly, price_yearly, max_users, max_cases, max_documents, max_branches, storage_gb, ai_enabled, features, sort_order)
VALUES
  ('basic', 'الباقة الأساسية', 'Basic', 'للمحامي المستقل الذي يدير قضاياه بنفسه.', 199, 1990, 2, 100, 500, 1, 5, false, '["إدارة القضايا والجلسات","تنبيهات المهل","بوابة متابعة العميل"]'::jsonb, 1),
  ('professional', 'الباقة الاحترافية', 'Professional', 'لمكاتب المحاماة الصغيرة والمتوسطة.', 499, 4990, 10, 1000, 5000, 3, 50, true, '["كل مزايا الأساسية","إدارة الفريق والصلاحيات","روابط طلب المستندات","تقارير متقدمة"]'::jsonb, 2),
  ('enterprise', 'باقة المؤسسات', 'Enterprise', 'للمكاتب الكبيرة والإدارات القانونية.', 1499, 14990, 100, NULL, NULL, 20, 500, true, '["كل مزايا الاحترافية","فروع متعددة","تكامل مخصص","دعم أولوية"]'::jsonb, 3);

DO $$
DECLARE v_uid uuid; v_email text := 'ziad.emb@gmail.com';
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.platform_staff (user_id, full_name, email, job_title, role, status, permissions)
    VALUES (v_uid, 'مالك المنصة', v_email, 'Super Admin', 'super_admin', 'active', '{}')
    ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', status = 'active';
  END IF;
END $$;
