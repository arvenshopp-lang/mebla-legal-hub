-- ============================================================
-- Support Center — Phase 1: schema
-- ============================================================

-- 1) new lifecycle states (values are NOT referenced in this migration)
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'pending_internal';
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'escalated';
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'resolved';

-- 2) readable sequential ticket number
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START 1000;

-- 3) business calendars & holidays
CREATE TABLE IF NOT EXISTS public.support_business_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Riyadh',
  work_days smallint[] NOT NULL DEFAULT '{0,1,2,3,4}',
  start_minute integer NOT NULL DEFAULT 540,
  end_minute integer NOT NULL DEFAULT 1020,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_calendar_window CHECK (start_minute >= 0 AND end_minute > start_minute AND end_minute <= 1440)
);
GRANT ALL ON public.support_business_calendars TO service_role;
ALTER TABLE public.support_business_calendars ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES public.support_business_calendars(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name_ar text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, holiday_date)
);
GRANT ALL ON public.support_holidays TO service_role;
ALTER TABLE public.support_holidays ENABLE ROW LEVEL SECURITY;

-- 4) teams
CREATE TABLE IF NOT EXISTS public.support_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description text,
  department_id uuid REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  mailbox_id uuid REFERENCES public.email_mailboxes(id) ON DELETE SET NULL,
  manager_user_id uuid,
  escalation_team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.support_teams TO service_role;
ALTER TABLE public.support_teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.support_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_lead boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
GRANT ALL ON public.support_team_members TO service_role;
ALTER TABLE public.support_team_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_team_members_user_idx ON public.support_team_members (user_id);

-- 5) SLA policies
CREATE TABLE IF NOT EXISTS public.support_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  calendar_id uuid NOT NULL REFERENCES public.support_business_calendars(id),
  plan_code text,
  priority public.ticket_priority,
  channel text,
  category text,
  first_response_minutes integer NOT NULL DEFAULT 240,
  resolution_minutes integer NOT NULL DEFAULT 1440,
  pause_on_customer_wait boolean NOT NULL DEFAULT true,
  warning_percent smallint NOT NULL DEFAULT 75,
  critical_percent smallint NOT NULL DEFAULT 90,
  specificity integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_sla_minutes CHECK (first_response_minutes > 0 AND resolution_minutes > 0),
  CONSTRAINT support_sla_percent CHECK (warning_percent BETWEEN 1 AND 99 AND critical_percent BETWEEN warning_percent AND 100)
);
GRANT ALL ON public.support_sla_policies TO service_role;
ALTER TABLE public.support_sla_policies ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_sla_policies_match_idx
  ON public.support_sla_policies (is_active, plan_code, priority, channel, category);

-- 6) categories
CREATE TABLE IF NOT EXISTS public.support_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description text,
  default_priority public.ticket_priority NOT NULL DEFAULT 'medium',
  default_team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  sla_policy_id uuid REFERENCES public.support_sla_policies(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.support_categories TO service_role;
ALTER TABLE public.support_categories ENABLE ROW LEVEL SECURITY;

-- 7) tags
CREATE TABLE IF NOT EXISTS public.support_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'muted',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.support_tags TO service_role;
ALTER TABLE public.support_tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_ticket_tags (
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.support_tags(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, tag_id)
);
GRANT ALL ON public.support_ticket_tags TO service_role;
ALTER TABLE public.support_ticket_tags ENABLE ROW LEVEL SECURITY;

-- 8) ticket columns
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_number text,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'web_form',
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sla_policy_id uuid REFERENCES public.support_sla_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_resolution_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_state text NOT NULL DEFAULT 'on_track',
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_total_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalation_level smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS split_from_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_email_thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requester_email text,
  ADD COLUMN IF NOT EXISTS requester_name text,
  ADD COLUMN IF NOT EXISTS identity_source text,
  ADD COLUMN IF NOT EXISTS needs_identity_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kb_article_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS csat_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_customer_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_staff_reply_at timestamptz;

ALTER TABLE public.support_tickets
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_channel_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_channel_check
  CHECK (channel IN ('email','web_form','manual','whatsapp','chat'));

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_sla_state_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_sla_state_check
  CHECK (sla_state IN ('on_track','paused','warning','critical','breached','met'));

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_no_self_merge;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_no_self_merge CHECK (merged_into_id IS NULL OR merged_into_id <> id);

