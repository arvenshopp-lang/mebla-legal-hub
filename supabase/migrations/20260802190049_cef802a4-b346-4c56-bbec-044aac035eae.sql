-- ============ 1) قوالب المزوّدين ============
CREATE TABLE public.integration_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  display_name_ar text NOT NULL,
  category text NOT NULL DEFAULT 'otp',
  category_label text NOT NULL DEFAULT 'خدمة التحقق عبر SMS',
  adapter_type text NOT NULL,
  logo_path text,
  website_url text,
  default_base_url text,
  supported_auth_types text[] NOT NULL DEFAULT '{}',
  required_fields text[] NOT NULL DEFAULT '{}',
  optional_fields text[] NOT NULL DEFAULT '{}',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_hint text,
  is_builtin boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integration_definitions TO authenticated;
GRANT ALL ON public.integration_definitions TO service_role;
ALTER TABLE public.integration_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integration_definitions_staff_read" ON public.integration_definitions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps WHERE ps.user_id = auth.uid() AND ps.status = 'active'));

CREATE TRIGGER integration_definitions_updated_at
  BEFORE UPDATE ON public.integration_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 2) التكاملات المهيأة ============
CREATE TABLE public.platform_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  definition_id uuid NOT NULL REFERENCES public.integration_definitions(id) ON DELETE RESTRICT,
  provider_key text NOT NULL,
  internal_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  website_url text,
  logo_path text,
  logo_source text NOT NULL DEFAULT 'builtin',
  environment text NOT NULL DEFAULT 'sandbox',
  base_url text NOT NULL,
  auth_type text NOT NULL,
  secret_reference text NOT NULL,
  configuration_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_check_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapping_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeout_ms integer NOT NULL DEFAULT 10000,
  max_retries integer NOT NULL DEFAULT 1,
  monitor_interval_minutes integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'not_configured',
  is_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  consecutive_failures integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_checked_at timestamptz,
  latency_ms integer,
  last_error_code text,
  last_error_detail text,
  last_trace_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_integrations_environment_check CHECK (environment IN ('sandbox','production')),
  CONSTRAINT platform_integrations_status_check CHECK (status IN ('not_configured','verifying','connected','degraded','unavailable','failed','disabled')),
  CONSTRAINT platform_integrations_timeout_check CHECK (timeout_ms BETWEEN 1000 AND 30000),
  CONSTRAINT platform_integrations_retries_check CHECK (max_retries BETWEEN 0 AND 5)
);

CREATE INDEX platform_integrations_active_idx ON public.platform_integrations (provider_key, is_active) WHERE is_active;
CREATE UNIQUE INDEX platform_integrations_single_active_otp_idx
  ON public.platform_integrations ((configuration_json->>'category'))
  WHERE is_active;

GRANT SELECT ON public.platform_integrations TO authenticated;
GRANT ALL ON public.platform_integrations TO service_role;
ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_integrations_staff_read" ON public.platform_integrations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps WHERE ps.user_id = auth.uid() AND ps.status = 'active'));

CREATE TRIGGER platform_integrations_updated_at
  BEFORE UPDATE ON public.platform_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 3) خزنة الأسرار ============
CREATE TABLE public.integration_secrets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  secret_reference text NOT NULL,
  field_key text NOT NULL,
  ciphertext text NOT NULL,
  key_version smallint NOT NULL DEFAULT 1,
  masked_hint text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_secrets_status_check CHECK (status IN ('active','revoked')),
  CONSTRAINT integration_secrets_unique UNIQUE (secret_reference, field_key)
);

GRANT ALL ON public.integration_secrets TO service_role;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;
-- لا سياسة SELECT: المتصفح لا يستطيع قراءة أي سر إطلاقاً.

CREATE TRIGGER integration_secrets_updated_at
  BEFORE UPDATE ON public.integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 4) سجل الفحوصات ============
CREATE TABLE public.integration_health_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid REFERENCES public.platform_integrations(id) ON DELETE SET NULL,
  provider_key text NOT NULL,
  internal_name text,
  result text NOT NULL,
  check_kind text NOT NULL DEFAULT 'manual',
  status_code integer,
  latency_ms integer,
  safe_error_code text,
  safe_error_detail text,
  trace_id text NOT NULL,
  actor_id uuid,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_health_logs_result_check CHECK (result IN ('success','failure','blocked','skipped'))
);

CREATE INDEX integration_health_logs_integration_idx
  ON public.integration_health_logs (integration_id, checked_at DESC);

GRANT SELECT ON public.integration_health_logs TO authenticated;
GRANT ALL ON public.integration_health_logs TO service_role;
ALTER TABLE public.integration_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integration_health_logs_staff_read" ON public.integration_health_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps WHERE ps.user_id = auth.uid() AND ps.status = 'active'));

-- ============ 5) قوالب المزوّدين الجاهزة ============
INSERT INTO public.integration_definitions
  (provider_key, display_name, display_name_ar, category, category_label, adapter_type, logo_path, website_url,
   default_base_url, supported_auth_types, required_fields, optional_fields, capabilities, health_hint, is_builtin, sort_order)
VALUES
  ('infobip', 'Infobip', 'إنفوبيب', 'otp', 'خدمة التحقق عبر SMS', 'infobip', 'infobip', 'https://www.infobip.com',
   'https://api.infobip.com', ARRAY['api_key_header'], ARRAY['api_key'], ARRAY['sender_id','base_url'],
   '{"send_otp":true,"verify_otp":true,"delivery_status":true,"health_check":true}'::jsonb,
   'GET /account/1/balance — يتحقق من صحة المفتاح ورصيد الحساب.', true, 10),
  ('twilio', 'Twilio Verify', 'تويليو', 'otp', 'خدمة التحقق عبر SMS', 'twilio', 'twilio', 'https://www.twilio.com',
   'https://api.twilio.com', ARRAY['basic_auth'], ARRAY['account_sid','api_secret'], ARRAY['service_sid','sender_id','base_url'],
   '{"send_otp":true,"verify_otp":true,"delivery_status":true,"health_check":true}'::jsonb,
   'GET /2010-04-01/Accounts/{AccountSid}.json — يتحقق من المعرّف والمفتاح وحالة الحساب.', true, 20),
  ('unifonic', 'Unifonic', 'يونيفونك', 'otp', 'خدمة التحقق عبر SMS', 'unifonic', 'unifonic', 'https://www.unifonic.com',
   'https://el.cloud.unifonic.com', ARRAY['query_api_key'], ARRAY['application_id'], ARRAY['sender_id','base_url'],
   '{"send_otp":true,"verify_otp":true,"delivery_status":true,"health_check":true}'::jsonb,
   'GET /rest/Account/GetAppDefaultSenderID — يتحقق من AppSid والمُرسل المعتمد.', true, 30),
  ('custom_rest', 'Custom REST API', 'مزوّد REST مخصص', 'otp', 'خدمة تحقق مخصصة', 'custom_rest', NULL, NULL,
   NULL, ARRAY['api_key_header','bearer_token','basic_auth','oauth2_client_credentials','query_api_key','custom_headers'],
   ARRAY[]::text[], ARRAY['api_key','api_secret','access_token','client_id','client_secret','username','password','sender_id'],
   '{"send_otp":true,"verify_otp":true,"delivery_status":true,"health_check":true,"configurable":true}'::jsonb,
   'يحدده المالك بالكامل: الطريقة والمسار وشروط النجاح.', true, 90);