-- =====================================================================
-- المرحلة الثالثة | أساس RBAC لفريق منصة مِهلة
-- =====================================================================

-- 1) الأقسام -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description text,
  parent_department_id uuid REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  manager_user_id uuid,
  default_role_id uuid REFERENCES public.platform_roles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_departments TO authenticated;
GRANT ALL ON public.platform_departments TO service_role;
ALTER TABLE public.platform_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read departments"
  ON public.platform_departments FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.platform_departments_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cur uuid; hops int := 0;
BEGIN
  NEW.updated_at := now();
  IF NEW.parent_department_id IS NOT NULL THEN
    IF NEW.parent_department_id = NEW.id THEN
      RAISE EXCEPTION 'DEPARTMENT_CYCLE' USING ERRCODE = 'P0001';
    END IF;
    cur := NEW.parent_department_id;
    WHILE cur IS NOT NULL AND hops < 50 LOOP
      IF cur = NEW.id THEN RAISE EXCEPTION 'DEPARTMENT_CYCLE' USING ERRCODE = 'P0001'; END IF;
      SELECT parent_department_id INTO cur FROM public.platform_departments WHERE id = cur;
      hops := hops + 1;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS platform_departments_guard ON public.platform_departments;
CREATE TRIGGER platform_departments_guard
  BEFORE INSERT OR UPDATE ON public.platform_departments
  FOR EACH ROW EXECUTE FUNCTION public.platform_departments_guard();

-- 2) بيانات الموظف: القسم والمدير المباشر -----------------------------
ALTER TABLE public.platform_staff
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid;

CREATE INDEX IF NOT EXISTS platform_staff_department_idx ON public.platform_staff(department_id);
CREATE INDEX IF NOT EXISTS platform_staff_manager_idx ON public.platform_staff(manager_user_id);

CREATE OR REPLACE FUNCTION public.platform_staff_manager_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cur uuid; hops int := 0;
BEGIN
  IF NEW.manager_user_id IS NOT NULL THEN
    IF NEW.manager_user_id = NEW.user_id THEN
      RAISE EXCEPTION 'MANAGER_CYCLE' USING ERRCODE = 'P0001';
    END IF;
    cur := NEW.manager_user_id;
    WHILE cur IS NOT NULL AND hops < 50 LOOP
      IF cur = NEW.user_id THEN RAISE EXCEPTION 'MANAGER_CYCLE' USING ERRCODE = 'P0001'; END IF;
      SELECT manager_user_id INTO cur FROM public.platform_staff WHERE user_id = cur;
      hops := hops + 1;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS platform_staff_manager_guard ON public.platform_staff;
CREATE TRIGGER platform_staff_manager_guard
  BEFORE INSERT OR UPDATE ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.platform_staff_manager_guard();

-- 3) الصلاحيات الأساسية (دور + فرد) قبل أي منح ------------------------
CREATE OR REPLACE FUNCTION private.base_platform_permissions(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT array_agg(DISTINCT p) FROM (
       SELECT unnest(coalesce(s.permissions, '{}'::text[])) AS p
       FROM public.platform_staff s WHERE s.user_id = _user_id AND s.status = 'active'
       UNION
       SELECT unnest(coalesce(r.permissions, '{}'::text[])) AS p
       FROM public.platform_staff s
       JOIN public.platform_roles r ON r.id = s.role_id
       WHERE s.user_id = _user_id AND s.status = 'active'
     ) x), '{}'::text[])
$$;

CREATE OR REPLACE FUNCTION private.is_platform_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_staff
                 WHERE user_id = _user_id AND status = 'active' AND role = 'super_admin')
$$;

-- 4) منح الصلاحيات: مؤقتة أو مفوَّضة ----------------------------------
CREATE TABLE IF NOT EXISTS public.platform_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grantee_user_id uuid NOT NULL,
  permission text NOT NULL,
  source text NOT NULL DEFAULT 'temporary',
  granted_by uuid NOT NULL,
  granted_by_email text,
  reason text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grant_source_valid CHECK (source IN ('temporary', 'delegation')),
  CONSTRAINT grant_window_valid CHECK (expires_at > starts_at),
  CONSTRAINT grant_reason_present CHECK (length(btrim(reason)) >= 8),
  CONSTRAINT grant_no_self_delegation CHECK (source <> 'delegation' OR grantee_user_id <> granted_by)
);

