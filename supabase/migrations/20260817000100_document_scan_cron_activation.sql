-- ============================================================================
-- MEHLA — تسجيل المهمة الدورية لفحص البرمجيات الضارة لمستندات مِهلة (pg_cron → pg_net)
--
-- ضمان الأمان التشغيلي:
-- تُنشأ المهمة بحالة غير نشطة (active = false) افتراضياً لمنع استدعاء المسار قبل نشر التطبيق.
-- يتم تنشيط المهمة (active = true) صراحة بعد اكتمال نشر تطبيق مِهلة (PR #12).
--
-- الحماية: سر التشغيل القائم ops.cron_secret() الممرر في ترويسة x-mehla-cron-secret.
-- منع التكرار: محمي بشرط WHERE NOT EXISTS لضمان الحتمية (Idempotent).
-- ============================================================================

-- 1. جدولة المهمة بحتمية تامة
SELECT cron.schedule(
  'mehla-document-scan',
  '*/2 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://mehlalex.com/api/public/hooks/document-scan',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-mehla-cron-secret', ops.cron_secret()
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mehla-document-scan');

-- 2. إبقاء المهمة غير نشطة حتى اكتمال نشر الكود على الإنتاج (Post-Deploy Safety Invariant)
UPDATE cron.job
SET active = false
WHERE jobname = 'mehla-document-scan';
