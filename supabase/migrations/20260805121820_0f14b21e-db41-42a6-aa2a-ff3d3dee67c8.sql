-- ============================================================
-- Owner Console: content pages + real-data reporting functions
-- ============================================================

CREATE TABLE IF NOT EXISTS public.platform_content_pages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'page',
  title text NOT NULL,
  description text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  published_by uuid,
  updated_by uuid,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_content_pages_kind_check
    CHECK (kind = ANY (ARRAY['page','legal','faq','banner','pricing','contact','home'])),
  CONSTRAINT platform_content_pages_slug_check
    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

GRANT SELECT ON public.platform_content_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_content_pages TO authenticated;
GRANT ALL ON public.platform_content_pages TO service_role;

ALTER TABLE public.platform_content_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "content_pages_public_read_published"
  ON public.platform_content_pages FOR SELECT TO anon, authenticated
  USING (is_published = true);

CREATE POLICY "content_pages_staff_read_all"
  ON public.platform_content_pages FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE POLICY "content_pages_staff_insert"
  ON public.platform_content_pages FOR INSERT TO authenticated
  WITH CHECK (private.has_platform_permission(auth.uid(), 'settings.manage'));

CREATE POLICY "content_pages_staff_update"
  ON public.platform_content_pages FOR UPDATE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'settings.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'settings.manage'));

CREATE POLICY "content_pages_staff_delete"
  ON public.platform_content_pages FOR DELETE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'settings.manage'));

CREATE INDEX IF NOT EXISTS platform_content_pages_kind_idx
  ON public.platform_content_pages (kind, is_published);

DROP TRIGGER IF EXISTS set_platform_content_pages_updated_at ON public.platform_content_pages;
CREATE TRIGGER set_platform_content_pages_updated_at
  BEFORE UPDATE ON public.platform_content_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 1) Activity overview: DAU / WAU / MAU + email + sync freshness
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_activity_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
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
    'email', jsonb_build_object(
      'total', (SELECT count(*) FROM public.email_messages),
      'inbound', (SELECT count(*) FROM public.email_messages WHERE direction = 'inbound'),
      'outbound', (SELECT count(*) FROM public.email_messages WHERE direction = 'outbound'),
      'today', (SELECT count(*) FROM public.email_messages WHERE created_at >= v_today),
      'threads', (SELECT count(*) FROM public.email_threads),
      'mailboxes', (SELECT count(*) FROM public.email_mailboxes),
      'attachments', (SELECT count(*) FROM public.email_attachments),
      'last_sync_at', (SELECT max(finished_at) FROM public.email_sync_runs WHERE status = 'success'),
      'last_sync_status', (SELECT status FROM public.email_sync_runs ORDER BY started_at DESC LIMIT 1)
    ),
    'tickets', jsonb_build_object(
      'total', (SELECT count(*) FROM public.support_tickets),
      'open', (SELECT count(*) FROM public.support_tickets
                WHERE status <> ALL (ARRAY['closed'::ticket_status, 'resolved'::ticket_status])),
      'today', (SELECT count(*) FROM public.support_tickets WHERE created_at >= v_today),
      'breached', (SELECT count(*) FROM public.support_sla_events WHERE breached_at IS NOT NULL)
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
$$;

REVOKE ALL ON FUNCTION public.admin_activity_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_activity_overview() TO authenticated, service_role;

-- ============================================================
-- 2) Service health: per-service state from real logs
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_service_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_services jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL OR NOT private.is_platform_staff(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  -- integrations registered in the integrations center
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
        WHERE h.integration_id = i.id ORDER BY h.created_at DESC LIMIT 1
      ),
      'last_error', (
        SELECT h.error_message FROM public.integration_health_logs h
        WHERE h.integration_id = i.id AND h.error_message IS NOT NULL
        ORDER BY h.created_at DESC LIMIT 1
      ),
      'last_error_at', (
        SELECT h.created_at FROM public.integration_health_logs h
        WHERE h.integration_id = i.id AND h.error_message IS NOT NULL
        ORDER BY h.created_at DESC LIMIT 1
      ),
      'checks_24h', (
        SELECT count(*) FROM public.integration_health_logs h
        WHERE h.integration_id = i.id AND h.created_at >= now() - interval '24 hours'
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
      'last_run_at', (SELECT max(started_at) FROM public.email_sync_runs),
      'last_success_at', (SELECT max(finished_at) FROM public.email_sync_runs WHERE status = 'success'),
      'failed_runs_24h', (SELECT count(*) FROM public.email_sync_runs
                           WHERE status = 'failed' AND started_at >= now() - interval '24 hours'),
      'last_error', (SELECT error_message FROM public.email_sync_runs
                      WHERE error_message IS NOT NULL ORDER BY started_at DESC LIMIT 1),
      'outbox_queued', (SELECT count(*) FROM public.email_outbox WHERE status IN ('queued','scheduled')),
      'outbox_failed', (SELECT count(*) FROM public.email_outbox WHERE status = 'failed')
    ),
    'sms', jsonb_build_object(
      'sent_24h', (SELECT count(*) FROM public.sms_delivery_logs
                    WHERE created_at >= now() - interval '24 hours' AND status = 'sent'),
      'failed_24h', (SELECT count(*) FROM public.sms_delivery_logs
                      WHERE created_at >= now() - interval '24 hours' AND status = 'failed'),
      'last_sent_at', (SELECT max(created_at) FROM public.sms_delivery_logs WHERE status = 'sent'),
      'last_error', (SELECT error_message FROM public.sms_delivery_logs
                      WHERE error_message IS NOT NULL ORDER BY created_at DESC LIMIT 1)
    ),
    'otp', jsonb_build_object(
      'issued_24h', (SELECT count(*) FROM public.otp_verifications
                      WHERE created_at >= now() - interval '24 hours'),
      'verified_24h', (SELECT count(*) FROM public.otp_verifications
                        WHERE verified_at >= now() - interval '24 hours'),
      'pending', (SELECT count(*) FROM public.otp_verifications
                   WHERE verified_at IS NULL AND expires_at > now())
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
      'failures_open', (SELECT count(*) FROM public.system_failures WHERE resolved_at IS NULL),
      'last_failure_at', (SELECT max(created_at) FROM public.system_failures),
      'last_failure_ref', (SELECT reference FROM public.system_failures ORDER BY created_at DESC LIMIT 1)
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
$$;

REVOKE ALL ON FUNCTION public.admin_service_health() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_service_health() TO authenticated, service_role;

-- ============================================================
-- 3) Background jobs / queues overview
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_jobs_overview()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
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
        'id', r.id, 'mailbox_id', r.mailbox_id, 'status', r.status,
        'started_at', r.started_at, 'finished_at', r.finished_at,
        'error_message', r.error_message
      ) ORDER BY r.started_at DESC), '[]'::jsonb)
      FROM (SELECT * FROM public.email_sync_runs ORDER BY started_at DESC LIMIT 20) r
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
      'email_sync_last_at', (SELECT max(started_at) FROM public.email_sync_runs),
      'watermark_cleanup_last_at', (SELECT max(created_at) FROM public.document_access_tokens
                                     WHERE revoked_at IS NOT NULL),
      'sla_last_event_at', (SELECT max(created_at) FROM public.support_sla_events),
      'csat_last_invitation_at', (SELECT max(created_at) FROM public.support_csat_invitations)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_jobs_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_jobs_overview() TO authenticated, service_role;