GRANT SELECT ON public.platform_permission_grants TO authenticated;
GRANT ALL ON public.platform_permission_grants TO service_role;
ALTER TABLE public.platform_permission_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read grants"
  ON public.platform_permission_grants FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS ppg_grantee_active_idx
  ON public.platform_permission_grants(grantee_user_id, permission, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS ppg_granter_idx ON public.platform_permission_grants(granted_by);
CREATE UNIQUE INDEX IF NOT EXISTS ppg_unique_live_idx
  ON public.platform_permission_grants(grantee_user_id, permission, source)
  WHERE revoked_at IS NULL;

-- الصلاحيات المفعّلة = الأساسية + المنح السارية زمنياً
CREATE OR REPLACE FUNCTION private.granted_platform_permissions(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT g.permission), '{}'::text[])
  FROM public.platform_permission_grants g
  JOIN public.platform_staff s ON s.user_id = g.grantee_user_id AND s.status = 'active'
  WHERE g.grantee_user_id = _user_id
    AND g.revoked_at IS NULL
    AND g.starts_at <= now()
    AND g.expires_at > now()
$$;

CREATE OR REPLACE FUNCTION private.effective_platform_permissions(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT array_agg(DISTINCT p) FROM (
      SELECT unnest(private.base_platform_permissions(_user_id)) AS p
      UNION
      SELECT unnest(private.granted_platform_permissions(_user_id)) AS p
    ) y), '{}'::text[])
$$;

-- التحقق المركزي: يشمل المنح السارية دون كسر أي سلوك قائم
CREATE OR REPLACE FUNCTION private.has_platform_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN private.is_platform_super_admin(_user_id) THEN true
    WHEN NOT private.is_platform_staff(_user_id) THEN false
    ELSE _permission = ANY (private.effective_platform_permissions(_user_id))
  END
$$;

-- لا تصعيد + لا تسلسل تفويض
CREATE OR REPLACE FUNCTION public.platform_permission_grants_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_super boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- لا يُعاد إحياء منح مسحوب، ولا تُغيّر هويته أو صلاحيته
    IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'GRANT_CANNOT_BE_REVIVED' USING ERRCODE = 'P0001';
    END IF;
    NEW.grantee_user_id := OLD.grantee_user_id;
    NEW.permission := OLD.permission;
    NEW.source := OLD.source;
    NEW.granted_by := OLD.granted_by;
    NEW.starts_at := OLD.starts_at;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_staff
                 WHERE user_id = NEW.grantee_user_id AND status = 'active') THEN
    RAISE EXCEPTION 'GRANTEE_NOT_ACTIVE_STAFF' USING ERRCODE = 'P0001';
  END IF;

  v_super := private.is_platform_super_admin(NEW.granted_by);

  IF NOT v_super THEN
    IF NOT EXISTS (SELECT 1 FROM public.platform_staff
                   WHERE user_id = NEW.granted_by AND status = 'active') THEN
      RAISE EXCEPTION 'GRANTER_NOT_ACTIVE_STAFF' USING ERRCODE = 'P0001';
    END IF;
    -- لا تصعيد: لا يُمنح إلا ما يملكه المانح فعلاً
    IF NOT (NEW.permission = ANY (private.effective_platform_permissions(NEW.granted_by))) THEN
      RAISE EXCEPTION 'PRIVILEGE_ESCALATION_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    -- لا تسلسل: التفويض لا يُبنى على صلاحية مفوَّضة
    IF NEW.source = 'delegation'
       AND NOT (NEW.permission = ANY (private.base_platform_permissions(NEW.granted_by))) THEN
      RAISE EXCEPTION 'CHAINED_DELEGATION_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS platform_permission_grants_guard ON public.platform_permission_grants;
CREATE TRIGGER platform_permission_grants_guard
  BEFORE INSERT OR UPDATE ON public.platform_permission_grants
  FOR EACH ROW EXECUTE FUNCTION public.platform_permission_grants_guard();

CREATE OR REPLACE FUNCTION public.deny_hard_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'RECORD_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
END; $$;

