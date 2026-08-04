REVOKE ALL ON public.design_audit_logs FROM anon, authenticated;
REVOKE ALL ON public.design_drafts FROM anon, authenticated;
REVOKE ALL ON public.design_publish_state FROM anon, authenticated;
REVOKE ALL ON public.design_themes FROM anon, authenticated;
REVOKE ALL ON public.design_versions FROM anon, authenticated;
REVOKE ALL ON public.integration_secrets FROM anon, authenticated;
REVOKE ALL ON public.otp_verifications FROM anon, authenticated;

GRANT ALL ON public.design_audit_logs TO service_role;
GRANT ALL ON public.design_drafts TO service_role;
GRANT ALL ON public.design_publish_state TO service_role;
GRANT ALL ON public.design_themes TO service_role;
GRANT ALL ON public.design_versions TO service_role;
GRANT ALL ON public.integration_secrets TO service_role;
GRANT ALL ON public.otp_verifications TO service_role;