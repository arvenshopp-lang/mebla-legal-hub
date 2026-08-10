-- ============================================================
-- FEATURE 02 — سجل أحداث الأعمال (KPI historical baseline)
-- ============================================================

CREATE TABLE public.work_item_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('task', 'deadline')),
  item_id uuid NOT NULL,
  event text NOT NULL CHECK (event IN ('baseline','created','assigned','due_changed','completed','reopened','cancelled','deleted')),
  actor_id uuid,
  from_user_id uuid,
  to_user_id uuid,
  from_due_date timestamptz,
  to_due_date timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT SELECT ON public.work_item_events TO authenticated;
GRANT ALL ON public.work_item_events TO service_role;

ALTER TABLE public.work_item_events ENABLE ROW LEVEL SECURITY;

-- القراءة للمالك والمدير فقط وداخل مكتبهم؛ لا كتابة ولا تعديل ولا حذف من أي عميل.
CREATE POLICY work_item_events_select_managers ON public.work_item_events
  FOR SELECT TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));

-- عدم القابلية للتعديل أو الحذف حتى عبر أي مسار مستقبلي.
CREATE OR REPLACE FUNCTION private.work_item_events_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'سجل أحداث الأعمال غير قابل للتعديل أو الحذف.';
END;
$$;

CREATE TRIGGER work_item_events_no_update
  BEFORE UPDATE OR DELETE ON public.work_item_events
  FOR EACH ROW EXECUTE FUNCTION private.work_item_events_immutable();

-- ============================================================
-- تثبيت وقت الإنجاز خادمياً (منع Backdating)
-- ============================================================

CREATE OR REPLACE FUNCTION private.work_item_authoritative_completion()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'completed' THEN
      NEW.completed_at := now();
    ELSE
      NEW.completed_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.status = 'completed' AND OLD.status <> 'completed' THEN
    NEW.completed_at := now();
  ELSIF NEW.status = 'completed' AND OLD.status = 'completed' THEN
    -- لا يُقبل تغيير وقت إنجاز قائم من العميل.
    NEW.completed_at := OLD.completed_at;
  ELSE
    NEW.completed_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_authoritative_completion
  BEFORE INSERT OR UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION private.work_item_authoritative_completion();

CREATE TRIGGER deadlines_authoritative_completion
  BEFORE INSERT OR UPDATE ON public.deadlines
  FOR EACH ROW EXECUTE FUNCTION private.work_item_authoritative_completion();

-- ============================================================
-- التقاط الأحداث
-- ============================================================

