REVOKE EXECUTE ON FUNCTION public.email_suppressions_guard() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_suppressions_guard() FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_suppressions_guard() FROM authenticated;