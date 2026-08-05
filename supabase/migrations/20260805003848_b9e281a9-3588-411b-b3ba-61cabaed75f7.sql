ALTER TABLE public.email_mailboxes DROP CONSTRAINT email_mailboxes_agentic_link_status_check;
ALTER TABLE public.email_mailboxes ADD CONSTRAINT email_mailboxes_agentic_link_status_check
  CHECK (agentic_link_status = ANY (ARRAY['unlinked','linked','missing','alias']));

UPDATE public.email_mailboxes
   SET agentic_link_status = 'alias', sync_enabled = false
 WHERE type = 'human' AND agentic_mailbox_id IS NULL;

UPDATE public.email_mailboxes
   SET sync_enabled = true
 WHERE type = 'system' AND agentic_mailbox_id IS NOT NULL;