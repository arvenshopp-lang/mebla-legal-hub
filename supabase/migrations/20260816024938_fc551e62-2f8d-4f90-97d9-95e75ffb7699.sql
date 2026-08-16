CREATE TABLE public.notification_email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL REFERENCES public.notifications(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  template_key text NOT NULL,
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 4,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  provider_reference text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  processing_started_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  CONSTRAINT notification_email_queue_status_check
    CHECK (status IN ('queued', 'processing', 'sent', 'failed', 'cancelled')),
  CONSTRAINT notification_email_queue_attempts_check
    CHECK (attempts >= 0 AND max_attempts > 0),
  CONSTRAINT notification_email_queue_notification_unique UNIQUE (notification_id)
);

REVOKE ALL ON public.notification_email_queue FROM PUBLIC;
REVOKE ALL ON public.notification_email_queue FROM anon;
REVOKE ALL ON public.notification_email_queue FROM authenticated;
GRANT ALL ON public.notification_email_queue TO service_role;

ALTER TABLE public.notification_email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_email_queue_service_only"
  ON public.notification_email_queue
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX notification_email_queue_due_idx
  ON public.notification_email_queue (status, scheduled_at);
CREATE INDEX notification_email_queue_org_idx
  ON public.notification_email_queue (organization_id, created_at DESC);
CREATE INDEX notification_email_queue_event_idx
  ON public.notification_email_queue (event_type, status);

CREATE TRIGGER trg_notification_email_queue_updated
  BEFORE UPDATE ON public.notification_email_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.claim_notification_email_batch(_limit integer)
RETURNS SETOF public.notification_email_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(_limit, 25), 100));
BEGIN
  UPDATE public.notification_email_queue q
     SET status = 'failed',
         failed_at = now(),
         last_error_code = 'STALE_MAX_ATTEMPTS',
         processing_started_at = NULL,
         updated_at = now()
   WHERE q.status = 'processing'
     AND q.processing_started_at < now() - interval '15 minutes'
     AND q.attempts >= q.max_attempts;

  RETURN QUERY
  WITH due AS (
    SELECT q.id
    FROM public.notification_email_queue q
    WHERE (
            (q.status = 'queued' AND q.scheduled_at <= now())
         OR (q.status = 'processing' AND q.processing_started_at < now() - interval '15 minutes')
          )
      AND q.attempts < q.max_attempts
    ORDER BY q.scheduled_at
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.notification_email_queue q
     SET status = 'processing',
         processing_started_at = now(),
         attempts = q.attempts + 1
    FROM due
   WHERE q.id = due.id
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_notification_email_batch(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_notification_email_batch(integer) FROM anon;
REVOKE ALL ON FUNCTION public.claim_notification_email_batch(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_email_batch(integer) TO service_role;

CREATE TABLE public.notification_email_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id uuid NOT NULL,
  organization_id uuid,
  user_id uuid NOT NULL,
  event_type text NOT NULL,
  template_key text NOT NULL,
  delivery_status text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  provider_reference text,
  recipient_masked text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finalized_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_deliveries_status_check
    CHECK (delivery_status IN ('sent', 'failed', 'cancelled')),
  CONSTRAINT notification_email_deliveries_attempts_check CHECK (attempts >= 0),
  CONSTRAINT notification_email_deliveries_notification_unique UNIQUE (notification_id)
);

REVOKE ALL ON public.notification_email_deliveries FROM PUBLIC;
REVOKE ALL ON public.notification_email_deliveries FROM anon;
REVOKE ALL ON public.notification_email_deliveries FROM authenticated;
GRANT SELECT, INSERT ON public.notification_email_deliveries TO service_role;

ALTER TABLE public.notification_email_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "notification_email_deliveries_service_read"
  ON public.notification_email_deliveries
  FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "notification_email_deliveries_service_insert"
  ON public.notification_email_deliveries
  FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE TRIGGER trg_notification_email_deliveries_no_update
  BEFORE UPDATE ON public.notification_email_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();

CREATE TRIGGER trg_notification_email_deliveries_no_delete
  BEFORE DELETE ON public.notification_email_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

CREATE INDEX notification_email_deliveries_notification_idx
  ON public.notification_email_deliveries (notification_id);
CREATE INDEX notification_email_deliveries_created_idx
  ON public.notification_email_deliveries (created_at DESC);
CREATE INDEX notification_email_deliveries_status_idx
  ON public.notification_email_deliveries (delivery_status, created_at DESC);

CREATE OR REPLACE FUNCTION public.finalize_notification_email_delivery(
  _queue_id uuid,
  _final_status text,
  _provider_reference text DEFAULT NULL,
  _error_code text DEFAULT NULL,
  _recipient_masked text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.notification_email_queue;
BEGIN
  IF _final_status IS NULL OR _final_status NOT IN ('sent', 'failed', 'cancelled') THEN
    RETURN 'INVALID_FINAL_STATUS';
  END IF;

  SELECT * INTO v_row
    FROM public.notification_email_queue
   WHERE id = _queue_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'QUEUE_ROW_NOT_FOUND';
  END IF;

  IF v_row.status IN ('sent', 'failed', 'cancelled') THEN
    INSERT INTO public.notification_email_deliveries (
      notification_id, organization_id, user_id, event_type, template_key,
      delivery_status, attempts, provider_reference, recipient_masked, error_code
    ) VALUES (
      v_row.notification_id, v_row.organization_id, v_row.user_id, v_row.event_type,
      v_row.template_key, v_row.status, v_row.attempts, v_row.provider_reference,
      _recipient_masked, v_row.last_error_code
    )
    ON CONFLICT (notification_id) DO NOTHING;
    RETURN 'ALREADY_FINALIZED';
  END IF;

  IF v_row.status <> 'processing' THEN
    RETURN 'INVALID_QUEUE_STATE';
  END IF;

  UPDATE public.notification_email_queue q
     SET status = _final_status,
         provider_reference = COALESCE(_provider_reference, q.provider_reference),
         last_error_code = CASE WHEN _final_status = 'sent' THEN NULL ELSE _error_code END,
         last_error_message = CASE WHEN _final_status = 'sent' THEN NULL ELSE q.last_error_message END,
         sent_at = CASE WHEN _final_status = 'sent' THEN now() ELSE q.sent_at END,
         failed_at = CASE WHEN _final_status = 'sent' THEN q.failed_at ELSE now() END,
         processing_started_at = NULL,
         updated_at = now()
   WHERE q.id = _queue_id
  RETURNING q.* INTO v_row;

  INSERT INTO public.notification_email_deliveries (
    notification_id, organization_id, user_id, event_type, template_key,
    delivery_status, attempts, provider_reference, recipient_masked, error_code
  ) VALUES (
    v_row.notification_id, v_row.organization_id, v_row.user_id, v_row.event_type,
    v_row.template_key, _final_status, v_row.attempts, v_row.provider_reference,
    _recipient_masked, CASE WHEN _final_status = 'sent' THEN NULL ELSE _error_code END
  )
  ON CONFLICT (notification_id) DO NOTHING;

  RETURN 'FINALIZED';
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_notification_email_delivery(uuid, text, text, text, text) TO service_role;