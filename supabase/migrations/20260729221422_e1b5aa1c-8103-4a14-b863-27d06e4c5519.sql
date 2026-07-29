-- RLS policies are evaluated as the invoking role, so `authenticated` needs
-- USAGE on the private schema and EXECUTE on the helper functions the policies
-- call. The private schema is NOT exposed through the Data API, so these
-- functions remain uncallable from the client.
GRANT USAGE ON SCHEMA private TO authenticated;

GRANT EXECUTE ON FUNCTION private.is_organization_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_organization_role(uuid, uuid, app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_case(uuid, uuid) TO authenticated;

-- handle_new_user stays trigger-only: no execute grant.
REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;