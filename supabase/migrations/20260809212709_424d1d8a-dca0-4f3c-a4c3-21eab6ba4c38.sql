-- 1) مرجع ملكية/إنشاء المكتب: لا يجوز أن يبقى مكتب بمرجع مالك مفقود
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_created_by_fkey;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE RESTRICT;

-- 2) سجل نشاط المكتب: تثبيت هوية الفاعل حتى بعد حذف الحساب
ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS actor_name text,
  ADD COLUMN IF NOT EXISTS actor_email text;

UPDATE public.activity_logs a
SET actor_name = p.full_name, actor_email = p.email
FROM public.profiles p
WHERE p.id = a.user_id AND a.actor_name IS NULL;

CREATE OR REPLACE FUNCTION public.activity_logs_enforce_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _name text;
  _email text;
BEGIN
  NEW.user_id := auth.uid();
  NEW.created_at := now();
  NEW.user_agent := left(coalesce(NEW.user_agent, ''), 300);
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  SELECT p.full_name, p.email INTO _name, _email
  FROM public.profiles p WHERE p.id = NEW.user_id;
  NEW.actor_name := _name;
  NEW.actor_email := _email;
  RETURN NEW;
END;
$function$;