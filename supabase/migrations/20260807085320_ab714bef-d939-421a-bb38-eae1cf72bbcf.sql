-- ═══════════════════════════════════════════════════════════
-- محرك الإشعارات المركزي + تكامل WhatsApp Official WABA
-- إضافة فقط: لا حذف ولا إعادة تسمية ولا تعطيل RLS لأي كيان قائم.
-- ═══════════════════════════════════════════════════════════

-- 1) أحداث المنصة ──────────────────────────────────────────
CREATE TABLE public.notification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  actor_user_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_events_org_read" ON public.notification_events
  FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "notification_events_staff_read" ON public.notification_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps
    WHERE ps.user_id = auth.uid() AND ps.status = 'active'::platform_staff_status));
CREATE INDEX idx_notification_events_org_created
  ON public.notification_events (organization_id, created_at DESC);
CREATE INDEX idx_notification_events_unprocessed
  ON public.notification_events (created_at) WHERE processed_at IS NULL;
CREATE INDEX idx_notification_events_type ON public.notification_events (event_type);

-- 2) ربط القوالب (منصة أو مكتب) ─────────────────────────────
CREATE TABLE public.notification_template_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  provider text NOT NULL DEFAULT 'whatsline',
  internal_template_key text NOT NULL,
  provider_template_id text,
  provider_device_id text,
  body_variable_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  button_variable_mapping jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_template_mappings_channel_check
    CHECK (channel IN ('whatsapp', 'email', 'sms', 'push'))
);
CREATE UNIQUE INDEX notification_template_mappings_global_key
  ON public.notification_template_mappings (event_type, channel, provider)
  WHERE organization_id IS NULL;
CREATE UNIQUE INDEX notification_template_mappings_org_key
  ON public.notification_template_mappings (organization_id, event_type, channel, provider)
  WHERE organization_id IS NOT NULL;
GRANT SELECT ON public.notification_template_mappings TO authenticated;
GRANT ALL ON public.notification_template_mappings TO service_role;
ALTER TABLE public.notification_template_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_mappings_staff_read" ON public.notification_template_mappings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps
    WHERE ps.user_id = auth.uid() AND ps.status = 'active'::platform_staff_status));
CREATE TRIGGER notification_template_mappings_updated_at
  BEFORE UPDATE ON public.notification_template_mappings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) قواعد الإشعارات لكل مكتب ───────────────────────────────
CREATE TABLE public.notification_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  is_enabled boolean NOT NULL DEFAULT false,
  template_mapping_id uuid REFERENCES public.notification_template_mappings(id) ON DELETE SET NULL,
  delay_seconds integer NOT NULL DEFAULT 0,
  cooldown_seconds integer NOT NULL DEFAULT 300,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_rules_channel_check CHECK (channel IN ('whatsapp', 'email', 'sms', 'push')),
  CONSTRAINT notification_rules_delay_check CHECK (delay_seconds BETWEEN 0 AND 604800),
  CONSTRAINT notification_rules_cooldown_check CHECK (cooldown_seconds BETWEEN 0 AND 604800),
  CONSTRAINT notification_rules_unique UNIQUE (organization_id, event_type, channel)
);
GRANT SELECT, INSERT, UPDATE ON public.notification_rules TO authenticated;
GRANT ALL ON public.notification_rules TO service_role;
ALTER TABLE public.notification_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_rules_org_read" ON public.notification_rules
  FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "notification_rules_staff_read" ON public.notification_rules
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps
    WHERE ps.user_id = auth.uid() AND ps.status = 'active'::platform_staff_status));
CREATE POLICY "notification_rules_admin_insert" ON public.notification_rules
  FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner'::app_role, 'admin'::app_role]));
CREATE POLICY "notification_rules_admin_update" ON public.notification_rules
  FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner'::app_role, 'admin'::app_role]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner'::app_role, 'admin'::app_role]));
CREATE INDEX idx_notification_rules_lookup
  ON public.notification_rules (organization_id, event_type, channel) WHERE is_enabled;
CREATE TRIGGER notification_rules_updated_at
  BEFORE UPDATE ON public.notification_rules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) تفضيلات العميل الخارجي ─────────────────────────────────
CREATE TABLE public.notification_client_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  whatsapp_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  sms_enabled boolean NOT NULL DEFAULT false,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_client_preferences_unique UNIQUE (client_id)
);
GRANT SELECT, INSERT, UPDATE ON public.notification_client_preferences TO authenticated;
GRANT ALL ON public.notification_client_preferences TO service_role;
ALTER TABLE public.notification_client_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_client_prefs_org_read" ON public.notification_client_preferences
  FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "notification_client_prefs_write" ON public.notification_client_preferences
  FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner'::app_role, 'admin'::app_role, 'lawyer'::app_role]));
