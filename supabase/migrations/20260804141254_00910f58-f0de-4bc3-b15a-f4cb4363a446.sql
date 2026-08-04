-- تقييد استدعاء دالة المؤشرات الإدارية (SECURITY DEFINER) على المستخدمين المسجّلين فقط.
-- الدالة تتحقق داخلياً من كون المستدعي من فريق المنصة، والآن لم تصبح قابلة للاستدعاء
-- من الزوار غير المسجّلين (anon) عبر واجهة البيانات مطلقاً.
REVOKE ALL ON FUNCTION public.admin_platform_metrics(timestamp with time zone, timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_platform_metrics(timestamp with time zone, timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_metrics(timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_metrics(timestamp with time zone, timestamp with time zone) TO service_role;