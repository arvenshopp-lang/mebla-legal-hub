-- حارس التذاكر: في مسار تقييم العميل تُثبّت كل الأعمدة من OLD ثم تُطبّق حقول التقييم فقط.
CREATE OR REPLACE FUNCTION public.support_tickets_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_rating integer;
  v_comment text;
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

  -- المسارات الخادمية الموثوقة (service role أو مالك الترحيل)
  IF auth.uid() IS NULL
     AND (coalesce(auth.role(), '') = 'service_role' OR session_user IN ('postgres', 'supabase_admin')) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF private.has_platform_permission(auth.uid(), 'tickets.reply') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  -- من هنا: العميل صاحب التذكرة، ولا يملك إلا إرسال التقييم.
  IF OLD.status <> 'closed' THEN
    RAISE EXCEPTION 'TICKET_NOT_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.rated_at IS NOT NULL THEN
    RAISE EXCEPTION 'TICKET_ALREADY_RATED' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.rating IS NULL OR NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'INVALID_RATING' USING ERRCODE = 'P0001';
  END IF;

  v_rating := NEW.rating;
  v_comment := nullif(left(btrim(coalesce(NEW.rating_comment, '')), 1000), '');

  -- تثبيت كامل: أي عمود آخر يعود إلى قيمته السابقة بغضّ النظر عمّا أُرسل.
  NEW := OLD;
  NEW.rating := v_rating;
  NEW.rating_comment := v_comment;
  NEW.rated_at := now();
  NEW.rated_staff_id := OLD.assigned_to;
  NEW.rated_staff_name := (SELECT ps.full_name FROM public.platform_staff ps WHERE ps.user_id = OLD.assigned_to);
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

-- تشديد WITH CHECK: الصف بعد التعديل يجب أن يبقى مغلقاً ومملوكاً لنفس العميل.
DROP POLICY IF EXISTS "ticket owner rates closed ticket" ON public.support_tickets;
CREATE POLICY "ticket owner rates closed ticket"
ON public.support_tickets
FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'closed'::ticket_status AND rated_at IS NULL)
WITH CHECK (user_id = auth.uid() AND status = 'closed'::ticket_status);