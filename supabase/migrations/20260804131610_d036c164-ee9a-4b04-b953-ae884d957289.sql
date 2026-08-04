CREATE OR REPLACE FUNCTION public.admin_platform_metrics(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_revenue boolean;
  v_mrr numeric := 0;
  v_active_orgs integer := 0;
  v_active_start integer := 0;
  v_lost integer := 0;
  v_trials integer := 0;
  v_converted integer := 0;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT private.is_platform_staff(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  v_revenue := private.has_platform_permission(v_uid, 'revenue.read');

  SELECT count(DISTINCT s.organization_id)
    INTO v_active_orgs
  FROM public.subscriptions s
  WHERE s.status = 'active' AND s.ends_at > now() AND s.organization_id IS NOT NULL;

  SELECT coalesce(sum(
           CASE
             WHEN s.starts_at IS NULL OR s.ends_at IS NULL THEN 0
             WHEN extract(epoch FROM (s.ends_at - s.starts_at)) <= 0 THEN 0
             ELSE s.amount * (2629800.0 / extract(epoch FROM (s.ends_at - s.starts_at)))
           END), 0)
    INTO v_mrr
  FROM public.subscriptions s
  WHERE s.status = 'active' AND s.ends_at > now();

  SELECT count(*) INTO v_active_start
  FROM public.subscriptions s
  WHERE s.starts_at < _from AND s.ends_at > _from AND s.status <> 'cancelled';

  SELECT count(*) INTO v_lost
  FROM public.subscriptions s
  WHERE (s.cancelled_at BETWEEN _from AND _to)
     OR (s.status = 'expired' AND s.ends_at BETWEEN _from AND _to);

  SELECT count(*) INTO v_trials
  FROM public.subscriptions s
  WHERE s.created_at BETWEEN _from AND _to AND s.status = 'trial';

  SELECT count(*) INTO v_converted
  FROM public.subscriptions s
  WHERE s.created_at BETWEEN _from AND _to
    AND s.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.subscriptions t
      WHERE t.organization_id = s.organization_id AND t.status = 'trial' AND t.created_at <= s.created_at
    );

  v_result := jsonb_build_object(
    'range', jsonb_build_object('from', _from, 'to', _to),
    'generated_at', now(),
    'organizations', jsonb_build_object(
      'total', (SELECT count(*) FROM public.organizations),
      'active', (SELECT count(*) FROM public.organizations WHERE is_active),
      'suspended', (SELECT count(*) FROM public.organizations WHERE NOT is_active),
      'trial', (SELECT count(DISTINCT organization_id) FROM public.subscriptions
                WHERE status = 'trial' AND ends_at > now() AND organization_id IS NOT NULL),
      'no_subscription', (SELECT count(*) FROM public.organizations o WHERE NOT EXISTS (
          SELECT 1 FROM public.subscriptions s WHERE s.organization_id = o.id AND s.status = 'active' AND s.ends_at > now())),
      'new_in_range', (SELECT count(*) FROM public.organizations WHERE created_at BETWEEN _from AND _to)
    ),
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM public.profiles),
      'active', (SELECT count(*) FROM public.profiles WHERE is_active),
      'suspended', (SELECT count(*) FROM public.profiles WHERE NOT is_active),
      'new_in_range', (SELECT count(*) FROM public.profiles WHERE created_at BETWEEN _from AND _to),
      'phone_verified', (SELECT count(*) FROM public.profiles WHERE phone_verification_status = 'verified'),
      'mfa_enabled', (SELECT count(*) FROM public.profiles WHERE coalesce(mfa_status, 'disabled') <> 'disabled'),
      'without_org', (SELECT count(*) FROM public.profiles p WHERE NOT EXISTS (
          SELECT 1 FROM public.organization_members m WHERE m.user_id = p.id AND m.status = 'active'))
    ),
    'subscriptions', jsonb_build_object(
      'total', (SELECT count(*) FROM public.subscriptions),
      'active', (SELECT count(*) FROM public.subscriptions WHERE status = 'active' AND ends_at > now()),
      'trial', (SELECT count(*) FROM public.subscriptions WHERE status = 'trial' AND ends_at > now()),
      'expiring_14d', (SELECT count(*) FROM public.subscriptions
                       WHERE status = 'active' AND ends_at > now() AND ends_at <= now() + interval '14 days'),
      'expired', (SELECT count(*) FROM public.subscriptions WHERE ends_at <= now() AND status <> 'cancelled'),
      'cancelled', (SELECT count(*) FROM public.subscriptions WHERE status = 'cancelled'),
      'suspended', (SELECT count(*) FROM public.subscriptions WHERE suspended_at IS NOT NULL),
      'auto_renew', (SELECT count(*) FROM public.subscriptions WHERE auto_renew AND status = 'active'),
      'new_in_range', (SELECT count(*) FROM public.subscriptions WHERE created_at BETWEEN _from AND _to)
    ),
    'usage', jsonb_build_object(
      'cases', (SELECT count(*) FROM public.cases),
      'cases_in_range', (SELECT count(*) FROM public.cases WHERE created_at BETWEEN _from AND _to),
      'clients', (SELECT count(*) FROM public.clients),
      'documents', (SELECT count(*) FROM public.documents),
      'documents_in_range', (SELECT count(*) FROM public.documents WHERE created_at BETWEEN _from AND _to),
      'storage_bytes', (SELECT coalesce(sum(file_size), 0) FROM public.documents),
      'ocr_pages_in_range', (SELECT coalesce(sum(used), 0) FROM public.usage_counters
                             WHERE metric = 'ocr_pages' AND period_start >= _from::date AND period_start <= _to::date),
      'hearings_in_range', (SELECT count(*) FROM public.hearings WHERE created_at BETWEEN _from AND _to)
    ),
    'messaging', jsonb_build_object(
      'sms_sent_in_range', (SELECT count(*) FROM public.sms_delivery_logs
                            WHERE created_at BETWEEN _from AND _to AND outcome = 'sent'),
      'sms_failed_in_range', (SELECT count(*) FROM public.sms_delivery_logs
                              WHERE created_at BETWEEN _from AND _to AND outcome <> 'sent'),
      'notifications_in_range', (SELECT count(*) FROM public.notifications WHERE created_at BETWEEN _from AND _to),
      'broadcasts_in_range', (SELECT count(*) FROM public.platform_broadcasts WHERE created_at BETWEEN _from AND _to)
    ),
    'support', jsonb_build_object(
      'open', (SELECT count(*) FROM public.support_tickets WHERE status <> 'closed'),
      'closed', (SELECT count(*) FROM public.support_tickets WHERE status = 'closed'),
      'new_in_range', (SELECT count(*) FROM public.support_tickets WHERE created_at BETWEEN _from AND _to),
      'unassigned', (SELECT count(*) FROM public.support_tickets WHERE assigned_to IS NULL AND status <> 'closed'),
      'avg_first_reply_hours', (SELECT coalesce(round(avg(extract(epoch FROM (last_reply_at - created_at)) / 3600)::numeric, 1), 0)
                                FROM public.support_tickets WHERE last_reply_at IS NOT NULL AND created_at BETWEEN _from AND _to)
    ),
    'reliability', jsonb_build_object(
      'failures_in_range', (SELECT count(*) FROM public.system_failures WHERE created_at BETWEEN _from AND _to),
      'failures_by_surface', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
          SELECT surface AS label, count(*) AS count FROM public.system_failures
          WHERE created_at BETWEEN _from AND _to GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x),
      'auth_failures_in_range', (SELECT count(*) FROM public.system_failures
                                 WHERE created_at BETWEEN _from AND _to AND surface = 'auth'),
      'audit_events_in_range', (SELECT count(*) FROM public.admin_audit_logs WHERE created_at BETWEEN _from AND _to)
    ),
    'revenue', CASE WHEN NOT v_revenue THEN NULL ELSE jsonb_build_object(
      'in_range', (SELECT coalesce(sum(amount), 0) FROM public.subscriptions
                   WHERE created_at BETWEEN _from AND _to AND status <> 'cancelled'),
      'today', (SELECT coalesce(sum(amount), 0) FROM public.subscriptions
                WHERE created_at >= date_trunc('day', now()) AND status <> 'cancelled'),
      'month', (SELECT coalesce(sum(amount), 0) FROM public.subscriptions
                WHERE created_at >= date_trunc('month', now()) AND status <> 'cancelled'),
      'year', (SELECT coalesce(sum(amount), 0) FROM public.subscriptions
               WHERE created_at >= date_trunc('year', now()) AND status <> 'cancelled'),
      'total', (SELECT coalesce(sum(amount), 0) FROM public.subscriptions WHERE status <> 'cancelled'),
      'mrr', round(v_mrr, 2),
      'arr', round(v_mrr * 12, 2),
      'arpu', CASE WHEN v_active_orgs = 0 THEN 0 ELSE round(v_mrr / v_active_orgs, 2) END,
      'paying_organizations', v_active_orgs,
      'churn_rate', CASE WHEN v_active_start = 0 THEN 0 ELSE round((v_lost::numeric / v_active_start) * 100, 2) END,
      'churned_in_range', v_lost,
      'trials_in_range', v_trials,
      'trial_conversion_rate', CASE WHEN (v_trials + v_converted) = 0 THEN 0
                                    ELSE round((v_converted::numeric / (v_trials + v_converted)) * 100, 2) END,
      'invoices', jsonb_build_object(
        'total', (SELECT count(*) FROM public.invoices),
        'in_range', (SELECT count(*) FROM public.invoices WHERE issued_at BETWEEN _from AND _to),
        'paid', (SELECT count(*) FROM public.invoices WHERE status = 'paid'),
        'pending', (SELECT count(*) FROM public.invoices WHERE status = 'pending'),
        'overdue', (SELECT count(*) FROM public.invoices WHERE status = 'pending' AND issued_at < now() - interval '30 days'),
        'paid_amount', (SELECT coalesce(sum(amount), 0) FROM public.invoices WHERE status = 'paid'),
        'outstanding_amount', (SELECT coalesce(sum(amount), 0) FROM public.invoices WHERE status <> 'paid')
      ),
      'by_plan', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
          SELECT plan_label AS label, count(*) AS count, coalesce(sum(amount), 0) AS amount
          FROM public.subscriptions WHERE status <> 'cancelled' GROUP BY 1 ORDER BY 3 DESC LIMIT 10) x),
      'by_month', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'month'), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('month', to_char(date_trunc('month', created_at), 'YYYY-MM'),
                                    'amount', coalesce(sum(amount), 0), 'count', count(*)) AS x
          FROM public.subscriptions
          WHERE status <> 'cancelled' AND created_at >= (date_trunc('month', now()) - interval '11 months')
          GROUP BY date_trunc('month', created_at)) y)
    ) END
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_platform_metrics(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_platform_metrics(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_metrics(timestamptz, timestamptz) TO service_role;