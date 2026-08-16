-- ==============================================================================
-- MEHLA — Legal Document Malware Scanning, Queue & Quarantine Schema Extension
-- Migration Source Only (Not Applied to Production in S8/S18)
-- ==============================================================================

-- 1. إضافة حقول حالة فحص البرمجيات الضارة والعزل الصحي وإدارة الطابور الذري
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'PENDING_SCAN',
  ADD COLUMN IF NOT EXISTS scan_provider text,
  ADD COLUMN IF NOT EXISTS scan_engine_version text,
  ADD COLUMN IF NOT EXISTS scan_signature_version text,
  ADD COLUMN IF NOT EXISTS scan_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_failure_code text,
  ADD COLUMN IF NOT EXISTS quarantine_reason text,
  ADD COLUMN IF NOT EXISTS scan_worker_id text,
  ADD COLUMN IF NOT EXISTS scan_lease_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scan_retry_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz;

-- 2. قيد الحالات المعتمدة لفحص البرمجيات الضارة (Fail-Closed)
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_scan_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_scan_status_check
  CHECK (scan_status IN ('PENDING_SCAN', 'CLEAN', 'INFECTED', 'SCAN_FAILED', 'QUARANTINED'));

-- 3. فهارس الأداء للطابور والعزل ضمن نطاق المنظمة
CREATE INDEX IF NOT EXISTS idx_documents_scan_status
  ON public.documents (organization_id, scan_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_scan_queue
  ON public.documents (scan_status, next_retry_at, scan_lease_expires_at)
  WHERE scan_status IN ('PENDING_SCAN', 'SCAN_FAILED');

-- 4. دالة الحجز الذري الآمنة لمنع تنازع العمال (Atomic Claim RPC with FOR UPDATE SKIP LOCKED)
CREATE OR REPLACE FUNCTION public.claim_document_scan_batch(
  p_limit integer DEFAULT 10,
  p_worker_id text DEFAULT 'default-worker',
  p_lease_seconds integer DEFAULT 300
)
RETURNS TABLE (
  id uuid,
  organization_id uuid,
  file_path text,
  file_name text,
  file_size bigint,
  mime_type text,
  scan_status text,
  scan_retry_count integer,
  next_retry_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  WITH candidates AS (
    SELECT d.id
    FROM public.documents d
    WHERE (
      (d.scan_status = 'PENDING_SCAN' AND (d.scan_lease_expires_at IS NULL OR d.scan_lease_expires_at < now()))
      OR
      (d.scan_status = 'SCAN_FAILED' AND d.scan_retry_count < 3 AND (d.next_retry_at IS NULL OR d.next_retry_at <= now()) AND (d.scan_lease_expires_at IS NULL OR d.scan_lease_expires_at < now()))
    )
    ORDER BY d.created_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.documents doc
  SET scan_worker_id = p_worker_id,
      scan_started_at = now(),
      scan_lease_expires_at = now() + (p_lease_seconds || ' seconds')::interval
  FROM candidates c
  WHERE doc.id = c.id
  RETURNING
    doc.id,
    doc.organization_id,
    doc.file_path,
    doc.file_name,
    doc.file_size,
    doc.mime_type,
    doc.scan_status,
    doc.scan_retry_count,
    doc.next_retry_at;
END;
$$;

-- 5. تقييد صلاحيات تنفيذ دالة الحجز لدور الخدمة فقط
REVOKE ALL ON FUNCTION public.claim_document_scan_batch(integer, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_document_scan_batch(integer, text, integer) TO service_role;

-- 6. توثيق سياسة المستندات التاريخية:
COMMENT ON COLUMN public.documents.scan_status IS 'حالة الفحص الأمني للمستند: PENDING_SCAN, CLEAN, INFECTED, SCAN_FAILED, QUARANTINED. لا يُعرض للمستخدم إلا CLEAN فقط.';