-- allow trusted server-side (service role / migration) updates; user-facing rating rules unchanged
CREATE OR REPLACE FUNCTION public.support_tickets_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $guard$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.user_id := coalesce(auth.uid(), NEW.user_id);
    NEW.reference := coalesce(nullif(btrim(NEW.reference), ''),
      'TK-' || to_char(now(), 'YYMMDD') || '-' || lpad((floor(random() * 100000))::int::text, 5, '0'));
    IF auth.uid() IS NOT NULL THEN
      NEW.status := 'new';
      NEW.rating := NULL; NEW.rating_comment := NULL; NEW.rated_at := NULL;
      NEW.rated_staff_id := NULL; NEW.rated_staff_name := NULL;
    END IF;
    NEW.last_reply_at := coalesce(NEW.last_reply_at, now());
    RETURN NEW;
  END IF;

  -- trusted server-side paths (service role or migration owner)
  IF auth.uid() IS NULL
     AND (coalesce(auth.role(), '') = 'service_role' OR session_user IN ('postgres', 'supabase_admin')) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF private.has_platform_permission(auth.uid(), 'tickets.reply') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF OLD.status <> 'closed' THEN
    RAISE EXCEPTION 'TICKET_NOT_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.rated_at IS NOT NULL THEN
    RAISE EXCEPTION 'TICKET_ALREADY_RATED' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.rating IS NULL OR NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'INVALID_RATING' USING ERRCODE = 'P0001';
  END IF;

  NEW.id := OLD.id;
  NEW.reference := OLD.reference;
  NEW.user_id := OLD.user_id;
  NEW.organization_id := OLD.organization_id;
  NEW.subject := OLD.subject;
  NEW.category := OLD.category;
  NEW.priority := OLD.priority;
  NEW.status := OLD.status;
  NEW.description := OLD.description;
  NEW.assigned_to := OLD.assigned_to;
  NEW.last_reply_at := OLD.last_reply_at;
  NEW.closed_at := OLD.closed_at;
  NEW.created_at := OLD.created_at;
  NEW.rating_comment := nullif(left(btrim(coalesce(NEW.rating_comment, '')), 1000), '');
  NEW.rated_at := now();
  NEW.rated_staff_id := OLD.assigned_to;
  NEW.rated_staff_name := (SELECT ps.full_name FROM public.platform_staff ps WHERE ps.user_id = OLD.assigned_to);
  NEW.updated_at := now();
  RETURN NEW;
END;
$guard$;

-- backfill readable numbers for existing rows
UPDATE public.support_tickets
   SET ticket_number = 'MEH-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0')
 WHERE ticket_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_ticket_number_key ON public.support_tickets (ticket_number);
CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_source_thread_key
  ON public.support_tickets (source_email_thread_id) WHERE source_email_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status, last_reply_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_org_idx ON public.support_tickets (organization_id);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx ON public.support_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS support_tickets_team_idx ON public.support_tickets (team_id);
CREATE INDEX IF NOT EXISTS support_tickets_sla_idx ON public.support_tickets (sla_state, due_resolution_at);

CREATE OR REPLACE FUNCTION public.support_tickets_assign_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := 'MEH-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS support_tickets_number ON public.support_tickets;
CREATE TRIGGER support_tickets_number BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_assign_number();

