-- 1) قيود الفواتير
ALTER TABLE public.platform_invoices
  ADD CONSTRAINT platform_invoices_remaining_check CHECK (remaining >= 0),
  ADD CONSTRAINT platform_invoices_discount_le_subtotal_check CHECK (discount_total <= subtotal);

-- 2) قيود الدفعات
ALTER TABLE public.platform_payments
  ADD CONSTRAINT platform_payments_refunded_le_amount_check CHECK (refunded_amount <= amount);

-- 3) منع تكرار مرجع المزود (فهرس جزئي: يستثني المحاولات الفاشلة/الملغاة والقيم الفارغة)
CREATE UNIQUE INDEX IF NOT EXISTS platform_payments_provider_ref_uidx
  ON public.platform_payments (provider, provider_reference)
  WHERE provider_reference IS NOT NULL AND status NOT IN ('failed', 'cancelled');

-- 4) منع تجاوز مجموع الدفعات المعتمدة لإجمالي الفاتورة
CREATE OR REPLACE FUNCTION private.payment_amount_guard()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS platform_payments_amount_guard ON public.platform_payments;
CREATE TRIGGER platform_payments_amount_guard
  BEFORE INSERT OR UPDATE ON public.platform_payments
  FOR EACH ROW EXECUTE FUNCTION private.payment_amount_guard();

-- 5) منع تجاوز مجموع الاستردادات للمبلغ القابل للاسترداد
CREATE OR REPLACE FUNCTION private.refund_amount_guard()
RETURNS trigger
LANGUAGE plpgsql
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

DROP TRIGGER IF EXISTS platform_refunds_amount_guard ON public.platform_refunds;
CREATE TRIGGER platform_refunds_amount_guard
  BEFORE INSERT OR UPDATE ON public.platform_refunds
  FOR EACH ROW EXECUTE FUNCTION private.refund_amount_guard();

-- 6) توسيع حماية ثبات الفاتورة بعد الإصدار
CREATE OR REPLACE FUNCTION private.invoice_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL THEN
    NEW.number := OLD.number;
    NEW.organization_id := OLD.organization_id;
    NEW.tax_rate := OLD.tax_rate;
    NEW.tax_exempt := OLD.tax_exempt;
    NEW.tax_exemption_reason := OLD.tax_exemption_reason;
    NEW.currency := OLD.currency;
    NEW.issued_at := OLD.issued_at;
    NEW.created_by := OLD.created_by;
    NEW.created_by_email := OLD.created_by_email;
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'ISSUED_INVOICE_CANNOT_RETURN_TO_DRAFT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 7) فهارس المركز المالي
CREATE INDEX IF NOT EXISTS platform_invoices_issued_at_idx ON public.platform_invoices (issued_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS platform_invoices_created_at_idx ON public.platform_invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_invoices_outstanding_idx ON public.platform_invoices (due_at)
  WHERE status IN ('issued', 'pending', 'partially_paid', 'overdue');
CREATE INDEX IF NOT EXISTS platform_invoices_customer_email_idx ON public.platform_invoices (lower(customer_email))
  WHERE customer_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_invoices_customer_name_idx ON public.platform_invoices (customer_name);
CREATE INDEX IF NOT EXISTS platform_payments_provider_status_idx ON public.platform_payments (provider, status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_payments_org_idx ON public.platform_payments (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_refunds_status_idx ON public.platform_refunds (status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_credit_notes_status_idx ON public.platform_credit_notes (status, issued_at DESC);
CREATE INDEX IF NOT EXISTS platform_bank_reconciliations_status_idx ON public.platform_bank_reconciliations (status, value_date DESC);