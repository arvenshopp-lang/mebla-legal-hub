ALTER TABLE public.support_ticket_ingest
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS match_reason text,
  ADD COLUMN IF NOT EXISTS provider_message_id text;

ALTER TABLE public.support_ticket_ingest
  DROP CONSTRAINT IF EXISTS support_ingest_source;
ALTER TABLE public.support_ticket_ingest
  ADD CONSTRAINT support_ingest_source
  CHECK (source IS NULL OR source = ANY (ARRAY['imap_sync','inbound_webhook','agentic']));

ALTER TABLE public.support_ticket_ingest
  DROP CONSTRAINT IF EXISTS support_ingest_match_reason;
ALTER TABLE public.support_ticket_ingest
  ADD CONSTRAINT support_ingest_match_reason
  CHECK (match_reason IS NULL OR match_reason = ANY (ARRAY['thread_ticket','message_ticket','thread_source','header_reference','new_ticket']));

CREATE INDEX IF NOT EXISTS support_ticket_ingest_ticket_idx
  ON public.support_ticket_ingest (ticket_id, created_at);

ALTER TABLE public.support_ticket_messages
  ADD COLUMN IF NOT EXISTS email_message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS support_ticket_messages_email_msg_idx
  ON public.support_ticket_messages (email_message_id);