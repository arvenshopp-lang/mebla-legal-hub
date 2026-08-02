ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_status text NOT NULL DEFAULT 'UNCHECKED',
  ADD COLUMN IF NOT EXISTS storage_verified_at timestamp with time zone;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_file_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_file_status_check
  CHECK (file_status IN ('UNCHECKED', 'AVAILABLE', 'FILE_MISSING', 'INVALID_FILE'));

CREATE INDEX IF NOT EXISTS documents_file_status_idx
  ON public.documents (organization_id, file_status, created_at DESC);