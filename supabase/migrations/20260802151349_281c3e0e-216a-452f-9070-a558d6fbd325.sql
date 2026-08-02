ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS rating_comment text,
  ADD COLUMN IF NOT EXISTS rated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rated_staff_id uuid,
  ADD COLUMN IF NOT EXISTS rated_staff_name text;

CREATE OR REPLACE FUNCTION public.support_tickets_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.user_id := coalesce(auth.uid(), NEW.user_id);
    NEW.reference := coalesce(nullif(btrim(NEW.reference), ''),
      'TK-' || to_char(now(), 'YYMMDD') || '-' || lpad((floor(random() * 100000))::int::text, 5, '0'));
    NEW.status := 'new';
    NEW.rating := NULL; NEW.rating_comment := NULL; NEW.rated_at := NULL;
    NEW.rated_staff_id := NULL; NEW.rated_staff_name := NULL;
    NEW.last_reply_at := now();
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
$$;

DROP TRIGGER IF EXISTS support_tickets_guard_ins ON public.support_tickets;
CREATE TRIGGER support_tickets_guard_ins
BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_guard();

DROP TRIGGER IF EXISTS support_tickets_guard_upd ON public.support_tickets;
CREATE TRIGGER support_tickets_guard_upd
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_guard();

DROP POLICY IF EXISTS "ticket owner rates closed ticket" ON public.support_tickets;
CREATE POLICY "ticket owner rates closed ticket"
ON public.support_tickets FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status = 'closed' AND rated_at IS NULL)
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.support_ticket_messages_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status ticket_status;
BEGIN
  SELECT status INTO v_status FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.is_staff = false AND v_status = 'closed' THEN
    RAISE EXCEPTION 'TICKET_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  NEW.body := btrim(NEW.body);
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_messages_guard_ins ON public.support_ticket_messages;
CREATE TRIGGER support_ticket_messages_guard_ins
BEFORE INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.support_ticket_messages_guard();

CREATE OR REPLACE FUNCTION public.support_ticket_messages_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ticket public.support_tickets; v_org uuid;
BEGIN
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF v_ticket.id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.support_tickets
     SET last_reply_at = NEW.created_at,
         status = CASE WHEN NEW.is_staff THEN status
                       WHEN status = 'closed' THEN status
                       ELSE 'new'::ticket_status END,
         updated_at = now()
   WHERE id = NEW.ticket_id;

  IF NEW.is_staff THEN
    v_org := coalesce(v_ticket.organization_id, (
      SELECT m.organization_id FROM public.organization_members m
      WHERE m.user_id = v_ticket.user_id AND m.status = 'active'
      ORDER BY m.created_at LIMIT 1));
    IF v_org IS NOT NULL THEN
      INSERT INTO public.notifications (organization_id, user_id, type, title, message)
      VALUES (v_org, v_ticket.user_id, 'support_reply',
              'رد جديد على تذكرة الدعم ' || v_ticket.reference,
              left(NEW.body, 300));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_messages_after_ins ON public.support_ticket_messages;
CREATE TRIGGER support_ticket_messages_after_ins
AFTER INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.support_ticket_messages_after_insert();

REVOKE ALL ON FUNCTION public.support_tickets_guard() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.support_ticket_messages_guard() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.support_ticket_messages_after_insert() FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_ticket_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;