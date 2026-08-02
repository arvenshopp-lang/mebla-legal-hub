-- 1) حالات مستقلة: توثيق الجوال منفصل تماماً عن التحقق بخطوتين
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verification_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_status text NOT NULL DEFAULT 'disabled';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_verification_status_chk
  CHECK (phone_verification_status IN ('not_required','pending','verified','failed','disabled'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_mfa_status_chk
  CHECK (mfa_status IN ('disabled','sms_enabled','totp_enabled','both_enabled'));

-- 2) إعدادات الرسائل والتحقق (صف واحد)
CREATE TABLE public.sms_settings (
  id boolean PRIMARY KEY DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  active_provider text NOT NULL DEFAULT 'infobip',
  provider_label text,
  base_url text,
  application_id text,
  service_sid text,
  sender_id text,
  sender_name text,
  default_country text NOT NULL DEFAULT 'SA',
  default_dial_code text NOT NULL DEFAULT '+966',
  code_length smallint NOT NULL DEFAULT 6,
  code_ttl_minutes smallint NOT NULL DEFAULT 5,
  resend_wait_seconds smallint NOT NULL DEFAULT 60,
  max_verify_attempts smallint NOT NULL DEFAULT 5,
  rate_limit_per_hour smallint NOT NULL DEFAULT 5,
  message_template text NOT NULL DEFAULT 'رمز التحقق في مِهلة: {{code}} — صالح {{minutes}} دقائق. لا تشاركه مع أحد.',
  message_language text NOT NULL DEFAULT 'ar',
  test_mode boolean NOT NULL DEFAULT true,
  signup_mode text NOT NULL DEFAULT 'disabled',
  show_phone_field boolean NOT NULL DEFAULT true,
  require_phone boolean NOT NULL DEFAULT false,
  hide_phone_when_disabled boolean NOT NULL DEFAULT true,
  allow_signup_during_outage boolean NOT NULL DEFAULT true,
  show_outage_notice boolean NOT NULL DEFAULT false,
  emergency_email_only boolean NOT NULL DEFAULT false,
  alert_admin_on_failure boolean NOT NULL DEFAULT true,
  api_key_hint text,
  api_secret_hint text,
  health_status text NOT NULL DEFAULT 'disabled',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_reason text,
  last_trace_ref text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_settings_singleton CHECK (id),
  CONSTRAINT sms_settings_provider_chk CHECK (active_provider IN ('infobip','twilio','unifonic','custom')),
  CONSTRAINT sms_settings_mode_chk CHECK (signup_mode IN ('disabled','optional','required_unverified_allowed','required_verified','outage_bypass')),
  CONSTRAINT sms_settings_health_chk CHECK (health_status IN ('operational','degraded','unavailable','disabled')),
  CONSTRAINT sms_settings_code_len_chk CHECK (code_length BETWEEN 4 AND 8),
  CONSTRAINT sms_settings_ttl_chk CHECK (code_ttl_minutes BETWEEN 1 AND 30)
);

GRANT SELECT ON public.sms_settings TO authenticated;
GRANT ALL ON public.sms_settings TO service_role;
ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform settings managers read sms settings"
ON public.sms_settings FOR SELECT TO authenticated
USING (private.has_platform_permission(auth.uid(), 'settings.manage'));

CREATE TRIGGER sms_settings_set_updated_at
BEFORE UPDATE ON public.sms_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.sms_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 3) رموز التحقق: بصمة مشفّرة فقط، تُدار من الخادم حصراً
CREATE TABLE public.otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  user_id uuid,
  email text,
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  provider text,
  provider_reference text,
  delivery_status text NOT NULL DEFAULT 'queued',
  ip text,
  device text,
  user_agent text,
  trace_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_purpose_chk CHECK (purpose IN ('signup','phone_verification','login_mfa','phone_change')),
  CONSTRAINT otp_delivery_chk CHECK (delivery_status IN ('queued','sent','delivered','failed','test'))
);

CREATE INDEX otp_verifications_phone_idx ON public.otp_verifications (phone_e164, purpose, created_at DESC);
CREATE INDEX otp_verifications_active_idx ON public.otp_verifications (expires_at) WHERE consumed_at IS NULL;

GRANT ALL ON public.otp_verifications TO service_role;
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- 4) سجل إرسال الرسائل وصحة المزوّد
CREATE TABLE public.sms_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  purpose text NOT NULL,
  action text NOT NULL,
  phone_masked text NOT NULL,
  outcome text NOT NULL,
  error_code text,
  error_message text,
  latency_ms integer,
  reference_id text,
  trace_ref text,
  ip text,
  device text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_logs_action_chk CHECK (action IN ('send','resend','verify','test')),
  CONSTRAINT sms_logs_outcome_chk CHECK (outcome IN ('success','failure','rate_limited','invalid_code','expired'))
);

CREATE INDEX sms_delivery_logs_created_idx ON public.sms_delivery_logs (created_at DESC);

GRANT SELECT ON public.sms_delivery_logs TO authenticated;
GRANT ALL ON public.sms_delivery_logs TO service_role;
ALTER TABLE public.sms_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform settings managers read sms logs"
ON public.sms_delivery_logs FOR SELECT TO authenticated
USING (private.has_platform_permission(auth.uid(), 'settings.manage'));