-- tickets are never hard-deleted
DROP TRIGGER IF EXISTS support_tickets_no_delete ON public.support_tickets;
CREATE TRIGGER support_tickets_no_delete BEFORE DELETE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 9) unified timeline events (insert-only)
CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_id uuid,
  actor_name text,
  actor_kind text NOT NULL DEFAULT 'staff',
  value_before jsonb,
  value_after jsonb,
  reason text,
  email_message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  internal_note_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_event_actor_kind CHECK (actor_kind IN ('staff','customer','system'))
);
GRANT ALL ON public.support_ticket_events TO service_role;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx ON public.support_ticket_events (ticket_id, created_at);
DROP TRIGGER IF EXISTS support_ticket_events_immutable ON public.support_ticket_events;
CREATE TRIGGER support_ticket_events_immutable BEFORE UPDATE ON public.support_ticket_events
FOR EACH ROW EXECUTE FUNCTION public.deny_update();
DROP TRIGGER IF EXISTS support_ticket_events_no_delete ON public.support_ticket_events;
CREATE TRIGGER support_ticket_events_no_delete BEFORE DELETE ON public.support_ticket_events
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 10) internal notes (never sent to the customer)
CREATE TABLE IF NOT EXISTS public.support_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  author_id uuid,
  author_name text NOT NULL,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_internal_notes_body CHECK (length(btrim(body)) > 0)
);
GRANT ALL ON public.support_internal_notes TO service_role;
ALTER TABLE public.support_internal_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_internal_notes_ticket_idx ON public.support_internal_notes (ticket_id, created_at);
DROP TRIGGER IF EXISTS support_internal_notes_no_delete ON public.support_internal_notes;
CREATE TRIGGER support_internal_notes_no_delete BEFORE DELETE ON public.support_internal_notes
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 11) SLA events (insert-only)
CREATE TABLE IF NOT EXISTS public.support_sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  metric text NOT NULL DEFAULT 'resolution',
  policy_id uuid REFERENCES public.support_sla_policies(id) ON DELETE SET NULL,
  due_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  paused_seconds integer,
  reason text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_sla_event_type CHECK (event_type IN ('started','paused','resumed','warning','critical','breached','met','recalculated')),
  CONSTRAINT support_sla_event_metric CHECK (metric IN ('first_response','resolution'))
);
GRANT ALL ON public.support_sla_events TO service_role;
ALTER TABLE public.support_sla_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_sla_events_ticket_idx ON public.support_sla_events (ticket_id, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS support_sla_events_once_idx
  ON public.support_sla_events (ticket_id, metric, event_type)
  WHERE event_type IN ('warning','critical','breached','met');
DROP TRIGGER IF EXISTS support_sla_events_immutable ON public.support_sla_events;
CREATE TRIGGER support_sla_events_immutable BEFORE UPDATE ON public.support_sla_events
FOR EACH ROW EXECUTE FUNCTION public.deny_update();
DROP TRIGGER IF EXISTS support_sla_events_no_delete ON public.support_sla_events;
CREATE TRIGGER support_sla_events_no_delete BEFORE DELETE ON public.support_sla_events
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 12) escalation rules
CREATE TABLE IF NOT EXISTS public.support_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  trigger_type text NOT NULL,
  priority public.ticket_priority,
  category text,
  channel text,
  from_level smallint NOT NULL DEFAULT 0,
  to_level smallint NOT NULL DEFAULT 1,
  target_team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  target_user_id uuid,
  notify_manager boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_escalation_trigger CHECK (trigger_type IN ('sla_warning','sla_breach','priority','category','manual')),
  CONSTRAINT support_escalation_levels CHECK (to_level > from_level AND to_level <= 3)
);
GRANT ALL ON public.support_escalation_rules TO service_role;
ALTER TABLE public.support_escalation_rules ENABLE ROW LEVEL SECURITY;

-- 13) CSAT invitations (secure, single-use, expiring)
CREATE TABLE IF NOT EXISTS public.support_csat_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  recipient_email text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  rating smallint,
  comment text,
  staff_id uuid,
  team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_csat_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);
GRANT ALL ON public.support_csat_invitations TO service_role;
ALTER TABLE public.support_csat_invitations ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS support_csat_open_per_ticket
  ON public.support_csat_invitations (ticket_id) WHERE used_at IS NULL;

-- 14) inbound ingest ledger (idempotency for email -> ticket)
CREATE TABLE IF NOT EXISTS public.support_ticket_ingest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  email_message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ingest_outcome CHECK (outcome IN ('created','appended','skipped'))
);
GRANT ALL ON public.support_ticket_ingest TO service_role;
ALTER TABLE public.support_ticket_ingest ENABLE ROW LEVEL SECURITY;

-- 15) link email messages to tickets (column already exists) — index it
CREATE INDEX IF NOT EXISTS email_messages_ticket_idx ON public.email_messages (ticket_id);
CREATE INDEX IF NOT EXISTS email_threads_ticket_idx ON public.email_threads (ticket_id);

-- 16) updated_at triggers
DROP TRIGGER IF EXISTS support_teams_touch ON public.support_teams;
CREATE TRIGGER support_teams_touch BEFORE UPDATE ON public.support_teams
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS support_categories_touch ON public.support_categories;
CREATE TRIGGER support_categories_touch BEFORE UPDATE ON public.support_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS support_sla_policies_touch ON public.support_sla_policies;
CREATE TRIGGER support_sla_policies_touch BEFORE UPDATE ON public.support_sla_policies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS support_escalation_rules_touch ON public.support_escalation_rules;
CREATE TRIGGER support_escalation_rules_touch BEFORE UPDATE ON public.support_escalation_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS support_calendars_touch ON public.support_business_calendars;
CREATE TRIGGER support_calendars_touch BEFORE UPDATE ON public.support_business_calendars
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 17) foundation data
INSERT INTO public.support_business_calendars (code, name_ar, timezone, work_days, start_minute, end_minute)
VALUES ('ksa_default', 'ساعات العمل الرسمية — الرياض', 'Asia/Riyadh', '{0,1,2,3,4}', 480, 1020)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.support_business_calendars (code, name_ar, timezone, work_days, start_minute, end_minute)
VALUES ('ksa_24_7', 'دعم على مدار الساعة', 'Asia/Riyadh', '{0,1,2,3,4,5,6}', 0, 1440)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.support_holidays (calendar_id, holiday_date, name_ar)
SELECT c.id, d.dt, d.nm
  FROM public.support_business_calendars c
  CROSS JOIN (VALUES
    (DATE '2026-09-23', 'اليوم الوطني السعودي'),
    (DATE '2027-02-22', 'يوم التأسيس'),
    (DATE '2027-03-09', 'عيد الفطر'),
    (DATE '2027-03-10', 'عيد الفطر'),
    (DATE '2027-05-16', 'عيد الأضحى'),
    (DATE '2027-05-17', 'عيد الأضحى')
  ) AS d(dt, nm)
 WHERE c.code = 'ksa_default'
