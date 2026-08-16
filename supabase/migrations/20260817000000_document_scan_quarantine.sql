-- ==============================================================================
-- MEHLA — Legal Document Malware Scanning & Quarantine Schema Extension
-- Migration Source Only (Not Applied to Production in S8/S18)
-- ==============================================================================

-- 1. إضافة حقول حالة فحص البرمجيات الضارة والعزل الصحي
-- ملاحظة أداء: في PostgreSQL 11+ إضافة عمود بقيمة افتراضية ثابتة لا تعيد كتابة الجدول (Metadata-only).
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'PENDING_SCAN',
  ADD COLUMN IF NOT EXISTS scan_provider text,
  ADD COLUMN IF NOT EXISTS scan_engine_version text,
  ADD COLUMN IF NOT EXISTS scan_signature_version text,
  ADD COLUMN IF NOT EXISTS scan_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_failure_code text,
  ADD COLUMN IF NOT EXISTS quarantine_reason text;

-- 2. قيد الحالات المعتمدة لفحص البرمجيات الضارة (Fail-Closed)
-- الحالات المعتمدة: PENDING_SCAN, CLEAN, INFECTED, SCAN_FAILED, QUARANTINED
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_scan_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_scan_status_check
  CHECK (scan_status IN ('PENDING_SCAN', 'CLEAN', 'INFECTED', 'SCAN_FAILED', 'QUARANTINED'));

-- 3. فهرس الأداء لحالات الفحص ضمن نطاق المنظمة
-- ملاحظة تشغيلية: في بيئة الإنتاج الكبيرة يُفضل استخدام CREATE INDEX CONCURRENTLY
CREATE INDEX IF NOT EXISTS idx_documents_scan_status
  ON public.documents (organization_id, scan_status, created_at DESC);

-- 4. توثيق سياسة المستندات التاريخية:
-- يُحظر اعتبار المستندات السابقة CLEAN تلقائياً دون فحص أمني.
-- المستندات القديمة تأخذ القيمة الافتراضية PENDING_SCAN وتخضع لرتل الفحص الخلفي (Background Scan Queue).
COMMENT ON COLUMN public.documents.scan_status IS 'حالة الفحص الأمني للمستند: PENDING_SCAN, CLEAN, INFECTED, SCAN_FAILED, QUARANTINED. لا يُعرض للمستخدم إلا CLEAN فقط.';
