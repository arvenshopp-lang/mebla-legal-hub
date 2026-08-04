-- تقييد تنفيذ الدوال ذات SECURITY DEFINER (Least Privilege)
DO $$
DECLARE r record;
BEGIN
  -- 1) تثبيت صلاحية المستخدمين المصادقين صراحةً قبل إلغاء الصلاحية العامة
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;

  -- 2) إلغاء الصلاحية العامة وصلاحية الزوّار عن كل دوال المخطط الخاص
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 3) دالة غير مستخدمة من الواجهة: تُقصر على service_role فقط
REVOKE ALL ON FUNCTION public.admin_service_usage_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_service_usage_summary() TO service_role;
