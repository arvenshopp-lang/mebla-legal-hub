-- ============================================================================
-- تحصين سجلات التدقيق والأمن السيبراني لمنصة مِهلة القانونية (Saudi NCA & PDPL Hardening)
-- 1. فرض الحصانة الجنائية الكاملة (منع التعديل والحذف) على كافة جداول التدقيق والوصول.
-- 2. تفعيل ملحق pgcrypto للتشفير المتقدم.
-- ============================================================================

-- تفعيل ملحق التشفير
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- (1) تحصين جدول activity_logs
DROP TRIGGER IF EXISTS activity_logs_no_update ON public.activity_logs;
CREATE TRIGGER activity_logs_no_update
BEFORE UPDATE ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS activity_logs_no_delete ON public.activity_logs;
CREATE TRIGGER activity_logs_no_delete
BEFORE DELETE ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- (2) تحصين جدول pii_access_logs (سجلات الوصول للهويات الوطنية والبيانات الشخصية)
DROP TRIGGER IF EXISTS pii_access_logs_no_update ON public.pii_access_logs;
CREATE TRIGGER pii_access_logs_no_update
BEFORE UPDATE ON public.pii_access_logs
FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS pii_access_logs_no_delete ON public.pii_access_logs;
CREATE TRIGGER pii_access_logs_no_delete
BEFORE DELETE ON public.pii_access_logs
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- (3) تحصين جدول print_audit_logs (سجلات طباعة وتصدير المستندات)
DROP TRIGGER IF EXISTS print_audit_logs_no_update ON public.print_audit_logs;
CREATE TRIGGER print_audit_logs_no_update
BEFORE UPDATE ON public.print_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS print_audit_logs_no_delete ON public.print_audit_logs;
CREATE TRIGGER print_audit_logs_no_delete
BEFORE DELETE ON public.print_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- (4) تحصين جدول document_access_logs (سجلات فتح وتنزيل ومشاركة المستندات)
DROP TRIGGER IF EXISTS document_access_logs_no_update ON public.document_access_logs;
CREATE TRIGGER document_access_logs_no_update
BEFORE UPDATE ON public.document_access_logs
FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS document_access_logs_no_delete ON public.document_access_logs;
CREATE TRIGGER document_access_logs_no_delete
BEFORE DELETE ON public.document_access_logs
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();
