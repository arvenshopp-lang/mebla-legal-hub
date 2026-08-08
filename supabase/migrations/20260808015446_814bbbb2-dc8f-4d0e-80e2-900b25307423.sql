-- 1) تصحيح حقل غير موجود (is_active) في تقرير صحة الخدمات
CREATE OR REPLACE FUNCTION public.admin_service_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
  v_services jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT private.is_platform_staff(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'key'), '[]'::jsonb) INTO v_services
  FROM (
    SELECT jsonb_build_object(
      'key', d.key,
      'label', d.name_ar,
      'category', d.category,
      'configured', coalesce(i.is_configured, false),
      'enabled', coalesce(i.is_enabled, false),
      'status', coalesce(i.health_status, 'unknown'),
      'last_check_at', i.last_health_check_at,
      'latency_ms', (
        SELECT h.latency_ms FROM public.integration_health_logs h
        WHERE h.integration_id = i.id ORDER BY h.checked_at DESC LIMIT 1
      ),
      'last_error', (
        SELECT h.safe_error_detail FROM public.integration_health_logs h
        WHERE h.integration_id = i.id AND h.safe_error_detail IS NOT NULL
        ORDER BY h.checked_at DESC LIMIT 1
      ),
      'last_error_at', (
        SELECT h.checked_at FROM public.integration_health_logs h
        WHERE h.integration_id = i.id AND h.safe_error_detail IS NOT NULL
        ORDER BY h.checked_at DESC LIMIT 1
      ),
      'checks_24h', (
        SELECT count(*) FROM public.integration_health_logs h
        WHERE h.integration_id = i.id AND h.checked_at >= now() - interval '24 hours'
      )
    ) AS x
    FROM public.integration_definitions d
    LEFT JOIN public.platform_integrations i ON i.provider_key = d.key
  ) t;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'integrations', v_services,
    'email_transport', jsonb_build_object(
      'mailboxes', (SELECT count(*) FROM public.email_mailboxes),
      'mailboxes_active', (SELECT count(*) FROM public.email_mailboxes WHERE is_active = true),
      'last_run_at', (SELECT max(created_at) FROM public.email_sync_runs),
      'last_success_at', (SELECT max(created_at) FROM public.email_sync_runs WHERE outcome = 'success'),
      'failed_runs_24h', (SELECT count(*) FROM public.email_sync_runs
                           WHERE outcome <> 'success' AND created_at >= now() - interval '24 hours'),
      'last_error', (SELECT error_message FROM public.email_sync_runs
                      WHERE error_message IS NOT NULL ORDER BY created_at DESC LIMIT 1),
      'outbox_queued', (SELECT count(*) FROM public.email_outbox WHERE status IN ('queued','scheduled')),
      'outbox_failed', (SELECT count(*) FROM public.email_outbox WHERE status = 'failed')
    ),
    'sms', jsonb_build_object(
      'sent_24h', (SELECT count(*) FROM public.sms_delivery_logs
                    WHERE created_at >= now() - interval '24 hours' AND outcome = 'sent'),
      'failed_24h', (SELECT count(*) FROM public.sms_delivery_logs
                      WHERE created_at >= now() - interval '24 hours' AND outcome <> 'sent'),
      'last_sent_at', (SELECT max(created_at) FROM public.sms_delivery_logs WHERE outcome = 'sent'),
      'last_error', (SELECT error_message FROM public.sms_delivery_logs
                      WHERE error_message IS NOT NULL ORDER BY created_at DESC LIMIT 1)
    ),
    'otp', jsonb_build_object(
      'issued_24h', (SELECT count(*) FROM public.otp_verifications
                      WHERE created_at >= now() - interval '24 hours'),
      'verified_24h', (SELECT count(*) FROM public.otp_verifications
                        WHERE consumed_at >= now() - interval '24 hours'),
      'pending', (SELECT count(*) FROM public.otp_verifications
                   WHERE consumed_at IS NULL AND expires_at > now())
    ),
    'payments', jsonb_build_object(
      'providers', (SELECT count(*) FROM public.platform_payment_provider_configs),
      'providers_active', (SELECT count(*) FROM public.platform_payment_provider_configs WHERE is_enabled = true),
      'attempts_24h', (SELECT count(*) FROM public.platform_payment_attempts
                        WHERE created_at >= now() - interval '24 hours'),
      'failed_24h', (SELECT count(*) FROM public.platform_payment_attempts
                      WHERE created_at >= now() - interval '24 hours' AND status = 'failed'),
      'webhooks_pending', (SELECT count(*) FROM public.platform_payment_webhooks WHERE processed_at IS NULL)
    ),
    'reliability', jsonb_build_object(
      'failures_24h', (SELECT count(*) FROM public.system_failures
                        WHERE created_at >= now() - interval '24 hours'),
      'failures_open', (SELECT count(*) FROM public.system_failures WHERE resolved_at IS NULL)
    )
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.admin_service_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_service_health() TO authenticated;

-- 2) تقارير كانت بلا صلاحية تنفيذ للمستخدم المصادق (تفشل حتى لمالك المنصة)
REVOKE ALL ON FUNCTION public.admin_revenue_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revenue_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_service_usage_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_service_usage_summary() TO authenticated;

REVOKE ALL ON FUNCTION public.admin_user_directory(text, text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_user_directory(text, text, text, integer, integer) TO authenticated;

REVOKE ALL ON FUNCTION public.admin_organization_directory(text, text, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_organization_directory(text, text, integer, integer) TO authenticated;