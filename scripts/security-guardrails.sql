-- ============================================================================
-- حرّاس الأمان الآليون — طبقة قاعدة البيانات (مِهلة)
-- يُنفَّذ كاستعلام قراءة فقط. أي صف يرجع = مخالفة تُفشل الفحص.
-- التشغيل: انسخ الملف إلى منفّذ SQL للقراءة، أو استخدم bun scripts/security-guardrails.ts
--          الذي يقرأ هذا الملف ويشغّله عند توفّر اتصال قاعدة بيانات.
-- ============================================================================

WITH
-- (1) قائمة الدوال المسموح استدعاؤها من authenticated (موثّقة في docs/security-guardrails.md)
allowed_authenticated_rpc(proname) AS (
  VALUES
    ('admin_activity_overview'),
    ('admin_growth_series'),
    ('admin_jobs_overview'),
    ('admin_platform_metrics'),
    ('admin_service_health'),
    ('billing_match_reconciliation'),
    ('billing_reopen_period'),
    ('billing_reports'),
    ('billing_save_draft'),
    ('consume_ocr_pages'),
    ('create_organization_with_owner'),
    ('my_case_party_permissions'),
    ('my_subscription_overview'),
    ('print_copy_number'),
    ('recalc_invoice'),
    ('record_metered_usage')
),

-- (2) جداول مسموح بقاء وصول anon إليها للقراءة العامة فقط
public_read_tables(relname) AS (
  VALUES ('platform_plans'), ('platform_settings'), ('platform_content_pages')
),

-- ---------------------------------------------------------------------------
-- فحص 1: دالة SECURITY DEFINER قابلة للتنفيذ من anon أو PUBLIC
-- ---------------------------------------------------------------------------
v_secdef_anon AS (
  SELECT
    'secdef_executable_by_anon' AS check_id,
    n.nspname || '.' || p.proname AS object_name,
    'دالة SECURITY DEFINER قابلة للتنفيذ من anon/PUBLIC — يجب REVOKE EXECUTE FROM anon, PUBLIC' AS detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('public', 'private')
    AND p.prosecdef
    AND (
      has_function_privilege('anon', p.oid, 'EXECUTE')
      OR EXISTS (
        SELECT 1 FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
        WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      )
    )
),

-- ---------------------------------------------------------------------------
-- فحص 2: RPC جديدة قابلة للاستدعاء من authenticated بدون إدراجها في القائمة الموثّقة
-- (الدوال المُستخدمة كـ triggers مستثناة لأنها لا تُستدعى مباشرة عبر الـ API)
-- ---------------------------------------------------------------------------
v_undocumented_rpc AS (
  SELECT
    'undocumented_authenticated_rpc' AS check_id,
    'public.' || p.proname AS object_name,
    'دالة قابلة للاستدعاء من authenticated وغير موثّقة في docs/security-guardrails.md — وثّقها أو ألغِ صلاحية التنفيذ' AS detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND pg_get_function_result(p.oid) <> 'trigger'
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.prosecdef
    AND p.proname NOT IN (SELECT proname FROM allowed_authenticated_rpc)
),

-- ---------------------------------------------------------------------------
-- فحص 3: دالة موثّقة لكنها لا تفحص auth.uid() داخلياً
-- ---------------------------------------------------------------------------
v_rpc_missing_uid_check AS (
  SELECT
    'authenticated_rpc_without_uid_check' AS check_id,
    'public.' || p.proname AS object_name,
    'دالة SECURITY DEFINER قابلة للاستدعاء من authenticated بدون فحص auth.uid() في جسمها' AS detail
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND p.prosrc NOT LIKE '%auth.uid()%'
),

-- ---------------------------------------------------------------------------
-- فحص 4: جدول في public بدون RLS
-- ---------------------------------------------------------------------------
v_table_without_rls AS (
  SELECT
    'table_without_rls' AS check_id,
    'public.' || c.relname AS object_name,
    'جدول بدون تفعيل RLS — ALTER TABLE ... ENABLE ROW LEVEL SECURITY' AS detail
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
),

-- ---------------------------------------------------------------------------
-- فحص 5: جدول مكشوف للزوّار عبر سياسة RLS تشمل anon أو PUBLIC وغير مُدرج في القراءة العامة
-- (ملاحظة: منح GRANT وحده لا يكفي للوصول لأن كل الجداول تعمل بـ RLS مغلق افتراضاً،
--  فالمعيار الحقيقي للتعرّض هو وجود سياسة تنطبق على anon/PUBLIC.)
-- ---------------------------------------------------------------------------
v_anon_exposed_table AS (
  SELECT
    'anon_exposed_table' AS check_id,
    'public.' || c.relname AS object_name,
    'سياسة RLS تمنح الزوّار (anon/PUBLIC) وصولاً لجدول غير مُدرج في القراءة العامة الموثّقة' AS detail
  FROM pg_policy pol
  JOIN pg_class c ON c.oid = pol.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname NOT IN (SELECT relname FROM public_read_tables)
    AND (
      0 = ANY (pol.polroles)
      OR EXISTS (SELECT 1 FROM pg_roles r WHERE r.oid = ANY (pol.polroles) AND r.rolname = 'anon')
    )
),

-- ---------------------------------------------------------------------------
-- فحص 6: جدول مفعّل عليه RLS ويمنح authenticated صلاحيات دون أي سياسة
-- ---------------------------------------------------------------------------
v_granted_without_policy AS (
  SELECT
    'granted_without_policy' AS check_id,
    'public.' || c.relname AS object_name,
    'جدول يمنح authenticated صلاحيات بلا أي سياسة RLS — إمّا سياسة صريحة أو إلغاء المنح' AS detail
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity
    AND has_table_privilege('authenticated', c.oid, 'SELECT')
    AND NOT EXISTS (SELECT 1 FROM pg_policy pol WHERE pol.polrelid = c.oid)
)

SELECT * FROM v_secdef_anon
UNION ALL SELECT * FROM v_undocumented_rpc
UNION ALL SELECT * FROM v_rpc_missing_uid_check
UNION ALL SELECT * FROM v_table_without_rls
UNION ALL SELECT * FROM v_anon_exposed_table
UNION ALL SELECT * FROM v_granted_without_policy
ORDER BY check_id, object_name;