DROP TRIGGER IF EXISTS platform_permission_grants_no_delete ON public.platform_permission_grants;
CREATE TRIGGER platform_permission_grants_no_delete
  BEFORE DELETE ON public.platform_permission_grants
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 5) طلبات الاعتماد (Four-Eyes) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL,
  requested_by_email text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
  decided_by uuid,
  decided_by_email text,
  decided_at timestamptz,
  decision_reason text,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_status_valid CHECK (status IN ('pending','approved','rejected','expired','executed')),
  CONSTRAINT approval_reason_present CHECK (length(btrim(reason)) >= 8),
  CONSTRAINT approval_four_eyes CHECK (decided_by IS NULL OR decided_by <> requested_by),
  CONSTRAINT approval_window_valid CHECK (expires_at > requested_at)
);

GRANT SELECT ON public.platform_approval_requests TO authenticated;
GRANT ALL ON public.platform_approval_requests TO service_role;
ALTER TABLE public.platform_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read approvals"
  ON public.platform_approval_requests FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS par_status_idx ON public.platform_approval_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS par_requester_idx ON public.platform_approval_requests(requested_by);
CREATE UNIQUE INDEX IF NOT EXISTS par_unique_pending_idx
  ON public.platform_approval_requests(action, resource_type, coalesce(resource_id, ''))
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.platform_approval_requests_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.decided_by := NULL; NEW.decided_at := NULL; NEW.executed_at := NULL;
    NEW.requested_at := now(); NEW.created_at := now(); NEW.updated_at := now();
    RETURN NEW;
  END IF;

  NEW.action := OLD.action;
  NEW.resource_type := OLD.resource_type;
  NEW.resource_id := OLD.resource_id;
  NEW.requested_by := OLD.requested_by;
  NEW.requested_at := OLD.requested_at;
  NEW.payload := OLD.payload;
  NEW.reason := OLD.reason;
  NEW.updated_at := now();

  IF OLD.status <> 'pending' AND NEW.status IN ('approved','rejected') THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status IN ('approved','rejected') THEN
    IF NEW.decided_by IS NULL THEN
      RAISE EXCEPTION 'DECISION_ACTOR_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.decided_by = OLD.requested_by THEN
      RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.expires_at <= now() THEN
      RAISE EXCEPTION 'REQUEST_EXPIRED' USING ERRCODE = 'P0001';
    END IF;
    NEW.decided_at := now();
  END IF;

  IF NEW.status = 'executed' AND OLD.status <> 'approved' THEN
    RAISE EXCEPTION 'REQUEST_NOT_APPROVED' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS platform_approval_requests_guard ON public.platform_approval_requests;
CREATE TRIGGER platform_approval_requests_guard
  BEFORE INSERT OR UPDATE ON public.platform_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.platform_approval_requests_guard();

DROP TRIGGER IF EXISTS platform_approval_requests_no_delete ON public.platform_approval_requests;
CREATE TRIGGER platform_approval_requests_no_delete
  BEFORE DELETE ON public.platform_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 6) جلسات الموظفين والأجهزة ------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  device text,
  browser text,
  os text,
  ip text,
  country text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  requests_count integer NOT NULL DEFAULT 1,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_session_unique UNIQUE (user_id, device_fingerprint)
);

GRANT SELECT ON public.platform_staff_sessions TO authenticated;
GRANT ALL ON public.platform_staff_sessions TO service_role;
ALTER TABLE public.platform_staff_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read sessions"
  ON public.platform_staff_sessions FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid())
         AND (user_id = auth.uid() OR private.has_platform_permission(auth.uid(), 'staff.sessions.read')));

CREATE INDEX IF NOT EXISTS pss_user_idx ON public.platform_staff_sessions(user_id, last_seen_at DESC);

-- 7) قيود الوصول لكل موظف (IP / جهاز / وقت) ---------------------------
CREATE TABLE IF NOT EXISTS public.platform_staff_restrictions (
  user_id uuid PRIMARY KEY,
  ip_enforced boolean NOT NULL DEFAULT false,
  allowed_ips text[] NOT NULL DEFAULT '{}'::text[],
  device_enforced boolean NOT NULL DEFAULT false,
  trusted_devices text[] NOT NULL DEFAULT '{}'::text[],
  time_enforced boolean NOT NULL DEFAULT false,
  work_start_minute integer NOT NULL DEFAULT 0,
  work_end_minute integer NOT NULL DEFAULT 1440,
  allowed_weekdays integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}'::integer[],
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_window_valid CHECK (work_start_minute >= 0 AND work_end_minute <= 1440
                                      AND work_end_minute > work_start_minute)
);

