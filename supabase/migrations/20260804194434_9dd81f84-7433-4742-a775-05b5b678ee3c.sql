-- =========================================================================
-- Email Workspace — جداول منصة خادمية بالكامل (لا وصول مباشر من العميل)
-- =========================================================================

CREATE TABLE public.email_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  display_name text NOT NULL,
  type text NOT NULL DEFAULT 'human' CHECK (type IN ('human','system')),
  provider text NOT NULL DEFAULT 'managed',
  department_id uuid REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  is_shared boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  inbound_enabled boolean NOT NULL DEFAULT false,
  signature_html text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.email_mailboxes(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  folder text NOT NULL DEFAULT 'inbox'
    CHECK (folder IN ('inbox','sent','drafts','outbox','archive','spam','trash')),
  is_unread boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  assigned_to uuid,
  assigned_to_email text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  participants text[] NOT NULL DEFAULT '{}',
  message_count integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  previous_folder text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_threads_mailbox_folder_idx
  ON public.email_threads (mailbox_id, folder, last_activity_at DESC);
CREATE INDEX email_threads_ticket_idx ON public.email_threads (ticket_id);
CREATE INDEX email_threads_assigned_idx ON public.email_threads (assigned_to);

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  mailbox_id uuid NOT NULL REFERENCES public.email_mailboxes(id) ON DELETE CASCADE,
  message_id text NOT NULL UNIQUE,
  in_reply_to text,
  reference_ids text[] NOT NULL DEFAULT '{}',
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  kind text NOT NULL DEFAULT 'human' CHECK (kind IN ('human','system')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','queued','sending','sent','failed','bounced','received')),
  from_address text NOT NULL,
  from_name text,
  to_addresses text[] NOT NULL DEFAULT '{}',
  cc_addresses text[] NOT NULL DEFAULT '{}',
  bcc_addresses text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL DEFAULT '',
  html text,
  body_text text,
  provider text NOT NULL DEFAULT 'managed',
  provider_ref text,
  failure_ref text,
  received_at timestamptz,
  sent_at timestamptz,
  scheduled_at timestamptz,
  assigned_to uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX email_messages_provider_ref_key
  ON public.email_messages (provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX email_messages_thread_idx ON public.email_messages (thread_id, created_at);
CREATE INDEX email_messages_mailbox_status_idx ON public.email_messages (mailbox_id, status);
CREATE INDEX email_messages_search_idx
  ON public.email_messages USING gin (to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(body_text,'')));

CREATE TABLE public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_attachments_message_idx ON public.email_attachments (message_id);

CREATE TABLE public.email_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'green',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.email_thread_labels (
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.email_labels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, label_id)
);

CREATE TABLE public.email_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  author_id uuid,
  author_email text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_notes_thread_idx ON public.email_notes (thread_id, created_at);

CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.email_messages(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('scheduled','queued','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  last_error_code text,
  failure_ref text,
  scheduled_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_due_idx ON public.email_outbox (status, next_attempt_at);

CREATE TABLE public.email_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text NOT NULL,
  action text NOT NULL,
  mailbox_id uuid,
  thread_id uuid,
  message_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_audit_logs_created_idx ON public.email_audit_logs (created_at DESC);
CREATE INDEX email_audit_logs_thread_idx ON public.email_audit_logs (thread_id);

-- محدّثات الطوابع
CREATE TRIGGER email_mailboxes_updated BEFORE UPDATE ON public.email_mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_threads_updated BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_messages_updated BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_labels_updated BEFORE UPDATE ON public.email_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_outbox_updated BEFORE UPDATE ON public.email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- سجل التدقيق غير قابل للتعديل أو الحذف
CREATE TRIGGER email_audit_logs_no_update BEFORE UPDATE ON public.email_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();
CREATE TRIGGER email_audit_logs_no_delete BEFORE DELETE ON public.email_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- =========================================================================
-- الصلاحيات: خادمية فقط (مغلق افتراضاً) — لا anon ولا authenticated
-- =========================================================================
GRANT ALL ON public.email_mailboxes TO service_role;
GRANT ALL ON public.email_threads TO service_role;
GRANT ALL ON public.email_messages TO service_role;
GRANT ALL ON public.email_attachments TO service_role;
GRANT ALL ON public.email_labels TO service_role;
GRANT ALL ON public.email_thread_labels TO service_role;
GRANT ALL ON public.email_notes TO service_role;
GRANT ALL ON public.email_outbox TO service_role;
GRANT ALL ON public.email_audit_logs TO service_role;

ALTER TABLE public.email_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_thread_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_audit_logs ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- الصناديق الرسمية
-- =========================================================================
INSERT INTO public.email_mailboxes (address, display_name, type, is_shared, inbound_enabled, sort_order)
VALUES
  ('support@mehlalex.com', 'الدعم الفني',      'human',  true,  false, 1),
  ('sales@mehlalex.com',   'المبيعات',          'human',  true,  false, 2),
  ('billing@mehlalex.com', 'الفوترة',           'human',  true,  false, 3),
  ('legal@mehlalex.com',   'الشؤون القانونية',  'human',  true,  false, 4),
  ('info@mehlalex.com',    'الاستفسارات العامة','human',  true,  false, 5),
  ('noreply@mehlalex.com', 'رسائل النظام',      'system', false, false, 6);

INSERT INTO public.email_labels (name_ar, color) VALUES
  ('عاجل', 'red'),
  ('متابعة', 'amber'),
  ('مكتمل', 'green');