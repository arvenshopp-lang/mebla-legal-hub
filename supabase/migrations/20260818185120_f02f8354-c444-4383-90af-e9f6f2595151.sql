-- P1: أساس التشغيل — الحوادث + نبضات المهام (جداول جديدة فقط، server-only)

CREATE TABLE public.platform_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('failure','job','queue')),
  surface text NOT NULL,
  action text NOT NULL,
  error_code text,
  title text NOT NULL,
  severity text NOT NULL DEFAULT 'medium' CHECK (severity IN ('critical','high','medium','low')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','investigating','monitoring','resolved')),
  assignee_staff_id uuid REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  assignee_email text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrences integer NOT NULL DEFAULT 1,
  reopened_count integer NOT NULL DEFAULT 0,
  sample_ref text,
  resolution text,
  resolved_at timestamptz,
  resolved_by text,
  last_alert_at timestamptz,
  alert_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.platform_incidents TO service_role;
ALTER TABLE public.platform_incidents ENABLE ROW LEVEL SECURITY;
-- لا سياسات: الجدول مغلق أمام anon/authenticated ولا يُقرأ إلا عبر دور الخدمة في دوال الخادم.

CREATE INDEX platform_incidents_status_idx ON public.platform_incidents (status, severity, last_seen_at DESC);
CREATE INDEX platform_incidents_last_seen_idx ON public.platform_incidents (last_seen_at DESC);

CREATE TRIGGER platform_incidents_set_updated_at
BEFORE UPDATE ON public.platform_incidents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.platform_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.platform_incidents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('opened','occurrence','status_changed','assigned','resolved','reopened','note','alert_sent','alert_failed')),
  from_status text,
  to_status text,
  actor_email text,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.platform_incident_events TO service_role;
ALTER TABLE public.platform_incident_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX platform_incident_events_incident_idx ON public.platform_incident_events (incident_id, created_at DESC);

-- سجل غير قابل للتعديل أو الحذف (نفس نمط سجلات التدقيق القائمة)
CREATE TRIGGER platform_incident_events_no_update
BEFORE UPDATE ON public.platform_incident_events
FOR EACH ROW EXECUTE FUNCTION public.deny_update();

CREATE TRIGGER platform_incident_events_no_delete
BEFORE DELETE ON public.platform_incident_events
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

CREATE TABLE public.platform_job_heartbeats (
  job_key text PRIMARY KEY,
  label text NOT NULL,
  schedule text NOT NULL DEFAULT '',
  slo_seconds integer NOT NULL DEFAULT 900,
  expected_interval_seconds integer NOT NULL DEFAULT 300,
  critical boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_duration_ms integer,
  last_status text NOT NULL DEFAULT 'never' CHECK (last_status IN ('never','running','ok','failed')),
  last_error_code text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  runs_total bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.platform_job_heartbeats TO service_role;
ALTER TABLE public.platform_job_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER platform_job_heartbeats_set_updated_at
BEFORE UPDATE ON public.platform_job_heartbeats
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_job_heartbeats
  (job_key, label, schedule, slo_seconds, expected_interval_seconds, critical)
VALUES
  ('email-dispatch', 'إرسال بريد المكاتب', '* * * * *', 900, 60, true),
  ('notifications-dispatch', 'توزيع الإشعارات', '* * * * *', 900, 60, true),
  ('notification-emails', 'بريد الإشعارات', '*/5 * * * *', 1800, 300, true),
  ('mail-sync', 'مزامنة البريد الوارد', '*/5 * * * *', 2700, 300, true),
  ('operational-reminders', 'التذكيرات التشغيلية', '0 * * * *', 7200, 3600, true),
  ('cleanup-secure-artifacts', 'تنظيف الروابط والرموز', '17 * * * *', 7200, 3600, false),
  ('operational-score', 'درجة الأداء التشغيلي', '0 */6 * * *', 100000, 21600, false),
  ('ops-watchdog', 'رصد التشغيل والحوادث', '*/10 * * * *', 3600, 600, true);
