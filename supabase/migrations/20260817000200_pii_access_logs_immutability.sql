-- ==============================================================================
-- MEHLA — تعزيز حصانة وحظر تعديل/حذف سجلات الوصول للبيانات الحساسة (PII Access Logs Immutability)
--
-- الغرض: تطبيق محفزات عدم القابلية للتغيير وسحب الصلاحيات الزائدة على pii_access_logs
-- لمطابقة معايير admin_audit_logs و case_party_audit_logs وتحقيق دفاع متعدد الطبقات (Defense in Depth).
--
-- القواعد:
--  1) حظر أي محاولة UPDATE عبر محفز deny_update().
--  2) حظر أي محاولة DELETE عبر محفز deny_hard_delete().
--  3) سحب صلاحيات UPDATE و DELETE من أدوار authenticated و service_role (Defense in Depth).
--  4) حصر الصلاحيات في INSERT و SELECT فقط.
-- ==============================================================================

-- 1. حظر التعديل التام على سجلات PII (Immutable Triggers)
DROP TRIGGER IF EXISTS pii_access_logs_immutable ON public.pii_access_logs;
CREATE TRIGGER pii_access_logs_immutable
  BEFORE UPDATE ON public.pii_access_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();

-- 2. حظر الحذف التام على سجلات PII (No Delete Triggers)
DROP TRIGGER IF EXISTS pii_access_logs_no_delete ON public.pii_access_logs;
CREATE TRIGGER pii_access_logs_no_delete
  BEFORE DELETE ON public.pii_access_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 3. سحب صلاحيات التعديل والحذف على مستوى قاعدة البيانات (Defense in Depth Revocation)
REVOKE UPDATE, DELETE ON public.pii_access_logs FROM authenticated, service_role;

-- 4. توثيق سياسة الحصانة في قاعدة البيانات
COMMENT ON TABLE public.pii_access_logs IS 'سجل تدقيق الوصول للبيانات الشخصية الحساسة (PII Access Logs) — سجل حصين وغير قابل للتعديل أو الحذف نهائياً (Append-Only Immutable Audit Log).';
