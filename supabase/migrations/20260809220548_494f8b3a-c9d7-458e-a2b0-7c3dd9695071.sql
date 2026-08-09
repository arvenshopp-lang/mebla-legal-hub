CREATE OR REPLACE FUNCTION public.my_subscription_overview(_organization_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_sub public.subscriptions;
  v_plan public.platform_plans;
  v_state text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_organization_member(_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_sub FROM private.org_subscription(_organization_id);
  SELECT * INTO v_plan FROM private.org_effective_plan(_organization_id);
  v_state := private.org_subscription_state(_organization_id);

  RETURN jsonb_build_object(
    'state', v_state,
    'now', now(),
    'subscription', CASE WHEN v_sub.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_sub.id,
        'plan_code', v_sub.plan_code,
        'plan_label', v_sub.plan_label,
        'status', v_sub.status,
        'amount', v_sub.amount,
        'currency', v_sub.currency,
        'starts_at', v_sub.starts_at,
        'ends_at', v_sub.ends_at,
        'auto_renew', v_sub.auto_renew,
        'suspended_at', v_sub.suspended_at,
        'suspension_reason', v_sub.suspension_reason,
        'cancelled_at', v_sub.cancelled_at,
        'days_remaining', floor(extract(epoch FROM (v_sub.ends_at - now())) / 86400)::int
      ) END,
    'plan', jsonb_build_object(
        'code', v_plan.code,
        'name_ar', v_plan.name_ar,
        'description', v_plan.description,
        'price_monthly', v_plan.price_monthly,
        'price_yearly', v_plan.price_yearly,
        'currency', v_plan.currency,
        'max_users', v_plan.max_users,
        'max_cases', v_plan.max_cases,
        'max_clients', v_plan.max_clients,
        'max_documents', v_plan.max_documents,
        'storage_gb', v_plan.storage_gb,
        'ocr_pages_monthly', v_plan.ocr_pages_monthly,
        'ai_enabled', v_plan.ai_enabled,
        'esignature_enabled', v_plan.esignature_enabled,
        'voice_enabled', v_plan.voice_enabled,
        'api_enabled', v_plan.api_enabled,
        'pdf_search_enabled', v_plan.pdf_search_enabled,
        'client_upload_enabled', v_plan.client_upload_enabled,
        'public_office_page', v_plan.public_office_page,
        'support_level', v_plan.support_level,
        'sla_hours', v_plan.sla_hours,
        'features', v_plan.features
      ),
    'usage', private.org_usage(_organization_id),
    'history', (SELECT coalesce(jsonb_agg(h ORDER BY h->>'starts_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', s.id, 'plan_label', s.plan_label, 'status', s.status,
          'starts_at', s.starts_at, 'ends_at', s.ends_at,
          'amount', s.amount, 'currency', s.currency,
          'suspended_at', s.suspended_at
        ) AS h
        FROM public.subscriptions s WHERE s.organization_id = _organization_id
      ) x),
    'invoices', (SELECT coalesce(jsonb_agg(i ORDER BY i->>'issued_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', v.id, 'number', v.number, 'amount', v.amount, 'currency', v.currency,
          'status', v.status, 'payment_method', v.payment_method,
          'paid_at', v.paid_at, 'issued_at', v.issued_at, 'pdf_path', v.pdf_path
        ) AS i
        FROM public.invoices v WHERE v.organization_id = _organization_id
      ) y),
    'upgrade_plans', (SELECT coalesce(jsonb_agg(p ORDER BY p->>'sort_order'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'code', pl.code, 'name_ar', pl.name_ar, 'price_monthly', pl.price_monthly,
          'sort_order', pl.sort_order, 'max_users', pl.max_users, 'max_cases', pl.max_cases,
          'esignature_enabled', pl.esignature_enabled, 'voice_enabled', pl.voice_enabled,
          'api_enabled', pl.api_enabled, 'ai_enabled', pl.ai_enabled,
          'public_office_page', pl.public_office_page
        ) AS p
        FROM public.platform_plans pl WHERE pl.is_active AND pl.is_public
      ) z)
  );
END;
$function$;