-- ============ 1) إعدادات المزامنة على الصناديق
ALTER TABLE public.email_mailboxes
  ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS imap_folders jsonb NOT NULL DEFAULT '["INBOX"]'::jsonb,
  ADD COLUMN IF NOT EXISTS credential_key text,
  ADD COLUMN IF NOT EXISTS reply_to text;

-- ============ 2) بصمة IMAP على الرسائل (منع التكرار)
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS imap_uid bigint,
  ADD COLUMN IF NOT EXISTS imap_folder text,
  ADD COLUMN IF NOT EXISTS imap_uidvalidity bigint;

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_imap_identity_uq
  ON public.email_messages (mailbox_id, imap_folder, imap_uidvalidity, imap_uid)
  WHERE imap_uid IS NOT NULL;

-- ============ 3) حالة المزامنة لكل (صندوق، مجلد)
CREATE TABLE IF NOT EXISTS public.email_sync_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mailbox_id uuid NOT NULL REFERENCES public.email_mailboxes(id) ON DELETE CASCADE,
  folder text NOT NULL,
  local_folder text NOT NULL DEFAULT 'inbox',
  uidvalidity bigint,
  last_uid bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'idle',
  locked_at timestamptz,
  lock_token text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_code text,
  last_error_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  messages_synced integer NOT NULL DEFAULT 0,
  new_messages integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, folder)
);

GRANT ALL ON public.email_sync_state TO service_role;
ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;

-- ============ 4) سجل عمليات المزامنة
CREATE TABLE IF NOT EXISTS public.email_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mailbox_id uuid NOT NULL REFERENCES public.email_mailboxes(id) ON DELETE CASCADE,
  folder text NOT NULL,
  trigger_source text NOT NULL DEFAULT 'cron',
  outcome text NOT NULL,
  fetched integer NOT NULL DEFAULT 0,
  ingested integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  tickets_created integer NOT NULL DEFAULT 0,
  reindexed boolean NOT NULL DEFAULT false,
  error_code text,
  error_message text,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_sync_runs_mailbox_idx
  ON public.email_sync_runs (mailbox_id, created_at DESC);

GRANT ALL ON public.email_sync_runs TO service_role;
ALTER TABLE public.email_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER email_sync_state_updated_at
  BEFORE UPDATE ON public.email_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 5) قاعدة قراءة صريحة لمستودع المستندات
CREATE POLICY docs_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND private.has_organization_role(
      ((storage.foldername(name))[1])::uuid,
      auth.uid(),
      ARRAY['owner'::app_role, 'admin'::app_role, 'lawyer'::app_role, 'legal_assistant'::app_role, 'viewer'::app_role]
    )
  );