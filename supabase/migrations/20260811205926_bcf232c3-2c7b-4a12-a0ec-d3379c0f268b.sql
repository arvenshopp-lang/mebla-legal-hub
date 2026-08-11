-- 1) منع أي إدراج مباشر من المتصفح لجدول المستندات
DROP POLICY IF EXISTS docs_insert ON public.documents;
REVOKE INSERT ON public.documents FROM authenticated;

-- 2) حماية على مستوى القاعدة لمسار الملف والعلاقات المتقاطعة والحقول غير القابلة للتعديل
CREATE OR REPLACE FUNCTION private.documents_enforce_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
DECLARE
  v_is_privileged boolean := current_user IN ('service_role', 'postgres', 'supabase_admin');
BEGIN
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

-- 3) تثبيت منع تكرار مسار الملف
CREATE UNIQUE INDEX IF NOT EXISTS documents_file_path_unique ON public.documents (file_path);