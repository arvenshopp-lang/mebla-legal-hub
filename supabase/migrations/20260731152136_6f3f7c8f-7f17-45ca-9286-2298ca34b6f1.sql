
CREATE OR REPLACE FUNCTION public.admin_user_directory(
  _search text DEFAULT NULL,
  _status text DEFAULT 'all',
  _sort text DEFAULT 'created_desc',
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, full_name text, email text, phone text, is_active boolean, created_at timestamptz,
  organization_id uuid, organization_name text, org_member_count bigint,
  plan_code text, plan_label text, subscription_status text, subscription_ends_at timestamptz,
  is_platform_staff boolean, total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT p.id, p.full_name, p.email, p.phone, p.is_active, p.created_at,
           om.organization_id,
           o.name AS organization_name,
           (SELECT count(*) FROM public.organization_members m
              WHERE m.organization_id = om.organization_id AND m.status = 'active') AS org_member_count,
           s.plan_code, s.plan_label, s.status::text AS subscription_status, s.ends_at AS subscription_ends_at,
           EXISTS (SELECT 1 FROM public.platform_staff ps WHERE ps.user_id = p.id) AS is_platform_staff
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT m.organization_id FROM public.organization_members m
      WHERE m.user_id = p.id AND m.status = 'active' ORDER BY m.created_at LIMIT 1
    ) om ON true
    LEFT JOIN public.organizations o ON o.id = om.organization_id
    LEFT JOIN LATERAL (
      SELECT sb.plan_code, sb.plan_label, sb.status, sb.ends_at FROM public.subscriptions sb
      WHERE sb.user_id = p.id ORDER BY (sb.status = 'active') DESC, sb.ends_at DESC LIMIT 1
    ) s ON true
  ), filtered AS (
    SELECT * FROM base b
    WHERE (_search IS NULL OR btrim(_search) = ''
           OR b.full_name ILIKE '%' || btrim(_search) || '%'
           OR coalesce(b.email,'') ILIKE '%' || btrim(_search) || '%'
           OR coalesce(b.organization_name,'') ILIKE '%' || btrim(_search) || '%')
      AND (_status = 'all'
           OR (_status = 'active' AND b.is_active)
           OR (_status = 'suspended' AND NOT b.is_active)
           OR (_status = 'no_org' AND b.organization_id IS NULL)
           OR (_status = 'subscribed' AND b.subscription_status = 'active')
           OR (_status = 'unsubscribed' AND coalesce(b.subscription_status,'none') <> 'active'))
  )
  SELECT f.*, (SELECT count(*) FROM filtered) AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN _sort = 'created_asc' THEN f.created_at END ASC NULLS LAST,
    CASE WHEN _sort = 'name_asc' THEN f.full_name END ASC NULLS LAST,
    CASE WHEN _sort = 'created_desc' THEN f.created_at END DESC NULLS LAST,
    f.created_at DESC
  LIMIT greatest(1, least(_limit, 100)) OFFSET greatest(0, _offset)
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_directory(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_directory(text, text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_organization_directory(
  _search text DEFAULT NULL,
  _status text DEFAULT 'all',
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, name text, legal_name text, city text, phone text, email text, address text,
  commercial_registration text, tax_number text,
  is_active boolean, suspended_at timestamptz, suspension_reason text, created_at timestamptz,
  users_count bigint, lawyers_count bigint, cases_count bigint, clients_count bigint,
  documents_count bigint, storage_bytes bigint,
  plan_code text, plan_label text, subscription_status text, subscription_ends_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT o.id, o.name, o.legal_name, o.city, o.phone, o.email, o.address,
           o.commercial_registration, o.tax_number,
           o.is_active, o.suspended_at, o.suspension_reason, o.created_at,
           (SELECT count(*) FROM public.organization_members m WHERE m.organization_id = o.id AND m.status = 'active') AS users_count,
           (SELECT count(*) FROM public.organization_members m WHERE m.organization_id = o.id AND m.status = 'active' AND m.role IN ('owner','admin','lawyer')) AS lawyers_count,
           (SELECT count(*) FROM public.cases c WHERE c.organization_id = o.id) AS cases_count,
           (SELECT count(*) FROM public.clients cl WHERE cl.organization_id = o.id) AS clients_count,
           (SELECT count(*) FROM public.documents d WHERE d.organization_id = o.id) AS documents_count,
           (SELECT coalesce(sum(d.file_size), 0) FROM public.documents d WHERE d.organization_id = o.id) AS storage_bytes,
           s.plan_code, s.plan_label, s.status::text AS subscription_status, s.ends_at AS subscription_ends_at
    FROM public.organizations o
    LEFT JOIN LATERAL (
      SELECT sb.plan_code, sb.plan_label, sb.status, sb.ends_at FROM public.subscriptions sb
      WHERE sb.organization_id = o.id ORDER BY (sb.status = 'active') DESC, sb.ends_at DESC LIMIT 1
    ) s ON true
  ), filtered AS (
    SELECT * FROM base b
    WHERE (_search IS NULL OR btrim(_search) = ''
           OR b.name ILIKE '%' || btrim(_search) || '%'
           OR coalesce(b.city,'') ILIKE '%' || btrim(_search) || '%'
           OR coalesce(b.email,'') ILIKE '%' || btrim(_search) || '%')
      AND (_status = 'all'
           OR (_status = 'active' AND b.is_active)
           OR (_status = 'suspended' AND NOT b.is_active)
           OR (_status = 'subscribed' AND b.subscription_status = 'active')
           OR (_status = 'unsubscribed' AND coalesce(b.subscription_status,'none') <> 'active'))
  )
  SELECT f.*, (SELECT count(*) FROM filtered) AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT greatest(1, least(_limit, 100)) OFFSET greatest(0, _offset)
$$;

REVOKE EXECUTE ON FUNCTION public.admin_organization_directory(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_organization_directory(text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_revenue_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH paid AS (
    SELECT * FROM public.subscriptions WHERE status <> 'cancelled'
  )
  SELECT jsonb_build_object(
    'today', (SELECT coalesce(sum(amount),0) FROM paid WHERE created_at >= date_trunc('day', now())),
    'week', (SELECT coalesce(sum(amount),0) FROM paid WHERE created_at >= date_trunc('week', now())),
    'month', (SELECT coalesce(sum(amount),0) FROM paid WHERE created_at >= date_trunc('month', now())),
    'year', (SELECT coalesce(sum(amount),0) FROM paid WHERE created_at >= date_trunc('year', now())),
    'total', (SELECT coalesce(sum(amount),0) FROM paid),
    'active_count', (SELECT count(*) FROM paid WHERE status = 'active' AND ends_at > now()),
    'by_plan', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT plan_label AS label, count(*) AS count, coalesce(sum(amount),0) AS amount
        FROM paid GROUP BY plan_label ORDER BY 3 DESC) x),
    'by_month', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               coalesce(sum(amount),0) AS amount, count(*) AS count
        FROM paid WHERE created_at >= (date_trunc('month', now()) - interval '11 months')
        GROUP BY 1 ORDER BY 1) x),
    'by_organization', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT coalesce(o.name, 'بدون مكتب') AS label, coalesce(sum(p.amount),0) AS amount, count(*) AS count
        FROM paid p LEFT JOIN public.organizations o ON o.id = p.organization_id
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.admin_revenue_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_summary() TO service_role;
