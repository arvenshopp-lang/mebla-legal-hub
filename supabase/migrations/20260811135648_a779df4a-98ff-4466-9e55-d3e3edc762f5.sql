-- (1) case_party_audit_logs: append-only عبر الالتقاط الخادمي فقط
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.case_party_audit_logs FROM authenticated;
REVOKE ALL ON public.case_party_audit_logs FROM anon;

-- (2) platform_settings: قائمة بيضاء صريحة للمفاتيح القابلة للظهور العام
UPDATE public.platform_settings SET is_public = false
WHERE is_public AND key NOT IN ('general','seo','public_site');

ALTER TABLE public.platform_settings
  ADD CONSTRAINT platform_settings_public_key_allowlist
  CHECK (NOT is_public OR key IN ('general','seo','public_site'));

DROP POLICY IF EXISTS "anyone reads public settings" ON public.platform_settings;
CREATE POLICY "anyone reads public settings" ON public.platform_settings
  FOR SELECT TO anon, authenticated
  USING (is_public AND key IN ('general','seo','public_site'));

-- (3) profiles: إخفاء بيانات التواصل عن القراءة المباشرة
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (
  id, full_name, avatar_url, job_title, is_active, created_at, updated_at,
  phone_verification_status, phone_verified_at, mfa_status
) ON public.profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.my_profile()
RETURNS TABLE (
  id uuid, full_name text, email text, phone text, avatar_url text, job_title text,
  is_active boolean, created_at timestamptz, updated_at timestamptz,
  phone_verification_status text, phone_verified_at timestamptz, mfa_status text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.email, p.phone, p.avatar_url, p.job_title,
         p.is_active, p.created_at, p.updated_at,
         p.phone_verification_status, p.phone_verified_at, p.mfa_status
  FROM public.profiles p
  WHERE p.id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.org_team_contacts(_organization_id uuid)
RETURNS TABLE (user_id uuid, email text, phone text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.email, p.phone
  FROM public.organization_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.organization_id = _organization_id
    AND EXISTS (
      SELECT 1 FROM public.organization_members me
      WHERE me.organization_id = _organization_id
        AND me.user_id = auth.uid()
        AND me.status = 'active'
        AND me.role IN ('owner','admin')
    );
$$;

REVOKE ALL ON FUNCTION public.org_team_contacts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.org_team_contacts(uuid) TO authenticated;