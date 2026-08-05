CREATE OR REPLACE FUNCTION public.admin_activity_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_today timestamptz := date_trunc('day', now() AT TIME ZONE 'Asia/Riyadh') AT TIME ZONE 'Asia/Riyadh';
BEGIN
  IF v_uid IS NULL OR NOT private.is_platform_staff(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'active_users', jsonb_build_object(
      'today', (SELECT count(DISTINCT user_id) FROM public.activity_logs
                 WHERE user_id IS NOT NULL AND created_at >= v_today),
      'week', (SELECT count(DISTINCT user_id) FROM public.activity_logs
                WHERE user_id IS NOT NULL AND created_at >= now() - interval '7 days'),
      'month', (SELECT count(DISTINCT user_id) FROM public.activity_logs
                 WHERE user_id IS NOT NULL AND created_at >= now() - interval '30 days'),
      'events_today', (SELECT count(*) FROM public.activity_logs WHERE created_at >= v_today)
    ),
    'active_organizations', jsonb_build_object(
      'today', (SELECT count(DISTINCT organization_id) FROM public.activity_logs WHERE created_at >= v_today),
      'month', (SELECT count(DISTINCT organization_id) FROM public.activity_logs
                 WHERE created_at >= now() - interval '30 days')
    ),
    'sessions', jsonb_build_object(
      'staff_online', (SELECT count(*) FROM public.platform_staff_sessions
                        WHERE revoked_at IS NULL AND last_seen_at >= now() - interval '30 minutes'),
      'staff_active_24h', (SELECT count(*) FROM public.platform_staff_sessions
                            WHERE revoked_at IS NULL AND last_seen_at >= now() - interval '24 hours'),
      'staff_devices', (SELECT count(DISTINCT device_fingerprint) FROM public.platform_staff_sessions
                         WHERE revoked_at IS NULL),
      'last_staff_seen_at', (SELECT max(last_seen_at) FROM public.platform_staff_sessions WHERE revoked_at IS NULL)
    ),
    'email', jsonb_build_object(
      'total', (SELECT count(*) FROM public.email_messages),
      'inbound', (SELECT count(*) FROM public.email_messages WHERE direction = 'inbound'),
      'outbound', (SELECT count(*) FROM public.email_messages WHERE direction = 'outbound'),
      'today', (SELECT count(*) FROM public.email_messages WHERE created_at >= v_today),
      'threads', (SELECT count(*) FROM public.email_threads),
      'mailboxes', (SELECT count(*) FROM public.email_mailboxes),
      'attachments', (SELECT count(*) FROM public.email_attachments),
      'last_sync_at', (SELECT max(created_at) FROM public.email_sync_runs WHERE outcome = 'success'),
      'last_sync_status', (SELECT outcome FROM public.email_sync_runs ORDER BY created_at DESC LIMIT 1)
    ),
    'tickets', jsonb_build_object(
      'total', (SELECT count(*) FROM public.support_tickets),
      'open', (SELECT count(*) FROM public.support_tickets
                WHERE status <> ALL (ARRAY['closed'::ticket_status, 'resolved'::ticket_status])),
      'today', (SELECT count(*) FROM public.support_tickets WHERE created_at >= v_today),
      'breached', (SELECT count(*) FROM public.support_sla_events WHERE event_type ILIKE '%breach%')
    ),
    'storage', jsonb_build_object(
      'documents_bytes', (SELECT coalesce(sum(file_size), 0) FROM public.documents),
      'attachments_bytes', (SELECT coalesce(sum(size_bytes), 0) FROM public.email_attachments),
      'documents_count', (SELECT count(*) FROM public.documents),
      'pages_indexed', (SELECT count(*) FROM public.document_pages)
    ),
    'database', jsonb_build_object(
      'size_bytes', pg_database_size(current_database()),
      'tables', (SELECT count(*) FROM pg_tables WHERE schemaname = 'public')
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_jobs_overview()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT private.is_platform_staff(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'queues', jsonb_build_array(
      jsonb_build_object(
        'key', 'email_outbox',
        'label', 'طابور البريد الصادر',
        'queued', (SELECT count(*) FROM public.email_outbox WHERE status = 'queued'),
        'scheduled', (SELECT count(*) FROM public.email_outbox WHERE status = 'scheduled'),
        'running', (SELECT count(*) FROM public.email_outbox WHERE status = 'sending'),
        'done', (SELECT count(*) FROM public.email_outbox WHERE status = 'sent'),
        'failed', (SELECT count(*) FROM public.email_outbox WHERE status = 'failed'),
        'dead', (SELECT count(*) FROM public.email_outbox WHERE status = 'failed' AND attempts >= max_attempts),
        'oldest_pending_at', (SELECT min(created_at) FROM public.email_outbox
                               WHERE status IN ('queued','scheduled','sending')),
        'next_attempt_at', (SELECT min(next_attempt_at) FROM public.email_outbox
                             WHERE status IN ('queued','scheduled'))
      ),
      jsonb_build_object(
        'key', 'document_processing',
        'label', 'معالجة المستندات و OCR',
        'queued', (SELECT count(*) FROM public.document_processing_jobs WHERE status = 'queued'),
        'scheduled', 0,
        'running', (SELECT count(*) FROM public.document_processing_jobs
                     WHERE status IN ('extracting','ocr_processing','indexing')),
        'done', (SELECT count(*) FROM public.document_processing_jobs WHERE status = 'completed'),
        'failed', (SELECT count(*) FROM public.document_processing_jobs WHERE status = 'failed'),
        'dead', (SELECT count(*) FROM public.document_processing_jobs WHERE status = 'failed' AND attempts >= 3),
        'oldest_pending_at', (SELECT min(created_at) FROM public.document_processing_jobs WHERE status = 'queued'),
        'next_attempt_at', NULL
      ),
      jsonb_build_object(
        'key', 'pii_reencryption',
        'label', 'إعادة تشفير البيانات الحساسة',
        'queued', (SELECT count(*) FROM public.pii_reencryption_jobs WHERE status = 'queued'),
        'scheduled', 0,
        'running', (SELECT count(*) FROM public.pii_reencryption_jobs WHERE status = 'running'),
        'done', (SELECT count(*) FROM public.pii_reencryption_jobs WHERE status = 'completed'),
        'failed', (SELECT count(*) FROM public.pii_reencryption_jobs WHERE status = 'failed'),
        'dead', 0,
        'oldest_pending_at', (SELECT min(created_at) FROM public.pii_reencryption_jobs WHERE status = 'queued'),
        'next_attempt_at', NULL
      )
    ),
    'sync_runs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'mailbox_id', r.mailbox_id, 'status', r.outcome,
        'started_at', r.created_at,
        'finished_at', CASE WHEN r.duration_ms IS NULL THEN r.created_at
                            ELSE r.created_at + make_interval(secs => r.duration_ms / 1000.0) END,
        'error_message', r.error_message
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.email_sync_runs ORDER BY created_at DESC LIMIT 20) r
    ),
    'failed_jobs', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'queue', 'email_outbox', 'id', o.id, 'attempts', o.attempts,
        'max_attempts', o.max_attempts, 'last_error', o.last_error,
        'last_error_code', o.last_error_code, 'failure_ref', o.failure_ref,
        'created_at', o.created_at
      ) ORDER BY o.updated_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.email_outbox WHERE status = 'failed'
            ORDER BY updated_at DESC LIMIT 25) o
    ),
    'cron', jsonb_build_object(
      'email_sync_last_at', (SELECT max(created_at) FROM public.email_sync_runs),
      'watermark_cleanup_last_at', (SELECT max(created_at) FROM public.document_access_tokens
                                     WHERE revoked_at IS NOT NULL),
      'sla_last_event_at', (SELECT max(created_at) FROM public.support_sla_events),
      'csat_last_invitation_at', (SELECT max(created_at) FROM public.support_csat_invitations)
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.admin_service_health()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
    LEFT JOIN public.platform_integrations i ON i.integration_key = d.key
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
      'providers_active', (SELECT count(*) FROM public.platform_payment_provider_configs WHERE is_active = true),
      'attempts_24h', (SELECT count(*) FROM public.platform_payment_attempts
                        WHERE created_at >= now() - interval '24 hours'),
      'failed_24h', (SELECT count(*) FROM public.platform_payment_attempts
                      WHERE created_at >= now() - interval '24 hours' AND status = 'failed'),
      'webhooks_pending', (SELECT count(*) FROM public.platform_payment_webhooks WHERE processed_at IS NULL)
    ),
    'reliability', jsonb_build_object(
      'failures_24h', (SELECT count(*) FROM public.system_failures
                        WHERE created_at >= now() - interval '24 hours'),
      'failures_open', (SELECT count(*) FROM public.system_failures
                         WHERE created_at >= now() - interval '7 days'),
      'last_failure_at', (SELECT max(created_at) FROM public.system_failures),
      'last_failure_ref', (SELECT ref FROM public.system_failures ORDER BY created_at DESC LIMIT 1)
    ),
    'database', jsonb_build_object(
      'size_bytes', pg_database_size(current_database()),
      'connections', (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()),
      'tables_public', (SELECT count(*) FROM pg_tables WHERE schemaname = 'public'),
      'rls_disabled', (SELECT count(*) FROM pg_tables t JOIN pg_class c ON c.relname = t.tablename
                        WHERE t.schemaname = 'public' AND NOT c.relrowsecurity)
    )
  );
END;
$function$;