-- ============================================================
-- 4) Growth series for analytics dashboards
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_growth_series(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_days integer := least(greatest(coalesce(_days, 30), 7), 365);
  v_revenue boolean;
BEGIN
  IF v_uid IS NULL OR NOT private.is_platform_staff(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  v_revenue := private.has_platform_permission(v_uid, 'revenue.read');

  RETURN jsonb_build_object(
    'generated_at', now(),
    'days', v_days,
    'series', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day,
        'organizations', (SELECT count(*) FROM public.organizations o
                           WHERE o.created_at >= d.day AND o.created_at < d.day + interval '1 day'),
        'users', (SELECT count(*) FROM public.profiles p
                   WHERE p.created_at >= d.day AND p.created_at < d.day + interval '1 day'),
        'cases', (SELECT count(*) FROM public.cases c
                   WHERE c.created_at >= d.day AND c.created_at < d.day + interval '1 day'),
        'documents', (SELECT count(*) FROM public.documents dc
                       WHERE dc.created_at >= d.day AND dc.created_at < d.day + interval '1 day'),
        'emails', (SELECT count(*) FROM public.email_messages em
                    WHERE em.created_at >= d.day AND em.created_at < d.day + interval '1 day'),
        'tickets', (SELECT count(*) FROM public.support_tickets t
                     WHERE t.created_at >= d.day AND t.created_at < d.day + interval '1 day'),
        'active_users', (SELECT count(DISTINCT a.user_id) FROM public.activity_logs a
                          WHERE a.user_id IS NOT NULL
                            AND a.created_at >= d.day AND a.created_at < d.day + interval '1 day'),
        'revenue', CASE WHEN v_revenue THEN
          (SELECT coalesce(sum(pm.amount), 0) FROM public.platform_payments pm
            WHERE pm.status = 'paid' AND pm.paid_at >= d.day AND pm.paid_at < d.day + interval '1 day')
          ELSE NULL END
      ) ORDER BY d.day), '[]'::jsonb)
      FROM generate_series(
        date_trunc('day', now()) - ((v_days - 1) || ' days')::interval,
        date_trunc('day', now()),
        interval '1 day'
      ) AS d(day)
    ),
    'top_organizations', (
      SELECT coalesce(jsonb_agg(x ORDER BY (x->>'events')::bigint DESC), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'organization_id', o.id,
          'name', o.name,
          'events', count(a.id),
          'cases', (SELECT count(*) FROM public.cases c WHERE c.organization_id = o.id),
          'documents', (SELECT count(*) FROM public.documents dc WHERE dc.organization_id = o.id),
          'storage_bytes', (SELECT coalesce(sum(dc.file_size), 0) FROM public.documents dc
                             WHERE dc.organization_id = o.id),
          'users', (SELECT count(*) FROM public.organization_members m WHERE m.organization_id = o.id)
        ) AS x
        FROM public.organizations o
        LEFT JOIN public.activity_logs a
          ON a.organization_id = o.id AND a.created_at >= now() - (v_days || ' days')::interval
        GROUP BY o.id, o.name
        ORDER BY count(a.id) DESC
        LIMIT 10
      ) t
    ),
    'ai_usage', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'metric', u.metric, 'total', sum(u.used)
      )), '[]'::jsonb)
      FROM public.usage_counters u
      GROUP BY u.metric
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_growth_series(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_growth_series(integer) TO authenticated, service_role;