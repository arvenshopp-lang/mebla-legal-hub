UPDATE public.email_mailboxes
SET inbound_enabled = true, sync_enabled = true, updated_at = now()
WHERE address = 'noreply@mehlalex.com';