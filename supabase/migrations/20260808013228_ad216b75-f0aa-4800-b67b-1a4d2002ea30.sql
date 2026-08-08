CREATE OR REPLACE FUNCTION public.admin_growth_series(_days integer DEFAULT 30)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
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
      SELECT coalesce(jsonb_agg(jsonb_build_object('metric', m.metric, 'total', m.total)
                                ORDER BY m.total DESC), '[]'::jsonb)
      FROM (
        SELECT u.metric AS metric, sum(u.used) AS total
        FROM public.usage_counters u
        GROUP BY u.metric
      ) m
    )
  );
END;
$function$;