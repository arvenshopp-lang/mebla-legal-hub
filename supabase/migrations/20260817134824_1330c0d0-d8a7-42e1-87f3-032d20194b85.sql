REVOKE ALL ON public.office_invoices FROM anon;
REVOKE ALL ON public.office_invoice_items FROM anon;
REVOKE ALL ON public.office_payments FROM anon;
REVOKE ALL ON public.office_invoice_counters FROM anon;
REVOKE ALL ON public.office_invoice_counters FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_invoices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_invoice_items TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.office_payments TO authenticated;
GRANT ALL ON public.office_invoices TO service_role;
GRANT ALL ON public.office_invoice_items TO service_role;
GRANT ALL ON public.office_payments TO service_role;
GRANT ALL ON public.office_invoice_counters TO service_role;