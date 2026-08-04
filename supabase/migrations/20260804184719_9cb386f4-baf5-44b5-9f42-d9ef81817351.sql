-- ============================================================
-- Least Privilege: صلاحيات مستقلة لبيانات أطراف القضية
-- ============================================================

CREATE TABLE public.case_party_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('case_parties.read','case_parties.create','case_parties.update','case_parties.delete')),
  reason text,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, permission)
);

CREATE INDEX case_party_permissions_lookup_idx
  ON public.case_party_permissions (organization_id, user_id, permission)
  WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_party_permissions TO authenticated;
GRANT ALL ON public.case_party_permissions TO service_role;
ALTER TABLE public.case_party_permissions ENABLE ROW LEVEL SECURITY;

-- العضو يرى صلاحياته فقط؛ المالك/المدير يرى ويدير صلاحيات مكتبه.
CREATE POLICY case_party_permissions_select ON public.case_party_permissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
  );

CREATE POLICY case_party_permissions_insert ON public.case_party_permissions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

CREATE POLICY case_party_permissions_update ON public.case_party_permissions
  FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

CREATE POLICY case_party_permissions_delete ON public.case_party_permissions
  FOR DELETE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

-- المنح يجب أن يكون لعضو نشط في نفس المكتب فقط.
CREATE OR REPLACE FUNCTION private.case_party_permissions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'لا يمكن منح صلاحية لعضو غير نشط في هذا المكتب';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER case_party_permissions_guard_trg
  BEFORE INSERT OR UPDATE ON public.case_party_permissions
  FOR EACH ROW EXECUTE FUNCTION private.case_party_permissions_guard();

-- ============================================================
-- محرك التحقق: صلاحية فعّالة واحدة لكل عملية (read <> write)
-- ============================================================
CREATE OR REPLACE FUNCTION private.has_case_party_permission(
  _organization_id uuid,
  _user_id uuid,
  _permission text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
BEGIN
  IF _user_id IS NULL OR _organization_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT m.role INTO _role
  FROM public.organization_members m
  WHERE m.organization_id = _organization_id
    AND m.user_id = _user_id
    AND m.status = 'active';

  IF _role IS NULL THEN
    RETURN false;
  END IF;

  -- المالك والمدير: مسؤولية إدارية كاملة داخل مكتبهم.
  IF _role IN ('owner','admin') THEN
    RETURN true;
  END IF;

  -- القراءة: متاحة لأعضاء الممارسة القانونية، وللمشاهد فقط بمنح صريح.
  IF _permission = 'case_parties.read' AND _role IN ('lawyer','legal_assistant') THEN
    RETURN true;
  END IF;

  -- أي كتابة (إنشاء/تعديل/حذف): منح صريح ساري فقط.
  RETURN EXISTS (
    SELECT 1
    FROM public.case_party_permissions p
    WHERE p.organization_id = _organization_id
      AND p.user_id = _user_id
      AND p.permission = _permission
      AND p.revoked_at IS NULL
      AND (p.expires_at IS NULL OR p.expires_at > now())
  );
END;
$$;

REVOKE ALL ON FUNCTION private.has_case_party_permission(uuid, uuid, text) FROM PUBLIC;

-- غلاف عام للاستخدام من الخادم/الواجهة (يعمل على المستخدم الموقّع فقط).
CREATE OR REPLACE FUNCTION public.my_case_party_permissions(_organization_id uuid)
RETURNS TABLE(permission text, allowed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.permission,
         private.has_case_party_permission(_organization_id, auth.uid(), p.permission)
  FROM (VALUES
    ('case_parties.read'),
    ('case_parties.create'),
    ('case_parties.update'),
    ('case_parties.delete')
  ) AS p(permission);
$$;

REVOKE ALL ON FUNCTION public.my_case_party_permissions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_case_party_permissions(uuid) TO authenticated;

-- ============================================================
-- RLS على case_parties: كل عملية بصلاحيتها المستقلة
-- ============================================================
DROP POLICY IF EXISTS parties_select ON public.case_parties;
DROP POLICY IF EXISTS parties_insert ON public.case_parties;
DROP POLICY IF EXISTS parties_update ON public.case_parties;
DROP POLICY IF EXISTS parties_delete ON public.case_parties;

CREATE POLICY case_parties_read ON public.case_parties
  FOR SELECT TO authenticated
  USING (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.read'));

CREATE POLICY case_parties_create ON public.case_parties
  FOR INSERT TO authenticated
  WITH CHECK (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.create'));

CREATE POLICY case_parties_update ON public.case_parties
  FOR UPDATE TO authenticated
  USING (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.update'))
  WITH CHECK (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.update'));

CREATE POLICY case_parties_delete ON public.case_parties
  FOR DELETE TO authenticated
  USING (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.delete'));

-- ============================================================
-- سجل تدقيق أطراف القضية: قبل/بعد، غير قابل للتعديل أو الحذف
-- ============================================================
CREATE TABLE public.case_party_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  case_id uuid,
  party_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  actor_id uuid,
  before_values jsonb,
  after_values jsonb,
  changed_fields text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX case_party_audit_org_idx ON public.case_party_audit_logs (organization_id, created_at DESC);
CREATE INDEX case_party_audit_party_idx ON public.case_party_audit_logs (party_id, created_at DESC);

GRANT SELECT ON public.case_party_audit_logs TO authenticated;
GRANT ALL ON public.case_party_audit_logs TO service_role;
ALTER TABLE public.case_party_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_party_audit_select ON public.case_party_audit_logs
  FOR SELECT TO authenticated
  USING (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.read'));

CREATE TRIGGER case_party_audit_no_update
  BEFORE UPDATE ON public.case_party_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();

CREATE TRIGGER case_party_audit_no_delete
  BEFORE DELETE ON public.case_party_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- التقاط القيم قبل/بعد مع تنقية كاملة لأي حقل حساس مشفّر.
CREATE OR REPLACE FUNCTION private.case_parties_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _before jsonb;
  _after jsonb;
  _changed text[];
  _redact text[] := ARRAY[
    'national_id','national_id_enc','national_id_bidx',
    'commercial_registration','commercial_registration_enc','commercial_registration_bidx'
  ];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    _before := (to_jsonb(OLD) - _redact);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    _after := (to_jsonb(NEW) - _redact);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key ORDER BY key) INTO _changed
    FROM jsonb_each(_after) a
    WHERE _before -> a.key IS DISTINCT FROM a.value;
  END IF;

  INSERT INTO public.case_party_audit_logs (
    organization_id, case_id, party_id, action, actor_id, before_values, after_values, changed_fields
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    COALESCE(NEW.case_id, OLD.case_id),
    COALESCE(NEW.id, OLD.id),
    CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END,
    auth.uid(),
    _before,
    _after,
    _changed
  );

  RETURN NULL;
END;
$$;

CREATE TRIGGER case_parties_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.case_parties
  FOR EACH ROW EXECUTE FUNCTION private.case_parties_audit();