CREATE OR REPLACE FUNCTION private.work_item_capture_events()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type text := CASE TG_TABLE_NAME WHEN 'tasks' THEN 'task' ELSE 'deadline' END;
  v_actor uuid := auth.uid();
  v_new_owner uuid;
  v_old_owner uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_new_owner := CASE v_type WHEN 'task' THEN NEW.assigned_to ELSE NEW.responsible_user_id END;
    INSERT INTO public.work_item_events
      (organization_id, item_type, item_id, event, actor_id, to_user_id, to_due_date, metadata)
    VALUES (NEW.organization_id, v_type, NEW.id, 'created', v_actor, v_new_owner, NEW.due_date,
            jsonb_build_object('created_by', NEW.created_by, 'status', NEW.status));
    IF NEW.status = 'completed' THEN
      INSERT INTO public.work_item_events
        (organization_id, item_type, item_id, event, actor_id, to_user_id, to_due_date)
      VALUES (NEW.organization_id, v_type, NEW.id, 'completed', v_actor, v_new_owner, NEW.due_date);
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old_owner := CASE v_type WHEN 'task' THEN OLD.assigned_to ELSE OLD.responsible_user_id END;
    INSERT INTO public.work_item_events
      (organization_id, item_type, item_id, event, actor_id, from_user_id, from_due_date, metadata)
    VALUES (OLD.organization_id, v_type, OLD.id, 'deleted', v_actor, v_old_owner, OLD.due_date,
            jsonb_build_object('status', OLD.status, 'completed_at', OLD.completed_at, 'title', OLD.title));
    RETURN OLD;
  END IF;

  v_old_owner := CASE v_type WHEN 'task' THEN OLD.assigned_to ELSE OLD.responsible_user_id END;
  v_new_owner := CASE v_type WHEN 'task' THEN NEW.assigned_to ELSE NEW.responsible_user_id END;

  IF v_old_owner IS DISTINCT FROM v_new_owner THEN
    INSERT INTO public.work_item_events
      (organization_id, item_type, item_id, event, actor_id, from_user_id, to_user_id, to_due_date)
    VALUES (NEW.organization_id, v_type, NEW.id, 'assigned', v_actor, v_old_owner, v_new_owner, NEW.due_date);
  END IF;

  IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
    INSERT INTO public.work_item_events
      (organization_id, item_type, item_id, event, actor_id, to_user_id, from_due_date, to_due_date, metadata)
    VALUES (NEW.organization_id, v_type, NEW.id, 'due_changed', v_actor, v_new_owner, OLD.due_date, NEW.due_date,
            jsonb_build_object(
              'actor_role', private.get_user_role(NEW.organization_id, v_actor),
              'was_overdue', (OLD.due_date IS NOT NULL AND OLD.due_date < now() AND OLD.status <> 'completed')
            ));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'completed' THEN
      INSERT INTO public.work_item_events
        (organization_id, item_type, item_id, event, actor_id, to_user_id, to_due_date, metadata)
      VALUES (NEW.organization_id, v_type, NEW.id, 'completed', v_actor, v_new_owner, NEW.due_date,
              jsonb_build_object('completed_at', NEW.completed_at));
    ELSIF OLD.status = 'completed' THEN
      INSERT INTO public.work_item_events
        (organization_id, item_type, item_id, event, actor_id, to_user_id, to_due_date, metadata)
      VALUES (NEW.organization_id, v_type, NEW.id, 'reopened', v_actor, v_new_owner, NEW.due_date,
              jsonb_build_object('previous_completed_at', OLD.completed_at, 'new_status', NEW.status));
    ELSIF NEW.status = 'cancelled' THEN
      INSERT INTO public.work_item_events
        (organization_id, item_type, item_id, event, actor_id, to_user_id, to_due_date, metadata)
      VALUES (NEW.organization_id, v_type, NEW.id, 'cancelled', v_actor, v_new_owner, NEW.due_date,
              jsonb_build_object('was_overdue', (OLD.due_date IS NOT NULL AND OLD.due_date < now())));
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_capture_events
  AFTER INSERT OR UPDATE OR DELETE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION private.work_item_capture_events();

CREATE TRIGGER deadlines_capture_events
  AFTER INSERT OR UPDATE OR DELETE ON public.deadlines
  FOR EACH ROW EXECUTE FUNCTION private.work_item_capture_events();

-- ============================================================
-- خط الأساس: الحالة المعروفة عند تشغيل الميزة فقط (بلا اختراع تاريخ)
-- ============================================================

INSERT INTO public.work_item_events
  (organization_id, item_type, item_id, event, to_user_id, to_due_date, occurred_at, metadata)
SELECT t.organization_id, 'task', t.id, 'baseline', t.assigned_to, t.due_date, now(),
       jsonb_build_object('status', t.status, 'completed_at', t.completed_at, 'created_at', t.created_at)
FROM public.tasks t;

INSERT INTO public.work_item_events
  (organization_id, item_type, item_id, event, to_user_id, to_due_date, occurred_at, metadata)
SELECT d.organization_id, 'deadline', d.id, 'baseline', d.responsible_user_id, d.due_date, now(),
       jsonb_build_object('status', d.status, 'completed_at', d.completed_at, 'created_at', d.created_at)
FROM public.deadlines d;

-- ============================================================
-- الفهارس
-- ============================================================

CREATE INDEX idx_wie_org_item ON public.work_item_events (organization_id, item_type, item_id, occurred_at);
CREATE INDEX idx_wie_org_user ON public.work_item_events (organization_id, to_user_id, occurred_at);
CREATE INDEX idx_wie_org_event ON public.work_item_events (organization_id, event, occurred_at);
CREATE INDEX idx_tasks_org_assigned_due ON public.tasks (organization_id, assigned_to, due_date);
CREATE INDEX idx_tasks_org_completed ON public.tasks (organization_id, completed_at);
CREATE INDEX idx_deadlines_org_resp_due ON public.deadlines (organization_id, responsible_user_id, due_date);
CREATE INDEX idx_deadlines_org_completed ON public.deadlines (organization_id, completed_at);