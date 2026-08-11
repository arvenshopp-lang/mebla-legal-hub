CREATE OR REPLACE FUNCTION private.documents_enforce_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  -- هوية المستدعي تُشتق من دور الطلب الفعلي، لا من current_user
  -- (داخل SECURITY DEFINER يكون current_user مالك الدالة وليس المستدعي).
  v_request_role text;
  v_has_request_context boolean;
  v_is_service_role boolean;
  v_is_privileged boolean;
BEGIN
  v_request_role := coalesce(
    nullif(btrim(current_setting('request.jwt.claim.role', true)), ''),
    nullif(
      btrim(
        coalesce(
          (nullif(btrim(current_setting('request.jwt.claims', true)), '')::jsonb) ->> 'role',
          ''
        )
      ),
      ''
    ),
    ''
  );

  v_has_request_context := v_request_role <> '';
  v_is_service_role := v_request_role = 'service_role';

  -- fallback آمن: عند غياب سياق الطلب تماماً (صيانة إدارية عبر psql) نعتمد
  -- session_user وهو دور المستدعي الحقيقي ولا يتأثر بـ SECURITY DEFINER.
  v_is_privileged := v_is_service_role
    OR (NOT v_has_request_context AND session_user IN ('postgres', 'supabase_admin'));

  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'مستند بدون مكتب غير مسموح.';
  END IF;

  IF NEW.file_path IS NULL
     OR btrim(NEW.file_path) = ''
     OR NEW.file_path <> btrim(NEW.file_path)
     OR length(NEW.file_path) > 400
     OR NEW.file_path LIKE '/%'
     OR position('..' IN NEW.file_path) > 0
     OR position('//' IN NEW.file_path) > 0
     OR left(NEW.file_path, 37) <> (NEW.organization_id::text || '/')
  THEN
    RAISE EXCEPTION 'مسار ملف غير صالح لهذا المكتب.';
  END IF;

  IF NEW.case_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = NEW.case_id AND c.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'القضية المحددة لا تنتمي إلى هذا المكتب.';
  END IF;

  IF NEW.client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients cl
    WHERE cl.id = NEW.client_id AND cl.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'العميل المحدد لا ينتمي إلى هذا المكتب.';
  END IF;

  IF TG_OP = 'UPDATE' AND NOT v_is_privileged THEN
    IF NEW.file_path IS DISTINCT FROM OLD.file_path
       OR NEW.file_type IS DISTINCT FROM OLD.file_type
       OR NEW.file_size IS DISTINCT FROM OLD.file_size
       OR NEW.storage_verified_at IS DISTINCT FROM OLD.storage_verified_at
       OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    THEN
      RAISE EXCEPTION 'لا يمكن تعديل بيانات الملف المخزّن؛ التعديل مقصور على البيانات الوصفية.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.documents_enforce_integrity() FROM PUBLIC;

DROP TRIGGER IF EXISTS documents_enforce_integrity ON public.documents;
CREATE TRIGGER documents_enforce_integrity
BEFORE INSERT OR UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION private.documents_enforce_integrity();

CREATE UNIQUE INDEX IF NOT EXISTS documents_file_path_unique ON public.documents (file_path);