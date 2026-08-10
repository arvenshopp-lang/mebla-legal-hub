CREATE OR REPLACE FUNCTION private.recalc_invoice(_invoice_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_inv public.platform_invoices;
  v_subtotal numeric(14,2) := 0;
  v_discount numeric(14,2) := 0;
  v_tax numeric(14,2) := 0;
  v_total numeric(14,2) := 0;
  v_paid numeric(14,2) := 0;
  v_refunded numeric(14,2) := 0;
  v_remaining numeric(14,2) := 0;
  v_status text;
BEGIN
  SELECT * INTO v_inv FROM public.platform_invoices WHERE id = _invoice_id;
  IF v_inv.id IS NULL THEN RETURN; END IF;

  SELECT coalesce(sum(quantity * unit_price), 0),
         coalesce(sum(discount_amount), 0),
         coalesce(sum(
           CASE WHEN v_inv.tax_exempt THEN 0
                ELSE greatest(quantity * unit_price - discount_amount, 0) * (tax_rate / 100.0) END), 0)
    INTO v_subtotal, v_discount, v_tax
  FROM public.platform_invoice_items WHERE invoice_id = _invoice_id;

  v_total := round(greatest(v_subtotal - v_discount, 0) + v_tax, 2);

  SELECT coalesce(sum(amount), 0) INTO v_paid
  FROM public.platform_payments WHERE invoice_id = _invoice_id AND status IN ('paid','refunded','partially_refunded');

  SELECT coalesce(sum(amount), 0) INTO v_refunded
  FROM public.platform_refunds WHERE invoice_id = _invoice_id AND status = 'completed';

  v_paid := round(greatest(v_paid - v_refunded, 0), 2);
  v_remaining := round(v_total - v_paid, 2);

  v_status := v_inv.status;
  IF v_status NOT IN ('draft','cancelled') THEN
    IF v_refunded > 0 AND v_refunded >= v_total THEN v_status := 'refunded';
    ELSIF v_refunded > 0 THEN v_status := 'partially_refunded';
    ELSIF v_total > 0 AND v_paid >= v_total THEN v_status := 'paid';
    ELSIF v_paid > 0 THEN v_status := 'partially_paid';
    ELSIF v_inv.due_at IS NOT NULL AND v_inv.due_at < now() THEN v_status := 'overdue';
    ELSE v_status := CASE WHEN v_inv.issued_at IS NULL THEN 'draft' ELSE 'pending' END;
    END IF;
  END IF;

  UPDATE public.platform_invoices
     SET subtotal = round(v_subtotal, 2),
         discount_total = round(v_discount, 2),
         tax_total = round(v_tax, 2),
         total = v_total,
         paid_total = v_paid,
         refunded_total = round(v_refunded, 2),
         remaining = v_remaining,
         status = v_status,
         paid_at = CASE WHEN v_status = 'paid' THEN coalesce(v_inv.paid_at, now()) ELSE NULL END,
         updated_at = now()
   WHERE id = _invoice_id;
END;
$function$;

CREATE OR REPLACE FUNCTION private.invoice_item_lines()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_exempt boolean := false;
  v_net numeric(14,2);
  v_tax numeric(14,2);
BEGIN
  SELECT tax_exempt INTO v_exempt FROM public.platform_invoices WHERE id = NEW.invoice_id;
  v_net := round(greatest(NEW.quantity * NEW.unit_price - NEW.discount_amount, 0), 2);
  v_tax := CASE WHEN coalesce(v_exempt, false) THEN 0
                ELSE round(v_net * (NEW.tax_rate / 100.0), 2) END;
  NEW.line_subtotal := v_net;
  NEW.line_tax := v_tax;
  NEW.line_total := v_net + v_tax;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS invoice_item_lines ON public.platform_invoice_items;
CREATE TRIGGER invoice_item_lines
  BEFORE INSERT OR UPDATE ON public.platform_invoice_items
  FOR EACH ROW EXECUTE FUNCTION private.invoice_item_lines();