ALTER TABLE public.email_mailboxes
  ADD COLUMN IF NOT EXISTS agentic_mailbox_id text,
  ADD COLUMN IF NOT EXISTS agentic_link_status text NOT NULL DEFAULT 'unlinked',
  ADD COLUMN IF NOT EXISTS agentic_unread_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agentic_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS agentic_last_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_mailboxes'::regclass AND conname = 'email_mailboxes_agentic_link_status_check'
  ) THEN
    ALTER TABLE public.email_mailboxes
      ADD CONSTRAINT email_mailboxes_agentic_link_status_check
      CHECK (agentic_link_status IN ('unlinked', 'linked', 'missing'));
  END IF;
END $$;

ALTER TABLE public.email_sync_state
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'imap',
  ADD COLUMN IF NOT EXISTS provider_cursor text,
  ADD COLUMN IF NOT EXISTS provider_folder_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_sync_state'::regclass AND conname = 'email_sync_state_provider_check'
  ) THEN
    ALTER TABLE public.email_sync_state
      ADD CONSTRAINT email_sync_state_provider_check CHECK (provider IN ('imap', 'agentic_mail'));
  END IF;
END $$;

ALTER TABLE public.email_sync_state DROP CONSTRAINT IF EXISTS email_sync_state_mailbox_id_folder_key;

CREATE UNIQUE INDEX IF NOT EXISTS email_sync_state_mailbox_provider_folder_key
  ON public.email_sync_state (mailbox_id, provider, folder);

ALTER TABLE public.email_sync_runs
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'imap';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_sync_runs'::regclass AND conname = 'email_sync_runs_provider_check'
  ) THEN
    ALTER TABLE public.email_sync_runs
      ADD CONSTRAINT email_sync_runs_provider_check CHECK (provider IN ('imap', 'agentic_mail'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_mailboxes_agentic_mailbox_id_idx
  ON public.email_mailboxes (agentic_mailbox_id) WHERE agentic_mailbox_id IS NOT NULL;