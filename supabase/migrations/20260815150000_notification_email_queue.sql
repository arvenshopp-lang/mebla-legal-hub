-- ============================================================================
-- MEHLA — قناة بريد التنبيهات (المرحلة 1)
-- طابور مستقل لتسليم تنبيهات النظام بالبريد. لا يمس محرك واتساب ولا صندوق
-- البريد البشري. جدول تشغيلي خادمي بالكامل: لا وصول من المتصفح إطلاقاً.
-- ملاحظة: مصدر فقط — لا يُطبَّق في هذه الدفعة.
-- ============================================================================

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
  -- تفرّد قناة البريد: إشعار واحد ⇒ رسالة واحدة كحد أقصى.
  CONSTRAINT notification_email_queue_notification_unique UNIQUE (notification_id)
);

-- صلاحيات: دور الخدمة فقط. لا anon ولا authenticated (الجدول تشغيلي بحت).
REVOKE ALL ON public.notification_email_queue FROM PUBLIC;
REVOKE ALL ON public.notification_email_queue FROM anon;
REVOKE ALL ON public.notification_email_queue FROM authenticated;
GRANT ALL ON public.notification_email_queue TO service_role;

ALTER TABLE public.notification_email_queue ENABLE ROW LEVEL SECURITY;

-- لا سياسة لأي دور مستخدم: RLS مفعّل بلا سياسات ⇒ لا قراءة ولا كتابة عبر
-- واجهة البيانات. دور الخدمة يتجاوز RLS للعمل الخادمي فقط.
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

-- ============================================================================
-- سحب دفعة بقفل آمن: يمنع معالجة نفس الصف من عاملين، ويستعيد الصفوف
-- العالقة في processing بعد 15 دقيقة (تعطل عامل) دون فقدان عدّاد المحاولات.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.claim_notification_email_batch(_limit integer)
RETURNS SETOF public.notification_email_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_limit integer := GREATEST(1, LEAST(COALESCE(_limit, 25), 100));
BEGIN
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

-- المهمة الدورية: تصريف طابور بريد التنبيهات كل دقيقة عبر المسار المحمي
-- بسر التشغيل نفسه المستخدم في بقية المهام (ops.cron_secret()).
SELECT cron.schedule(
  'mehla-notification-emails',
  '* * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--0ac4f813-8ba3-4f48-9bc7-432613df3dae.lovable.app/api/public/hooks/notification-emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mehla-cron-secret', ops.cron_secret()),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mehla-notification-emails');
