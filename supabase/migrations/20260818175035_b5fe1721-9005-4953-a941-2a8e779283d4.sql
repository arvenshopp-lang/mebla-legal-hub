-- تتبّع محاولات أعطال الإعداد بمعزل عن محاولات الإرسال الفعلية، لمنع إعادة
-- المحاولة اللانهائية وتضخيم سجل الأعطال عند تعذّر الاتصال بخدمة البريد.
ALTER TABLE public.email_outbox
  ADD COLUMN IF NOT EXISTS config_attempts integer NOT NULL DEFAULT 0;

-- إيقاف الرسائل المعلّقة حالياً بسبب تعذّر الاتصال (إعادة المحاولة اليدوية متاحة)
UPDATE public.email_outbox
SET status = 'failed',
    locked_at = NULL,
    config_attempts = 12,
    last_error = 'تعذّر الاتصال بخدمة البريد بعد محاولات متكررة؛ الرسالة موقوفة بانتظار إصلاح الإعداد، ويمكن إعادة المحاولة يدوياً.'
WHERE status IN ('queued', 'scheduled', 'sending')
  AND last_error_code IN ('smtp_connect_failed', 'smtp_timeout', 'smtp_auth_failed', 'smtp_not_configured');

UPDATE public.email_messages m
SET status = 'failed'
WHERE m.status IN ('queued', 'sending')
  AND EXISTS (
    SELECT 1 FROM public.email_outbox o
    WHERE o.message_id = m.id AND o.status = 'failed'
  );