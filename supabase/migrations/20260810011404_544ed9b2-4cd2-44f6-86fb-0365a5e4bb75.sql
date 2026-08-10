ALTER TABLE public.sales_documents
  ADD COLUMN IF NOT EXISTS recipient_name text,
  ADD COLUMN IF NOT EXISTS recipient_company text,
  ADD COLUMN IF NOT EXISTS recipient_phone text,
  ADD COLUMN IF NOT EXISTS recipient_email text,
  ADD COLUMN IF NOT EXISTS recipient_address text;

ALTER TABLE public.sales_document_templates
  DROP CONSTRAINT IF EXISTS sales_tpl_validity_chk;

ALTER TABLE public.sales_document_templates
  ADD CONSTRAINT sales_tpl_validity_chk CHECK (default_validity_days >= 0 AND default_validity_days <= 365);