CREATE OR REPLACE FUNCTION private.work_item_capture_events()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_type text := CASE TG_TABLE_NAME WHEN 'tasks' THEN 'task' ELSE 'deadline' END;
  v_owner_field text := CASE TG_TABLE_NAME WHEN 'tasks' THEN 'assigned_to' ELSE 'responsible_user_id' END;
  v_actor uuid := auth.uid();
  v_new jsonb;
  v_old jsonb;
  v_new_owner uuid;
  v_old_owner uuid;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new := to_jsonb(NEW);
    v_new_owner := NULLIF(v_new ->> v_owner_field, '')::uuid;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old := to_jsonb(OLD);
    v_old_owner := NULLIF(v_old ->> v_owner_field, '')::uuid;
  END IF;

  IF TG_OP = 'INSERT' THEN
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
    INSERT INTO public.work_item_events
      (organization_id, item_type, item_id, event, actor_id, from_user_id, from_due_date, metadata)
    VALUES (OLD.organization_id, v_type, OLD.id, 'deleted', v_actor, v_old_owner, OLD.due_date,
            jsonb_build_object('status', OLD.status, 'completed_at', OLD.completed_at, 'title', OLD.title));
    RETURN OLD;
  END IF;

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
              'was_overdue', (OLD.due_date IS NOT NULL AND OLD.due_date < now() AND OLD.status::text <> 'completed')
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