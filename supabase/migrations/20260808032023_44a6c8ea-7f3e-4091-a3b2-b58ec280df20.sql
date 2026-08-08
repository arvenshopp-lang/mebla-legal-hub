REVOKE EXECUTE ON FUNCTION public.admin_organization_directory(text, text, integer, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_user_directory(text, text, text, integer, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_revenue_summary() FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.admin_service_usage_summary() FROM authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_organization_directory(text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_user_directory(text, text, text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_revenue_summary() TO service_role;
GRANT EXECUTE ON FUNCTION public.admin_service_usage_summary() TO service_role;