CREATE POLICY "notification_client_prefs_update" ON public.notification_client_preferences
  FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner'::app_role, 'admin'::app_role, 'lawyer'::app_role]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner'::app_role, 'admin'::app_role, 'lawyer'::app_role]));
CREATE TRIGGER notification_client_preferences_updated_at
  BEFORE UPDATE ON public.notification_client_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) طابور الإرسال ──────────────────────────────────────────
CREATE TABLE public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_id uuid REFERENCES public.notification_events(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  channel text NOT NULL DEFAULT 'whatsapp',
  provider text NOT NULL DEFAULT 'whatsline',
  recipient_type text NOT NULL DEFAULT 'client',
  recipient_id uuid,
  recipient_phone text,
  template_mapping_id uuid REFERENCES public.notification_template_mappings(id) ON DELETE SET NULL,
  provider_template_id text,
  provider_device_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued',
  is_test boolean NOT NULL DEFAULT false,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 4,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  processing_at timestamptz,
  accepted_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  last_error_code text,
  last_error_message text,
  latency_ms integer,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_queue_channel_check CHECK (channel IN ('whatsapp', 'email', 'sms', 'push')),
  CONSTRAINT notification_queue_status_check CHECK (status IN
    ('queued', 'scheduled', 'processing', 'provider_accepted', 'failed', 'cancelled')),
  CONSTRAINT notification_queue_recipient_check CHECK (recipient_type IN ('client', 'user', 'test')),
  CONSTRAINT notification_queue_idempotency_unique UNIQUE (idempotency_key)
);
GRANT SELECT ON public.notification_queue TO authenticated;
GRANT ALL ON public.notification_queue TO service_role;
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_queue_org_read" ON public.notification_queue
  FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "notification_queue_staff_read" ON public.notification_queue
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps
    WHERE ps.user_id = auth.uid() AND ps.status = 'active'::platform_staff_status));
CREATE INDEX idx_notification_queue_due ON public.notification_queue (status, scheduled_at);
CREATE INDEX idx_notification_queue_org_created
  ON public.notification_queue (organization_id, created_at DESC);
CREATE INDEX idx_notification_queue_event_type ON public.notification_queue (event_type);
CREATE INDEX idx_notification_queue_recipient ON public.notification_queue (recipient_id);
CREATE TRIGGER notification_queue_updated_at
  BEFORE UPDATE ON public.notification_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) محاولات الإرسال ────────────────────────────────────────
CREATE TABLE public.notification_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid NOT NULL REFERENCES public.notification_queue(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  http_status integer,
  status text NOT NULL,
  error_code text,
  error_message text,
  latency_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_attempts_status_check CHECK (status IN ('accepted', 'failed'))
);
GRANT SELECT ON public.notification_attempts TO authenticated;
GRANT ALL ON public.notification_attempts TO service_role;
ALTER TABLE public.notification_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_attempts_org_read" ON public.notification_attempts
  FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "notification_attempts_staff_read" ON public.notification_attempts
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps
    WHERE ps.user_id = auth.uid() AND ps.status = 'active'::platform_staff_status));
CREATE INDEX idx_notification_attempts_queue ON public.notification_attempts (queue_id, created_at DESC);
CREATE INDEX idx_notification_attempts_org ON public.notification_attempts (organization_id, created_at DESC);

-- 7) أجهزة وقوالب واتساب (مستوى المنصة) ──────────────────────
CREATE TABLE public.whatsapp_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'whatsline',
  provider_device_id text NOT NULL,
  phone_number text,
  display_name text,
  status text,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_devices_unique UNIQUE (provider, provider_device_id)
);
GRANT SELECT ON public.whatsapp_devices TO authenticated;
GRANT ALL ON public.whatsapp_devices TO service_role;
ALTER TABLE public.whatsapp_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_devices_staff_read" ON public.whatsapp_devices
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps
    WHERE ps.user_id = auth.uid() AND ps.status = 'active'::platform_staff_status));
CREATE TRIGGER whatsapp_devices_updated_at BEFORE UPDATE ON public.whatsapp_devices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'whatsline',
  provider_template_id text NOT NULL,
  provider_device_id text,
  name text NOT NULL,
  language text,
  category text,
  status text,
  body text,
  body_variable_count integer NOT NULL DEFAULT 0,
  button_variable_count integer NOT NULL DEFAULT 0,
  components jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_templates_unique UNIQUE (provider, provider_template_id)
);
GRANT SELECT ON public.whatsapp_templates TO authenticated;
GRANT ALL ON public.whatsapp_templates TO service_role;
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_templates_staff_read" ON public.whatsapp_templates
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps
    WHERE ps.user_id = auth.uid() AND ps.status = 'active'::platform_staff_status));
