CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

ALTER FUNCTION public.is_organization_member(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.has_organization_role(uuid, uuid, app_role[]) SET SCHEMA private;
ALTER FUNCTION public.get_user_role(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_access_case(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.handle_new_user() SET SCHEMA private;

ALTER FUNCTION private.is_organization_member(uuid, uuid) SET search_path TO public, private;
ALTER FUNCTION private.has_organization_role(uuid, uuid, app_role[]) SET search_path TO public, private;
ALTER FUNCTION private.get_user_role(uuid, uuid) SET search_path TO public, private;
ALTER FUNCTION private.can_access_case(uuid, uuid) SET search_path TO public, private;
ALTER FUNCTION private.handle_new_user() SET search_path TO public, private;

REVOKE ALL ON FUNCTION private.is_organization_member(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_organization_role(uuid, uuid, app_role[]) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_user_role(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_access_case(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.handle_new_user() FROM public, anon, authenticated;

ALTER FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text) SET search_path TO public, private;

-- Allow authorized staff to correct or remove case timeline entries
CREATE POLICY "updates_update" ON public.case_updates
FOR UPDATE TO authenticated
USING (
  private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  OR created_by = auth.uid()
)
WITH CHECK (
  private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  OR created_by = auth.uid()
);

CREATE POLICY "updates_delete" ON public.case_updates
FOR DELETE TO authenticated
USING (
  private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  OR created_by = auth.uid()
);

-- Tighten invitation access to explicit owner/admin-only commands
DROP POLICY IF EXISTS "invites_admin_all" ON public.organization_invitations;

CREATE POLICY "invites_admin_select" ON public.organization_invitations
FOR SELECT TO authenticated
USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "invites_admin_insert" ON public.organization_invitations
FOR INSERT TO authenticated
WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "invites_admin_update" ON public.organization_invitations
FOR UPDATE TO authenticated
USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]))
WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "invites_admin_delete" ON public.organization_invitations
FOR DELETE TO authenticated
USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));