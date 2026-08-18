DROP TABLE IF EXISTS public.office_payments CASCADE;
DROP TABLE IF EXISTS public.office_invoice_items CASCADE;
DROP TABLE IF EXISTS public.office_invoices CASCADE;
DROP TABLE IF EXISTS public.office_invoice_branding CASCADE;
DROP TABLE IF EXISTS public.office_invoice_counters CASCADE;

DROP FUNCTION IF EXISTS private.office_invoice_recalc() CASCADE;
DROP FUNCTION IF EXISTS private.office_invoices_guard() CASCADE;
DROP FUNCTION IF EXISTS private.office_invoices_issue() CASCADE;
DROP FUNCTION IF EXISTS private.office_invoices_after() CASCADE;
DROP FUNCTION IF EXISTS private.office_invoice_items_guard() CASCADE;
DROP FUNCTION IF EXISTS private.office_invoice_items_after() CASCADE;
DROP FUNCTION IF EXISTS private.office_payments_guard() CASCADE;
DROP FUNCTION IF EXISTS private.office_payments_after() CASCADE;
DROP FUNCTION IF EXISTS public.recalc_invoice(uuid) CASCADE;