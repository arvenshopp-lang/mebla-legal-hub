-- ============================================================================
-- MEHLA — تنشيط المهمة الدورية لفحص البرمجيات الضارة لمستندات مِهلة (pg_cron → pg_net)
--
-- مصدر فقط: لا تُطبَّق على بيئة الإنتاج إلا بعد استيفاء الشروط المسبقة:
--  1) توفير خادم ClamAV الخاص وضبط المتغيرات البيئية.
--  2) تطبيق هجرة هيكل الفحص والحجز الذري (20260817000000_document_scan_quarantine.sql).
--  3) نشر كود التطبيق المحدث (PR #12).
--
-- الحماية: سر التشغيل القائم ops.cron_secret() الممرر في ترويسة x-mehla-cron-secret.
-- منع التكرار: يتم التأكد من عدم وجود مهمة بنفس الاسم قبل الإدراج (Idempotent).
-- ============================================================================

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
