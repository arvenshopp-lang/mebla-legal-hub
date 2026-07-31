
-- سياسات تعتمد على الدوال العامة: تُعاد كتابتها على الدوال الخاصة
DROP POLICY IF EXISTS "platform roles readable by active staff" ON public.platform_roles;
DROP POLICY IF EXISTS "platform roles managed with permission" ON public.platform_roles;
DROP POLICY IF EXISTS "staff read support grants" ON public.support_access_grants;
DROP POLICY IF EXISTS "staff read user notes" ON public.platform_user_notes;
DROP POLICY IF EXISTS "staff write user notes" ON public.platform_user_notes;
DROP POLICY IF EXISTS "staff delete user notes" ON public.platform_user_notes;
DROP POLICY IF EXISTS "staff read broadcasts" ON public.platform_broadcasts;
DROP POLICY IF EXISTS "staff read email templates" ON public.platform_email_templates;
DROP POLICY IF EXISTS "staff manage email templates" ON public.platform_email_templates;

DROP FUNCTION IF EXISTS public.platform_has_permission(uuid, text);
DROP FUNCTION IF EXISTS public.platform_staff_permissions(uuid);
DROP FUNCTION IF EXISTS public.is_active_platform_staff(uuid);
DROP FUNCTION IF EXISTS public.has_active_support_access(uuid, uuid);

-- الأدوار المخصصة تُدمج مع الصلاحيات المباشرة
CREATE OR REPLACE FUNCTION private.has_platform_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_staff s
    LEFT JOIN public.platform_roles r ON r.id = s.role_id
    WHERE s.user_id = _user_id
      AND s.status = 'active'
      AND (
        s.role = 'super_admin'
        OR _permission = ANY(coalesce(s.permissions, '{}'::text[]))
        OR _permission = ANY(coalesce(r.permissions, '{}'::text[]))
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.platform_staff_permissions(_user_id uuid)
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

CREATE OR REPLACE FUNCTION private.has_active_support_access(_organization_id uuid, _staff_user_id uuid)
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

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE POLICY "platform roles readable by active staff" ON public.platform_roles
  FOR SELECT TO authenticated USING (private.is_platform_staff(auth.uid()));
CREATE POLICY "platform roles managed with permission" ON public.platform_roles
  FOR ALL TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'roles.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'roles.manage') AND is_system = false);

CREATE POLICY "staff read support grants" ON public.support_access_grants
  FOR SELECT TO authenticated USING (private.is_platform_staff(auth.uid()));

CREATE POLICY "staff read user notes" ON public.platform_user_notes
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'users.read'));
CREATE POLICY "staff write user notes" ON public.platform_user_notes
  FOR INSERT TO authenticated WITH CHECK (private.has_platform_permission(auth.uid(), 'users.update'));
CREATE POLICY "staff delete user notes" ON public.platform_user_notes
  FOR DELETE TO authenticated USING (private.has_platform_permission(auth.uid(), 'users.delete'));

CREATE POLICY "staff read broadcasts" ON public.platform_broadcasts
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'notifications.send'));

CREATE POLICY "staff read email templates" ON public.platform_email_templates
  FOR SELECT TO authenticated USING (private.is_platform_staff(auth.uid()));
CREATE POLICY "staff manage email templates" ON public.platform_email_templates
  FOR ALL TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'email.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'email.manage'));
