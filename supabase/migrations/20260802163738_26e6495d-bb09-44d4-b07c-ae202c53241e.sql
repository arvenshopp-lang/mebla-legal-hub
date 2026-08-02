-- 1) سجل كشف البيانات الحساسة: نتيجة العملية ومعرّف التتبع وبيئة الطلب
ALTER TABLE public.pii_access_logs
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS trace_ref text,
  ADD COLUMN IF NOT EXISTS aal text,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS browser text;

ALTER TABLE public.pii_access_logs DROP CONSTRAINT IF EXISTS pii_access_logs_outcome_check;
ALTER TABLE public.pii_access_logs
  ADD CONSTRAINT pii_access_logs_outcome_check
  CHECK (outcome IN ('success', 'denied', 'rate_limited', 'mfa_required'));

CREATE INDEX IF NOT EXISTS pii_access_logs_actor_recent_idx
  ON public.pii_access_logs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.pii_access_logs_enforce_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE ua text;
BEGIN
  NEW.user_id := auth.uid();
  NEW.created_at := now();
  ua := left(coalesce(NEW.user_agent, ''), 300);
  NEW.user_agent := ua;
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  NEW.trace_ref := left(coalesce(NEW.trace_ref, ''), 40);
  NEW.aal := left(coalesce(NEW.aal, ''), 10);
  NEW.device := CASE
    WHEN ua ~* 'ipad|tablet' THEN 'تابلت'
    WHEN ua ~* 'mobile|iphone|android' THEN 'جوال'
    WHEN ua = '' THEN NULL
    ELSE 'حاسب' END;
  NEW.browser := CASE
    WHEN ua ~* 'edg/' THEN 'Edge'
    WHEN ua ~* 'chrome|crios' THEN 'Chrome'
    WHEN ua ~* 'firefox|fxios' THEN 'Firefox'
    WHEN ua ~* 'safari' THEN 'Safari'
    WHEN ua = '' THEN NULL
    ELSE 'أخرى' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pii_access_logs_enforce_actor ON public.pii_access_logs;
CREATE TRIGGER pii_access_logs_enforce_actor
  BEFORE INSERT ON public.pii_access_logs
  FOR EACH ROW EXECUTE FUNCTION public.pii_access_logs_enforce_actor();

-- 2) سجل وصول المستندات: تسجيل المحاولات المرفوضة أيضاً
ALTER TABLE public.document_access_logs
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS denial_reason text,
  ADD COLUMN IF NOT EXISTS trace_ref text;

ALTER TABLE public.document_access_logs DROP CONSTRAINT IF EXISTS document_access_logs_outcome_check;
ALTER TABLE public.document_access_logs
  ADD CONSTRAINT document_access_logs_outcome_check
  CHECK (outcome IN ('success', 'denied'));

-- 3) متابعة إعادة التشفير التدريجية عند تدوير المفاتيح
CREATE TABLE IF NOT EXISTS public.pii_reencryption_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_version smallint NOT NULL,
  to_version smallint NOT NULL,
  entity text NOT NULL CHECK (entity IN ('clients', 'case_parties')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed')),
  processed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  cursor_id uuid,
  last_error text,
  started_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pii_reencryption_jobs TO authenticated;
GRANT ALL ON public.pii_reencryption_jobs TO service_role;
GRANT ALL ON public.encryption_key_registry TO service_role;
ALTER TABLE public.pii_reencryption_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reencryption_jobs_staff_read ON public.pii_reencryption_jobs;
CREATE POLICY reencryption_jobs_staff_read ON public.pii_reencryption_jobs
  FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'settings.manage'));

DROP TRIGGER IF EXISTS pii_reencryption_jobs_updated_at ON public.pii_reencryption_jobs;
CREATE TRIGGER pii_reencryption_jobs_updated_at
  BEFORE UPDATE ON public.pii_reencryption_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) حماية المفاتيح: لا يُقاعد إصدار ما لم تُنقل كل البيانات المرتبطة به
CREATE OR REPLACE FUNCTION public.encryption_key_registry_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE remaining bigint;
BEGIN
  IF NEW.status = 'retired' AND coalesce(OLD.status, '') <> 'retired' THEN
    SELECT (SELECT count(*) FROM public.clients WHERE pii_key_version = NEW.key_version)
         + (SELECT count(*) FROM public.case_parties WHERE pii_key_version = NEW.key_version)
      INTO remaining;
    IF remaining > 0 THEN
      RAISE EXCEPTION 'KEY_VERSION_STILL_IN_USE:%', remaining USING ERRCODE = 'P0001';
    END IF;
    NEW.retired_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encryption_key_registry_guard ON public.encryption_key_registry;
CREATE TRIGGER encryption_key_registry_guard
  BEFORE UPDATE ON public.encryption_key_registry
  FOR EACH ROW EXECUTE FUNCTION public.encryption_key_registry_guard();