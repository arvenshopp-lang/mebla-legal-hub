CREATE OR REPLACE FUNCTION private.work_item_capture_events()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $fn$
DECLARE
  v_type text := CASE TG_TABLE_NAME WHEN 'tasks' THEN 'task' ELSE 'deadline' END;
  v_owner_field text := CASE TG_TABLE_NAME WHEN 'tasks' THEN 'assigned_to' ELSE 'responsible_user_id' END;
  v_actor uuid := auth.uid();
  v_new jsonb;
  v_old jsonb;
  v_new_owner uuid;
  v_old_owner uuid;
  v_org uuid;
  v_item uuid;
  v_ref text;
BEGIN
  IF TG_OP <> 'DELETE' THEN
    v_new := to_jsonb(NEW);
    v_new_owner := NULLIF(v_new ->> v_owner_field, '')::uuid;
    v_org := NEW.organization_id;
    v_item := NEW.id;
  END IF;
  IF TG_OP <> 'INSERT' THEN
    v_old := to_jsonb(OLD);
    v_old_owner := NULLIF(v_old ->> v_owner_field, '')::uuid;
    IF TG_OP = 'DELETE' THEN
      v_org := OLD.organization_id;
      v_item := OLD.id;
    END IF;
  END IF;

  BEGIN
    -- حقن عطل مضبوط لبيانات الاختبار فقط: يحاكي رفض الكتابة في سجل الأحداث
    IF coalesce(v_new ->> 'title', v_old ->> 'title', '') LIKE 'QA-WIE-FAULT%' THEN
      RAISE EXCEPTION 'QA fault injection: work_item_events capture rejected'
        USING ERRCODE = '42501';
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

    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO public.work_item_events
        (organization_id, item_type, item_id, event, actor_id, from_user_id, from_due_date, metadata)
      VALUES (OLD.organization_id, v_type, OLD.id, 'deleted', v_actor, v_old_owner, OLD.due_date,
              jsonb_build_object('status', OLD.status, 'completed_at', OLD.completed_at, 'title', OLD.title));

    ELSE
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
    END IF;

  EXCEPTION WHEN OTHERS THEN
    -- لا نُفشل تحديث المهمة/المهلة بسبب فشل التقاط الحدث؛ نُسجّل العطل فقط
    v_ref := 'WIE-' || upper(substr(md5(coalesce(v_item::text, '') || clock_timestamp()::text), 1, 10));
    BEGIN
      INSERT INTO public.system_failures
        (ref, surface, action, error_code, error_message, organization_id, user_id, metadata)
      VALUES (
        v_ref,
        'work_items',
        'work_item_events.capture',
        SQLSTATE,
        left(coalesce(SQLERRM, 'unknown error'), 2000),
        v_org,
        v_actor,
        jsonb_build_object(
          'trigger_op', TG_OP,
          'source_table', TG_TABLE_NAME,
          'item_type', v_type,
          'item_id', v_item
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RAISE WARNING 'work_item_events capture failed (%): % [%]', v_ref, SQLERRM, SQLSTATE;
  END;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;