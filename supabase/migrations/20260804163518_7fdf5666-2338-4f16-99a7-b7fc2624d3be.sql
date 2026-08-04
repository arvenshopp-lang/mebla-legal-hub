REVOKE ALL ON FUNCTION public.platform_permission_grants_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_departments_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_staff_manager_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_approval_requests_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deny_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deny_hard_delete() FROM PUBLIC, anon, authenticated;