CREATE OR REPLACE FUNCTION private.document_requests_enforce_case_org()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = private, public, pg_temp
AS $$
BEGIN
  IF NEW.organization_id IS NULL THEN
    RAISE EXCEPTION 'طلب رفع بدون مكتب غير مسموح.';
  END IF;

  IF NEW.case_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = NEW.case_id AND c.organization_id = NEW.organization_id
  ) THEN
    RAISE EXCEPTION 'القضية المحددة غير موجودة أو لا تنتمي إلى هذا المكتب.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS doc_requests_enforce_case_org ON public.document_requests;
CREATE TRIGGER doc_requests_enforce_case_org
BEFORE INSERT OR UPDATE ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION private.document_requests_enforce_case_org();