CREATE TRIGGER whatsapp_templates_updated_at BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 8) حالة مزوّد واتساب (صف واحد لكل مزوّد، بلا أي سر) ─────────
CREATE TABLE public.whatsapp_provider_state (
  provider text PRIMARY KEY,
  is_enabled boolean NOT NULL DEFAULT false,
  test_mode boolean NOT NULL DEFAULT true,
  test_phone text,
  default_device_id text,
  status text NOT NULL DEFAULT 'not_configured',
  devices_count integer NOT NULL DEFAULT 0,
  templates_count integer NOT NULL DEFAULT 0,
  last_checked_at timestamptz,
  last_synced_at timestamptz,
  last_error_code text,
  last_error_detail text,
  per_org_hourly_limit integer NOT NULL DEFAULT 200,
  per_recipient_hourly_limit integer NOT NULL DEFAULT 5,
  provider_hourly_limit integer NOT NULL DEFAULT 1000,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT whatsapp_provider_state_status_check CHECK (status IN
    ('not_configured', 'connected', 'degraded', 'failed', 'disabled'))
);
GRANT SELECT ON public.whatsapp_provider_state TO authenticated;
GRANT ALL ON public.whatsapp_provider_state TO service_role;
ALTER TABLE public.whatsapp_provider_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "whatsapp_provider_state_staff_read" ON public.whatsapp_provider_state
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps
    WHERE ps.user_id = auth.uid() AND ps.status = 'active'::platform_staff_status));
CREATE TRIGGER whatsapp_provider_state_updated_at BEFORE UPDATE ON public.whatsapp_provider_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
INSERT INTO public.whatsapp_provider_state (provider) VALUES ('whatsline');

-- 9) رموز متابعة مؤقتة لأزرار الرسائل (لا معرّفات في الرابط) ──
CREATE TABLE public.notification_link_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  purpose text NOT NULL DEFAULT 'case_track',
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_link_tokens_hash_unique UNIQUE (token_hash),
  CONSTRAINT notification_link_tokens_purpose_check CHECK (purpose IN ('case_track', 'document_upload'))
);
GRANT SELECT ON public.notification_link_tokens TO authenticated;
GRANT ALL ON public.notification_link_tokens TO service_role;
ALTER TABLE public.notification_link_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notification_link_tokens_org_read" ON public.notification_link_tokens
  FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE INDEX idx_notification_link_tokens_expiry ON public.notification_link_tokens (expires_at);

-- 10) توليد الأحداث من قاعدة البيانات (الحفظ يجري من المتصفح) ──
CREATE OR REPLACE FUNCTION public.notify_case_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.notification_events
      (organization_id, event_type, entity_type, entity_id, actor_user_id, payload)
    VALUES (NEW.organization_id, 'case.created', 'case', NEW.id, auth.uid(),
      jsonb_build_object(
        'case_id', NEW.id,
        'client_id', NEW.client_id,
        'new_status', NEW.status,
        'occurred_at', now()
      ));
    RETURN NEW;
  END IF;

  -- تغيير الحالة فقط عند اختلاف فعلي؛ الحفظ بلا تغيير لا يولّد حدثاً.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE
      WHEN NEW.status IN ('closed', 'archived') THEN 'case.closed'
      ELSE 'case.status_changed'
    END;
    INSERT INTO public.notification_events
      (organization_id, event_type, entity_type, entity_id, actor_user_id, payload)
    VALUES (NEW.organization_id, v_event, 'case', NEW.id, auth.uid(),
      jsonb_build_object(
        'case_id', NEW.id,
        'client_id', NEW.client_id,
        'previous_status', OLD.status,
        'new_status', NEW.status,
        'occurred_at', now()
      ));
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER cases_notification_event_insert
  AFTER INSERT ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.notify_case_event();

CREATE TRIGGER cases_notification_event_update
  AFTER UPDATE OF status ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.notify_case_event();

-- 11) مطالبة ذرّية تمنع إرسال الرسالة نفسها من عمليتين ────────
CREATE OR REPLACE FUNCTION public.claim_notification_batch(_limit integer DEFAULT 20)
RETURNS SETOF public.notification_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH due AS (
    SELECT q.id
    FROM public.notification_queue q
    WHERE q.status IN ('queued', 'scheduled')
      AND q.scheduled_at <= now()
    ORDER BY q.scheduled_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(_limit, 100))
  )
  UPDATE public.notification_queue q
     SET status = 'processing',
         processing_at = now(),
         attempts = q.attempts + 1
    FROM due
   WHERE q.id = due.id
  RETURNING q.*;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_notification_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_batch(integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_batch(integer) TO service_role;