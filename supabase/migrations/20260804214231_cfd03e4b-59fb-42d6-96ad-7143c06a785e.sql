-- 1) توحيد القنوات مع محرك الدعم
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_channel_check;
UPDATE public.support_tickets SET channel = 'portal' WHERE channel = 'web_form';
UPDATE public.support_tickets SET channel = 'internal' WHERE channel = 'manual';
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_channel_check
  CHECK (channel = ANY (ARRAY['email','portal','phone','internal','whatsapp','chat']));

-- 2) توحيد حالة المهلة
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_sla_state_check;
UPDATE public.support_tickets SET sla_state = 'ok' WHERE sla_state = 'on_track';
ALTER TABLE public.support_tickets ALTER COLUMN sla_state SET DEFAULT 'ok';
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_sla_state_check
  CHECK (sla_state = ANY (ARRAY['ok','paused','warning','critical','breached','met']));

-- 3) فهارس التشغيل
CREATE INDEX IF NOT EXISTS support_tickets_status_updated_idx
  ON public.support_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_team_status_idx
  ON public.support_tickets (team_id, status);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_status_idx
  ON public.support_tickets (assigned_to, status);
CREATE INDEX IF NOT EXISTS support_tickets_sla_state_idx
  ON public.support_tickets (sla_state) WHERE merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS support_tickets_org_idx
  ON public.support_tickets (organization_id);
CREATE INDEX IF NOT EXISTS support_tickets_thread_idx
  ON public.support_tickets (source_email_thread_id);
CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx
  ON public.support_ticket_events (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_sla_events_ticket_idx
  ON public.support_sla_events (ticket_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS support_csat_invitations_ticket_idx
  ON public.support_csat_invitations (ticket_id);