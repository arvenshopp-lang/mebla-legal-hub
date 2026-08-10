CREATE OR REPLACE FUNCTION private.work_item_emit_event(
  p_payload jsonb,
  p_title text,
  p_op text,
  p_table text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $fn$
DECLARE
  v_event text := p_payload ->> 'event';
  v_ref text;
BEGIN
  BEGIN
    -- حقن عطل مضبوط لبيانات الاختبار فقط:
    -- QA-WIE-FAULT…            → فشل التقاط جميع الأحداث
    -- …QA-WIE-FAIL[due_changed] → فشل التقاط نوع حدث واحد فقط
    IF coalesce(p_title, '') LIKE 'QA-WIE-FAULT%'
       OR coalesce(p_title, '') LIKE ('%QA-WIE-FAIL[' || v_event || ']%') THEN
      RAISE EXCEPTION 'QA fault injection: work_item_events capture rejected for event %', v_event
        USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.work_item_events
      (organization_id, item_type, item_id, event, actor_id,
       from_user_id, to_user_id, from_due_date, to_due_date, metadata)
    VALUES (
      (p_payload ->> 'organization_id')::uuid,
      p_payload ->> 'item_type',
      (p_payload ->> 'item_id')::uuid,
      v_event,
      NULLIF(p_payload ->> 'actor_id', '')::uuid,
      NULLIF(p_payload ->> 'from_user_id', '')::uuid,
      NULLIF(p_payload ->> 'to_user_id', '')::uuid,
      NULLIF(p_payload ->> 'from_due_date', '')::timestamptz,
      NULLIF(p_payload ->> 'to_due_date', '')::timestamptz,
      coalesce(p_payload -> 'metadata', '{}'::jsonb)
    );

  EXCEPTION WHEN OTHERS THEN
    v_ref := 'WIE-' || upper(substr(md5(
      coalesce(p_payload ->> 'item_id', '') || coalesce(v_event, '') || clock_timestamp()::text
    ), 1, 10));
    BEGIN
      INSERT INTO public.system_failures
        (ref, surface, action, error_code, error_message, organization_id, user_id, metadata)
      VALUES (
        v_ref,
        'work_items',
        'work_item_events.capture',
        SQLSTATE,
        left(coalesce(SQLERRM, 'unknown error'), 2000),
        NULLIF(p_payload ->> 'organization_id', '')::uuid,
        NULLIF(p_payload ->> 'actor_id', '')::uuid,
        jsonb_build_object(
          'trigger_op', p_op,
          'source_table', p_table,
          'item_type', p_payload ->> 'item_type',
          'item_id', p_payload ->> 'item_id',
          'event', v_event
        )
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RAISE WARNING 'work_item_events capture failed (%): % [%]', v_ref, SQLERRM, SQLSTATE;
  END;
END;
$fn$;

REVOKE ALL ON FUNCTION private.work_item_emit_event(jsonb, text, text, text) FROM PUBLIC;

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
  v_title text;
  v_base jsonb;
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

  v_title := coalesce(v_new ->> 'title', v_old ->> 'title', '');
  v_base := jsonb_build_object(
    'organization_id', v_org,
    'item_type', v_type,
    'item_id', v_item,
    'actor_id', v_actor
  );

  IF TG_OP = 'INSERT' THEN
    PERFORM private.work_item_emit_event(
      v_base || jsonb_build_object(
        'event', 'created',
        'to_user_id', v_new_owner,
        'to_due_date', NEW.due_date,
        'metadata', jsonb_build_object('created_by', NEW.created_by, 'status', NEW.status)
      ), v_title, TG_OP, TG_TABLE_NAME);

    IF NEW.status = 'completed' THEN
      PERFORM private.work_item_emit_event(
        v_base || jsonb_build_object(
          'event', 'completed',
          'to_user_id', v_new_owner,
          'to_due_date', NEW.due_date
        ), v_title, TG_OP, TG_TABLE_NAME);
    END IF;

  ELSIF TG_OP = 'DELETE' THEN
    PERFORM private.work_item_emit_event(
      v_base || jsonb_build_object(
        'event', 'deleted',
        'from_user_id', v_old_owner,
        'from_due_date', OLD.due_date,
        'metadata', jsonb_build_object('status', OLD.status, 'completed_at', OLD.completed_at, 'title', OLD.title)
      ), v_title, TG_OP, TG_TABLE_NAME);

  ELSE
    IF v_old_owner IS DISTINCT FROM v_new_owner THEN
      PERFORM private.work_item_emit_event(
        v_base || jsonb_build_object(
          'event', 'assigned',
          'from_user_id', v_old_owner,
          'to_user_id', v_new_owner,
          'to_due_date', NEW.due_date
        ), v_title, TG_OP, TG_TABLE_NAME);
    END IF;

    IF OLD.due_date IS DISTINCT FROM NEW.due_date THEN
      PERFORM private.work_item_emit_event(
        v_base || jsonb_build_object(
          'event', 'due_changed',
          'to_user_id', v_new_owner,
          'from_due_date', OLD.due_date,
          'to_due_date', NEW.due_date,
          'metadata', jsonb_build_object(
            'actor_role', private.get_user_role(NEW.organization_id, v_actor),
            'was_overdue', (OLD.due_date IS NOT NULL AND OLD.due_date < now() AND OLD.status::text <> 'completed')
          )
        ), v_title, TG_OP, TG_TABLE_NAME);
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status THEN
      IF NEW.status = 'completed' THEN
        PERFORM private.work_item_emit_event(
          v_base || jsonb_build_object(
            'event', 'completed',
            'to_user_id', v_new_owner,
            'to_due_date', NEW.due_date,
            'metadata', jsonb_build_object('completed_at', NEW.completed_at)
          ), v_title, TG_OP, TG_TABLE_NAME);
      ELSIF OLD.status = 'completed' THEN
        PERFORM private.work_item_emit_event(
          v_base || jsonb_build_object(
            'event', 'reopened',
            'to_user_id', v_new_owner,
            'to_due_date', NEW.due_date,
            'metadata', jsonb_build_object('previous_completed_at', OLD.completed_at, 'new_status', NEW.status)
          ), v_title, TG_OP, TG_TABLE_NAME);
      ELSIF NEW.status = 'cancelled' THEN
        PERFORM private.work_item_emit_event(
          v_base || jsonb_build_object(
            'event', 'cancelled',
            'to_user_id', v_new_owner,
            'to_due_date', NEW.due_date,
            'metadata', jsonb_build_object('was_overdue', (OLD.due_date IS NOT NULL AND OLD.due_date < now()))
          ), v_title, TG_OP, TG_TABLE_NAME);
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;