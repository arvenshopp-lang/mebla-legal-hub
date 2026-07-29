-- Secure, atomic organization onboarding RPC
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  _name text,
  _city text DEFAULT NULL,
  _legal_name text DEFAULT NULL,
  _commercial_registration text DEFAULT NULL,
  _tax_number text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _address text DEFAULT NULL
)
RETURNS TABLE(organization_id uuid, already_exists boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := NULLIF(btrim(_name), '');
  v_existing_org uuid;
  v_new_org uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'ORG_NAME_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Serialize onboarding per user so rapid double-submit cannot create two offices.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT om.organization_id
    INTO v_existing_org
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = v_user_id
    AND om.status = 'active'
    AND o.is_active = true
  ORDER BY om.created_at ASC
  LIMIT 1;

  IF v_existing_org IS NOT NULL THEN
    organization_id := v_existing_org;
    already_exists := true;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.organizations (
    name,
    city,
    legal_name,
    commercial_registration,
    tax_number,
    phone,
    email,
    address,
    created_by
  ) VALUES (
    v_name,
    NULLIF(btrim(_city), ''),
    NULLIF(btrim(_legal_name), ''),
    NULLIF(btrim(_commercial_registration), ''),
    NULLIF(btrim(_tax_number), ''),
    NULLIF(btrim(_phone), ''),
    NULLIF(btrim(_email), ''),
    NULLIF(btrim(_address), ''),
    v_user_id
  )
  RETURNING id INTO v_new_org;

  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role,
    status
  ) VALUES (
    v_new_org,
    v_user_id,
    'owner',
    'active'
  );

  organization_id := v_new_org;
  already_exists := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text) TO authenticated;

-- Direct organization creation is no longer part of the app flow.
DROP POLICY IF EXISTS "orgs_insert_self" ON public.organizations;
REVOKE INSERT ON public.organizations FROM authenticated;

-- Keep office visibility scoped to active memberships.
DROP POLICY IF EXISTS "orgs_select" ON public.organizations;
CREATE POLICY "orgs_select_member" ON public.organizations
FOR SELECT TO authenticated
USING (public.is_organization_member(id, auth.uid()));

DROP POLICY IF EXISTS "orgs_update_owner_admin" ON public.organizations;
CREATE POLICY "orgs_update_owner_admin" ON public.organizations
FOR UPDATE TO authenticated
USING (public.has_organization_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
WITH CHECK (public.has_organization_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- Members can read their own membership row immediately; organization-wide reads remain limited to members.
DROP POLICY IF EXISTS "members_select_same_org" ON public.organization_members;
CREATE POLICY "members_select_self_or_same_org" ON public.organization_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_organization_member(organization_id, auth.uid())
);

-- Direct first-owner membership creation is handled by the RPC. Admins can still invite/manage members.
DROP POLICY IF EXISTS "members_insert_owner_self" ON public.organization_members;
CREATE POLICY "members_insert_admins" ON public.organization_members
FOR INSERT TO authenticated
WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "members_update_admins" ON public.organization_members;
CREATE POLICY "members_update_admins" ON public.organization_members
FOR UPDATE TO authenticated
USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "members_delete_admins" ON public.organization_members;
CREATE POLICY "members_delete_admins" ON public.organization_members
FOR DELETE TO authenticated
USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));