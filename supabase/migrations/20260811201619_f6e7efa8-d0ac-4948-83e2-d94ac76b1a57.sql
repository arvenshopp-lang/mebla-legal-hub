-- 1) إزالة القراءة/الكتابة المباشرة لملفات المستندات من المستخدمين المسجّلين.
--    القراءة القانونية تمر عبر مسار العرض الآمن (service role + تذكرة مائية).
DROP POLICY IF EXISTS docs_storage_select ON storage.objects;
DROP POLICY IF EXISTS docs_storage_insert ON storage.objects;
DROP POLICY IF EXISTS docs_storage_update ON storage.objects;
-- سياسة الحذف تبقى كما هي (owner/admin) حتى لا ينكسر حذف المستند.

-- 3) تشديد دوال الحصص: دور «قارئ فقط» لا يستهلك حصة المكتب.
CREATE OR REPLACE FUNCTION public.consume_ocr_pages(_organization_id uuid, _pages integer)
 RETURNS TABLE(allowed boolean, used integer, monthly_limit integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_period date := date_trunc('month', now())::date;
  v_limit integer;
  v_used integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_organization_role(
       _organization_id, auth.uid(),
       ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]
     ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.ocr_pages_monthly INTO v_limit
  FROM private.org_effective_plan(_organization_id) p;

  SELECT coalesce(uc.used, 0) INTO v_used
  FROM public.usage_counters uc
  WHERE uc.organization_id = _organization_id
    AND uc.metric = 'ocr_pages'
    AND uc.period_start = v_period;

  v_used := coalesce(v_used, 0);

  IF v_limit IS NOT NULL AND v_used + greatest(_pages, 0) > v_limit THEN
    RETURN QUERY SELECT false, v_used, v_limit;
    RETURN;
  END IF;

  INSERT INTO public.usage_counters (organization_id, metric, period_start, used)
  VALUES (_organization_id, 'ocr_pages', v_period, greatest(_pages, 0))
  ON CONFLICT (organization_id, metric, period_start)
  DO UPDATE SET used = public.usage_counters.used + greatest(_pages, 0), updated_at = now()
  RETURNING public.usage_counters.used INTO v_used;

  RETURN QUERY SELECT true, v_used, v_limit;
END;
$function$;

CREATE OR REPLACE FUNCTION public.record_metered_usage(_organization_id uuid, _metric text, _amount integer)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_period date := date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_limit integer;
  v_used integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.has_organization_role(
       _organization_id, auth.uid(),
       ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]
     ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;
  IF _metric <> 'ocr_pages' THEN
    RAISE EXCEPTION 'UNKNOWN_METRIC' USING ERRCODE = 'P0001';
  END IF;

  IF private.org_subscription_state(_organization_id) NOT IN ('active', 'trial') THEN
    RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT ocr_pages_monthly INTO v_limit FROM private.org_effective_plan(_organization_id);

  SELECT coalesce(uc.used, 0) INTO v_used
  FROM public.usage_counters uc
  WHERE uc.organization_id = _organization_id
    AND uc.metric = _metric
    AND uc.period_start = v_period;

  v_used := coalesce(v_used, 0);

  IF v_limit IS NOT NULL AND v_used + _amount > v_limit THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.usage_counters (organization_id, metric, period_start, used)
  VALUES (_organization_id, _metric, v_period, _amount)
  ON CONFLICT (organization_id, metric, period_start)
  DO UPDATE SET used = public.usage_counters.used + _amount, updated_at = now()
  RETURNING public.usage_counters.used INTO v_used;

  RETURN v_used;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_ocr_pages(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_metered_usage(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ocr_pages(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_metered_usage(uuid, text, integer) TO authenticated, service_role;