GRANT SELECT ON public.platform_staff_restrictions TO authenticated;
GRANT ALL ON public.platform_staff_restrictions TO service_role;
ALTER TABLE public.platform_staff_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read restrictions"
  ON public.platform_staff_restrictions FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid())
         AND (user_id = auth.uid()
              OR private.has_platform_permission(auth.uid(), 'staff.restrictions.manage')));

-- 8) الانتحال ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  actor_email text,
  target_user_id uuid NOT NULL,
  target_email text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  approval_request_id uuid REFERENCES public.platform_approval_requests(id) ON DELETE SET NULL,
  approved_by uuid,
  approved_at timestamptz,
  started_at timestamptz,
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  ended_by uuid,
  end_reason text,
  read_only boolean NOT NULL DEFAULT true,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT imp_status_valid CHECK (status IN ('pending','active','ended','rejected','expired')),
  CONSTRAINT imp_reason_present CHECK (length(btrim(reason)) >= 8),
  CONSTRAINT imp_read_only_always CHECK (read_only),
  CONSTRAINT imp_not_self CHECK (actor_user_id <> target_user_id),
  CONSTRAINT imp_four_eyes CHECK (approved_by IS NULL OR approved_by <> actor_user_id)
);

GRANT SELECT ON public.platform_impersonation_sessions TO authenticated;
GRANT ALL ON public.platform_impersonation_sessions TO service_role;
ALTER TABLE public.platform_impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read impersonation"
  ON public.platform_impersonation_sessions FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS pis_actor_idx ON public.platform_impersonation_sessions(actor_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pis_single_active_idx
  ON public.platform_impersonation_sessions(actor_user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.platform_impersonation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.platform_impersonation_sessions(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  event text NOT NULL,
  path text,
  detail text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_impersonation_events TO authenticated;
GRANT ALL ON public.platform_impersonation_events TO service_role;
ALTER TABLE public.platform_impersonation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read impersonation events"
  ON public.platform_impersonation_events FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS pie_session_idx ON public.platform_impersonation_events(session_id, created_at);

CREATE OR REPLACE FUNCTION public.deny_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'RECORD_IMMUTABLE' USING ERRCODE = 'P0001';
END; $$;

DROP TRIGGER IF EXISTS platform_impersonation_events_immutable ON public.platform_impersonation_events;
CREATE TRIGGER platform_impersonation_events_immutable
  BEFORE UPDATE ON public.platform_impersonation_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS platform_impersonation_events_no_delete ON public.platform_impersonation_events;
CREATE TRIGGER platform_impersonation_events_no_delete
  BEFORE DELETE ON public.platform_impersonation_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

DROP TRIGGER IF EXISTS platform_impersonation_sessions_no_delete ON public.platform_impersonation_sessions;
CREATE TRIGGER platform_impersonation_sessions_no_delete
  BEFORE DELETE ON public.platform_impersonation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 9) سجل التدقيق: غير قابل للتعديل أو الحذف ---------------------------
DROP TRIGGER IF EXISTS admin_audit_logs_immutable ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_logs_immutable
  BEFORE UPDATE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS admin_audit_logs_no_delete ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_delete
  BEFORE DELETE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 10) أقسام تأسيسية (متوافقة مع البيانات القائمة) ---------------------
INSERT INTO public.platform_departments (code, name_ar, description)
VALUES
  ('operations', 'التشغيل', 'إدارة المنصة والإعدادات والمراقبة.'),
  ('support', 'الدعم الفني', 'التذاكر والتواصل مع المكاتب.'),
  ('finance', 'المالية', 'الفواتير والمدفوعات والتقارير المالية.'),
  ('security', 'الأمان والامتثال', 'سجل التدقيق والصلاحيات والمخاطر.')
ON CONFLICT (code) DO NOTHING;