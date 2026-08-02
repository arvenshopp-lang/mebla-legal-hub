REVOKE EXECUTE ON FUNCTION public.my_subscription_overview(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_metered_usage(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_subscription_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_metered_usage(uuid, text, integer) TO authenticated;