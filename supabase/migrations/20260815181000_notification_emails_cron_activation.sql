-- ============================================================================
-- MEHLA — تنشيط المهمة الدورية لقناة بريد التنبيهات (هجرة تنشيط منفصلة)
--
-- مصدر فقط: لا تُطبَّق إلا بعد تطبيق هجرة الأساس ونجاح اختبار الإرسال المفرد
-- المضبوط. وظيفتها الوحيدة إنشاء المهمة الدورية؛ لا جدول ولا صلاحية ولا دالة.
-- الحماية: سر التشغيل القائم ops.cron_secret() كما في بقية مهام مِهلة.
-- ============================================================================

SELECT cron.schedule(
  'mehla-notification-emails',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--0ac4f813-8ba3-4f48-9bc7-432613df3dae.lovable.app/api/public/hooks/notification-emails',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mehla-cron-secret', ops.cron_secret()),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mehla-notification-emails');
