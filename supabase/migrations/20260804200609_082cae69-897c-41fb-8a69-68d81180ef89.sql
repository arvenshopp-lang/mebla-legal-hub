-- ============ توسيع مرفقات البريد ============
ALTER TABLE public.email_attachments
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS original_name text,
  ADD COLUMN IF NOT EXISTS extension text,
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'not_scanned',
  ADD COLUMN IF NOT EXISTS scan_detail text,
  ADD COLUMN IF NOT EXISTS is_quarantined boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_inline_safe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS uploaded_by_email text,
  ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_downloaded_at timestamptz;

ALTER TABLE public.email_attachments
  ALTER COLUMN message_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_attachments_direction_chk') THEN
    ALTER TABLE public.email_attachments
      ADD CONSTRAINT email_attachments_direction_chk CHECK (direction IN ('outbound','inbound'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_attachments_scan_chk') THEN
    ALTER TABLE public.email_attachments
      ADD CONSTRAINT email_attachments_scan_chk
      CHECK (scan_status IN ('not_scanned','pending','clean','rejected','quarantined'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_attachments_msg_sha_uidx
  ON public.email_attachments (message_id, sha256)
  WHERE message_id IS NOT NULL AND sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_attachments_message_idx ON public.email_attachments (message_id);

-- ============ سجل أحداث البريد الوارد ============
CREATE TABLE IF NOT EXISTS public.email_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'webhook',
  provider_message_id text,
  payload_hash text NOT NULL,
  recipient text,
  sender_hint text,
  signature_mode text NOT NULL DEFAULT 'shared_secret',
  request_ip text,
  outcome text NOT NULL,
  reject_reason text,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  message_row_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  attachments_accepted integer NOT NULL DEFAULT 0,
  attachments_rejected integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_inbound_events_outcome_chk') THEN
    ALTER TABLE public.email_inbound_events
      ADD CONSTRAINT email_inbound_events_outcome_chk
      CHECK (outcome IN ('accepted','duplicate','rejected','rate_limited','replayed','unauthorized'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_inbound_events_provider_msg_uidx
  ON public.email_inbound_events (provider_message_id)
  WHERE provider_message_id IS NOT NULL AND outcome = 'accepted';

CREATE INDEX IF NOT EXISTS email_inbound_events_created_idx ON public.email_inbound_events (created_at DESC);
CREATE INDEX IF NOT EXISTS email_inbound_events_hash_idx ON public.email_inbound_events (payload_hash, created_at DESC);

-- مغلق تماماً أمام العميل: RLS مُفعّل بلا سياسات، والوصول لـ service_role فقط
ALTER TABLE public.email_inbound_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_inbound_events FROM anon, authenticated;
GRANT ALL ON public.email_inbound_events TO service_role;

-- سجل غير قابل للتعديل أو الحذف
DROP TRIGGER IF EXISTS email_inbound_events_no_update ON public.email_inbound_events;
CREATE TRIGGER email_inbound_events_no_update
  BEFORE UPDATE ON public.email_inbound_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS email_inbound_events_no_delete ON public.email_inbound_events;
CREATE TRIGGER email_inbound_events_no_delete
  BEFORE DELETE ON public.email_inbound_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();