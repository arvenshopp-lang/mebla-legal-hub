-- 1) دالة SECURITY DEFINER لا يجب أن تكون قابلة للتنفيذ من الزوّار
REVOKE ALL ON FUNCTION public.my_case_party_permissions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_case_party_permissions(uuid) TO authenticated;

-- 2) أطراف القضية: بيانات PII — لا وصول للزوّار إطلاقاً (السياسات كلها authenticated أصلاً)
REVOKE ALL ON TABLE public.case_parties FROM anon;

-- 3) جداول التتبّع العام: إغلاق كامل عبر الـ Data API، الوصول عبر الخادم الموثوق فقط
REVOKE ALL ON TABLE public.case_code_registry FROM anon, authenticated;
REVOKE ALL ON TABLE public.case_lookup_attempts FROM anon, authenticated;
GRANT ALL ON TABLE public.case_code_registry TO service_role;
GRANT ALL ON TABLE public.case_lookup_attempts TO service_role;

ALTER TABLE public.case_code_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_lookup_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.case_code_registry IS
  'سجل رموز متابعة القضايا. مغلق بالكامل عبر الـ Data API (RLS مفعّل بدون سياسات ولا منح للزوّار/الأعضاء)؛ الوصول عبر منطق الخادم الموثوق فقط.';
COMMENT ON TABLE public.case_lookup_attempts IS
  'محاولات البحث العام عن القضايا لأغراض تحديد المعدل. مغلق بالكامل عبر الـ Data API؛ الوصول عبر منطق الخادم الموثوق فقط.';