ON CONFLICT (calendar_id, holiday_date) DO NOTHING;

INSERT INTO public.support_teams (code, name_ar, description, is_default)
VALUES
  ('frontline', 'الدعم الأول', 'استلام التذاكر والرد الأولي', true),
  ('technical', 'الدعم التقني', 'المشكلات التقنية والأعطال', false),
  ('billing', 'الفوترة والاشتراكات', 'الفواتير والمدفوعات والباقات', false),
  ('escalations', 'وحدة التصعيد', 'الحالات المصعّدة وخروقات المهل', false)
ON CONFLICT (code) DO NOTHING;

UPDATE public.support_teams t
   SET escalation_team_id = (SELECT id FROM public.support_teams WHERE code = 'escalations')
 WHERE t.code IN ('frontline','technical','billing') AND t.escalation_team_id IS NULL;

UPDATE public.support_teams t
   SET mailbox_id = m.id
  FROM public.email_mailboxes m
 WHERE t.mailbox_id IS NULL
   AND ((t.code = 'billing' AND m.address LIKE 'billing@%') OR (t.code <> 'billing' AND m.address LIKE 'support@%'));

INSERT INTO public.support_sla_policies
  (code, name_ar, calendar_id, plan_code, priority, channel, category, first_response_minutes, resolution_minutes, specificity)
SELECT v.code, v.name_ar, c.id, v.plan_code, v.priority::public.ticket_priority, v.channel, v.category, v.frm, v.res, v.spec
  FROM (VALUES
    ('default',        'السياسة الافتراضية',        NULL::text, NULL::text, NULL::text, NULL::text, 240, 1440, 0),
    ('priority_high',  'أولوية عالية',              NULL,       'high',     NULL,       NULL,       120, 720,  2),
    ('priority_urgent','أولوية عاجلة',              NULL,       'urgent',   NULL,       NULL,       30,  240,  2),
    ('channel_email',  'القناة: البريد',            NULL,       NULL,       'email',    NULL,       240, 1440, 1)
  ) AS v(code, name_ar, plan_code, priority, channel, category, frm, res, spec)
  CROSS JOIN public.support_business_calendars c
 WHERE c.code = 'ksa_default'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.support_categories (code, name_ar, default_priority, sort_order)
VALUES
  ('general', 'استفسار عام', 'medium', 1),
  ('technical', 'مشكلة تقنية', 'high', 2),
  ('billing', 'الفوترة والاشتراك', 'medium', 3),
  ('feature', 'طلب ميزة', 'low', 4),
  ('account', 'الحساب والصلاحيات', 'medium', 5),
  ('data', 'البيانات والمستندات', 'high', 6)
ON CONFLICT (code) DO NOTHING;

UPDATE public.support_categories c SET default_team_id = t.id
  FROM public.support_teams t
 WHERE c.default_team_id IS NULL
   AND ((c.code IN ('technical','data') AND t.code = 'technical')
     OR (c.code = 'billing' AND t.code = 'billing')
     OR (c.code IN ('general','feature','account') AND t.code = 'frontline'));

INSERT INTO public.support_escalation_rules (name_ar, trigger_type, priority, from_level, to_level, target_team_id, sort_order)
SELECT 'تصعيد تلقائي عند خرق مهلة الحل', 'sla_breach', NULL, 0, 1, t.id, 1
  FROM public.support_teams t WHERE t.code = 'escalations'
   AND NOT EXISTS (SELECT 1 FROM public.support_escalation_rules WHERE trigger_type = 'sla_breach' AND from_level = 0);

INSERT INTO public.support_escalation_rules (name_ar, trigger_type, priority, from_level, to_level, target_team_id, sort_order)
SELECT 'تصعيد التذاكر العاجلة', 'priority', 'urgent', 0, 1, t.id, 2
  FROM public.support_teams t WHERE t.code = 'escalations'
   AND NOT EXISTS (SELECT 1 FROM public.support_escalation_rules WHERE trigger_type = 'priority' AND priority = 'urgent');

INSERT INTO public.support_tags (name_ar, color)
VALUES ('عميل مهم', 'gold'), ('عطل مؤكد', 'red'), ('يحتاج متابعة', 'amber'), ('استفسار متكرر', 'blue')
ON CONFLICT (name_ar) DO NOTHING;
