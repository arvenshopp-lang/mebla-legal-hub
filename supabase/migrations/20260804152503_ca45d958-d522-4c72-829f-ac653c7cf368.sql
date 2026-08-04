CREATE OR REPLACE FUNCTION private.payment_amount_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_total numeric(14,2);
  v_sum numeric(14,2);
BEGIN
  IF NEW.status NOT IN ('paid', 'refunded', 'partially_refunded') THEN
    RETURN NEW;
  END IF;

  SELECT total INTO v_total FROM public.platform_invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_sum
  FROM public.platform_payments
  WHERE invoice_id = NEW.invoice_id
    AND id <> NEW.id
    AND status IN ('paid', 'refunded', 'partially_refunded');

  IF v_sum + NEW.amount > v_total + 0.005 THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_INVOICE_TOTAL' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.refund_amount_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_paid numeric(14,2);
  v_sum numeric(14,2);
BEGIN
  IF NEW.status IN ('failed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT amount INTO v_paid
  FROM public.platform_payments
  WHERE id = NEW.payment_id AND status IN ('paid', 'refunded', 'partially_refunded')
  FOR UPDATE;

  IF v_paid IS NULL THEN
    RAISE EXCEPTION 'REFUND_REQUIRES_SETTLED_PAYMENT' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_sum
  FROM public.platform_refunds
  WHERE payment_id = NEW.payment_id
    AND id <> NEW.id
    AND status NOT IN ('failed', 'cancelled');

  IF v_sum + NEW.amount > v_paid + 0.005 THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_PAID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.payment_amount_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.refund_amount_guard() FROM PUBLIC, anon, authenticated;