ALTER TABLE public.otp_verifications
  ADD COLUMN IF NOT EXISTS integration_id uuid REFERENCES public.platform_integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispatch_source text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS remote_verification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatch_trace text;

ALTER TABLE public.otp_verifications DROP CONSTRAINT IF EXISTS otp_delivery_chk;
ALTER TABLE public.otp_verifications ADD CONSTRAINT otp_delivery_chk
  CHECK (delivery_status = ANY (ARRAY['queued','sending','sent','delivered','failed','test']));

ALTER TABLE public.otp_verifications DROP CONSTRAINT IF EXISTS otp_dispatch_source_chk;
ALTER TABLE public.otp_verifications ADD CONSTRAINT otp_dispatch_source_chk
  CHECK (dispatch_source IS NULL OR dispatch_source = ANY (ARRAY['integration','legacy','test_mode']));

-- رمز واحد نشط فقط لكل رقم وغرض: يمنع إرسال رمزين من مزودين مختلفين لنفس الطلب.
CREATE UNIQUE INDEX IF NOT EXISTS otp_verifications_single_active_idx
  ON public.otp_verifications (phone_e164, purpose)
  WHERE consumed_at IS NULL;

-- منع تكرار الإرسال عند الضغط المتكرر على الزر.
CREATE UNIQUE INDEX IF NOT EXISTS otp_verifications_idempotency_idx
  ON public.otp_verifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS otp_verifications_integration_idx
  ON public.otp_verifications (integration_id, created_at DESC);