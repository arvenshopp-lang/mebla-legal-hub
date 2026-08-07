CREATE TABLE public.webhook_endpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  adapter_type TEXT NOT NULL,
  verification_mode TEXT NOT NULL DEFAULT 'hmac_sha256',
  signature_header TEXT NOT NULL DEFAULT 'x-webhook-signature',
  timestamp_header TEXT,
  signing_secret TEXT,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  test_mode BOOLEAN NOT NULL DEFAULT true,
  rate_limit_per_minute INTEGER NOT NULL DEFAULT 120,
  last_event_at TIMESTAMP WITH TIME ZONE,
  last_error TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT webhook_endpoints_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,40}$'),
  CONSTRAINT webhook_endpoints_verification_mode CHECK (verification_mode IN ('hmac_sha256','shared_secret')),
  CONSTRAINT webhook_endpoints_rate_limit CHECK (rate_limit_per_minute BETWEEN 1 AND 6000)
);

GRANT SELECT ON public.webhook_endpoints TO authenticated;
GRANT ALL ON public.webhook_endpoints TO service_role;
ALTER TABLE public.webhook_endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform staff read webhook endpoints"
ON public.webhook_endpoints FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.platform_staff s
  WHERE s.user_id = auth.uid() AND s.status = 'active'
));

CREATE TABLE public.webhook_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint_id UUID REFERENCES public.webhook_endpoints(id) ON DELETE SET NULL,
  slug TEXT NOT NULL,
  adapter_type TEXT,
  event_type TEXT,
  provider_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'received',
  attempts INTEGER NOT NULL DEFAULT 0,
  signature_valid BOOLEAN NOT NULL DEFAULT false,
  replay_detected BOOLEAN NOT NULL DEFAULT false,
  payload_hash TEXT NOT NULL,
  redacted_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  reject_reason TEXT,
  last_error TEXT,
  request_ip TEXT,
  correlation_id TEXT NOT NULL DEFAULT replace(gen_random_uuid()::text, '-', ''),
  received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT webhook_events_status CHECK (status IN ('received','processed','ignored','failed','dead_letter','unauthorized','rate_limited','replayed','duplicate'))
);

GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform staff read webhook events"
ON public.webhook_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.platform_staff s
  WHERE s.user_id = auth.uid() AND s.status = 'active'
));

CREATE UNIQUE INDEX webhook_events_provider_event_key
  ON public.webhook_events (slug, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX webhook_events_slug_received_idx ON public.webhook_events (slug, received_at DESC);
CREATE INDEX webhook_events_status_idx ON public.webhook_events (status, received_at DESC);
CREATE INDEX webhook_events_payload_hash_idx ON public.webhook_events (slug, payload_hash, received_at DESC);

CREATE TRIGGER webhook_endpoints_set_updated_at
BEFORE UPDATE ON public.webhook_endpoints
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER webhook_events_set_updated_at
BEFORE UPDATE ON public.webhook_events
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.webhook_endpoints (slug, display_name, adapter_type, verification_mode, signature_header, timestamp_header, is_enabled, test_mode, notes)
VALUES ('whatsline', 'Whats Line Official API', 'whatsline', 'shared_secret', 'x-webhook-token', NULL, false, true, 'يُفعَّل بعد ضبط سرّ التحقق وإدخال الرابط في لوحة المزوّد.');