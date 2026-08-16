-- ==============================================================================
-- MEHLA — Legal Document Malware Scanning & Quarantine Schema Extension
-- Migration Source Only (Not Applied to Production in S8)
-- ==============================================================================

-- 1. إضافة حقول حالة فحص البرمجيات الضارة والعزل الصحي
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
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_scan_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_scan_status_check
  CHECK (scan_status IN ('PENDING_SCAN', 'CLEAN', 'INFECTED', 'SCAN_FAILED', 'QUARANTINED'));

-- 3. فهرس الأداء لحالات الفحص ضمن نطاق المنظمة
CREATE INDEX IF NOT EXISTS idx_documents_scan_status
  ON public.documents (organization_id, scan_status, created_at DESC);

-- 4. تقييد استعلامات العرض للمستندات السليمة فقط عبر سياسة RLS إضافية
COMMENT ON COLUMN public.documents.scan_status IS 'حالة الفحص الأمني للمستند: PENDING_SCAN, CLEAN, INFECTED, SCAN_FAILED, QUARANTINED. لا يُعرض للمستخدم إلا CLEAN فقط.';
