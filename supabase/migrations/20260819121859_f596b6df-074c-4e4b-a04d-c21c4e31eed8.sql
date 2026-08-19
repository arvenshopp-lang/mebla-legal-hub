ALTER TABLE public.sms_settings DROP CONSTRAINT IF EXISTS sms_settings_provider_chk;
ALTER TABLE public.sms_settings ADD CONSTRAINT sms_settings_provider_chk
  CHECK (active_provider = ANY (ARRAY['infobip'::text, 'twilio'::text, 'unifonic'::text, 'mobilenet'::text, 'custom'::text]));

UPDATE public.sms_settings SET
  enabled = true,
  active_provider = 'mobilenet',
  provider_label = 'مدار التقنية (mobile.net.sa)',
  base_url = 'https://app.mobile.net.sa',
  sender_name = 'Mehlalex',
  sender_id = 'Mehlalex',
  application_id = NULL,
  signup_mode = 'required_verified',
  require_phone = true,
  show_phone_field = true,
  default_country = 'SA',
  default_dial_code = '+966',
  test_mode = false,
  code_length = 6,
  code_ttl_minutes = 5,
  resend_wait_seconds = 60,
  message_language = 'ar',
  message_template = 'رمز التحقق لمنصة مِهلة هو: {{code}} (صالح لمدة {{minutes}} دقائق). لا تشاركه مع أحد.',
  health_status = 'disabled',
  last_error_reason = NULL,
  updated_at = now()
WHERE id = true;

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(_name text, _city text DEFAULT NULL::text, _legal_name text DEFAULT NULL::text, _commercial_registration text DEFAULT NULL::text, _tax_number text DEFAULT NULL::text, _phone text DEFAULT NULL::text, _email text DEFAULT NULL::text, _address text DEFAULT NULL::text)
 RETURNS TABLE(organization_id uuid, already_exists boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := NULLIF(btrim(_name), '');
  v_existing_org uuid;
  v_new_org uuid;
  v_plan public.platform_plans;
  v_plan_code text;
  v_trial_days integer;
  v_status public.subscription_status;
  v_ends_at timestamptz;
  v_email text;
  v_requires_verified boolean;
  v_phone_status text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'ORG_NAME_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- سياسة المنصة: لا يكتمل إنشاء المكتب قبل توثيق رقم الجوال عندما يكون التوثيق إلزامياً.
  SELECT s.enabled AND s.signup_mode = 'required_verified'
    INTO v_requires_verified
  FROM public.sms_settings s
  WHERE s.id = true;

  IF COALESCE(v_requires_verified, false) THEN
    SELECT p.phone_verification_status INTO v_phone_status
    FROM public.profiles p
    WHERE p.id = v_user_id;

    IF COALESCE(v_phone_status, 'not_required') <> 'verified' THEN
      RAISE EXCEPTION 'PHONE_VERIFICATION_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT om.organization_id
    INTO v_existing_org
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = v_user_id
    AND om.status = 'active'
    AND o.is_active = true
  ORDER BY om.created_at ASC
  LIMIT 1;

  IF v_existing_org IS NOT NULL THEN
    organization_id := v_existing_org;
    already_exists := true;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.organizations (
    name, city, legal_name, commercial_registration, tax_number,
    phone, email, address, created_by
  ) VALUES (
    v_name,
    NULLIF(btrim(_city), ''),
    NULLIF(btrim(_legal_name), ''),
    NULLIF(btrim(_commercial_registration), ''),
    NULLIF(btrim(_tax_number), ''),
    NULLIF(btrim(_phone), ''),
    NULLIF(btrim(_email), ''),
    NULLIF(btrim(_address), ''),
    v_user_id
  )
  RETURNING id INTO v_new_org;

  INSERT INTO public.organization_members (organization_id, user_id, role, status)
  VALUES (v_new_org, v_user_id, 'owner', 'active');

  SELECT c.plan_code, c.trial_days INTO v_plan_code, v_trial_days
  FROM private.onboarding_plan_config() c;

  IF v_plan_code IS NOT NULL THEN
    SELECT * INTO v_plan FROM public.platform_plans p WHERE p.code = v_plan_code;
  END IF;

  IF v_plan.id IS NOT NULL THEN
    SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_user_id;
    v_email := COALESCE(NULLIF(btrim(_email), ''), v_email, '');

    IF v_trial_days > 0 THEN
      v_status := 'trial';
      v_ends_at := now() + make_interval(days => v_trial_days);
    ELSE
      v_status := 'active';
      v_ends_at := now() + interval '100 years';
    END IF;

    INSERT INTO public.subscriptions (
      user_id, email, organization_id, plan_id, plan_code, plan_label,
      amount, currency, starts_at, ends_at, status, activation_method,
      auto_renew, created_by
    ) VALUES (
      v_user_id, v_email, v_new_org, v_plan.id, v_plan.code, v_plan.name_ar,
      CASE WHEN v_trial_days > 0 THEN 0 ELSE v_plan.price_monthly END,
      v_plan.currency, now(), v_ends_at, v_status, 'onboarding',
      false, v_user_id
    );
  END IF;

  organization_id := v_new_org;
  already_exists := false;
  RETURN NEXT;
END;
$function$;