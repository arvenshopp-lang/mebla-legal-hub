-- ============================================================
-- MEHLA — فوترة وأتعاب مكاتب المحاماة (Office Billing)
-- مستقل تماماً عن جداول المنصة (platform_*) وعن public.invoices الخاصة بالاشتراكات.
-- كل الحسابات المالية تُنفَّذ داخل قاعدة البيانات، والواجهة لا تكتب إجماليات.
-- ============================================================

-- 1) عدّاد الترقيم: جدول داخلي مغلق (RLS بلا سياسات ولا صلاحيات للتطبيق).
CREATE TABLE public.office_invoice_counters (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, year)
);
GRANT ALL ON public.office_invoice_counters TO service_role;
ALTER TABLE public.office_invoice_counters ENABLE ROW LEVEL SECURITY;

-- 2) الفواتير
CREATE TABLE public.office_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  case_id uuid REFERENCES public.cases(id) ON DELETE SET NULL,
  invoice_number text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','issued','partially_paid','paid','cancelled')),
  currency text NOT NULL DEFAULT 'SAR' CHECK (currency = 'SAR'),
  issue_date date,
  due_date date,
  discount_type text NOT NULL DEFAULT 'amount' CHECK (discount_type IN ('amount','percent')),
  discount_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_value >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 15 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_total numeric(14,2) NOT NULL DEFAULT 0,
  tax_total numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  paid_total numeric(14,2) NOT NULL DEFAULT 0,
  balance numeric(14,2) NOT NULL DEFAULT 0,
  payment_terms text,
  notes text,
  title text,
  issued_at timestamptz,
  issued_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  cancellation_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX office_invoices_number_unique
  ON public.office_invoices (organization_id, invoice_number)
  WHERE invoice_number IS NOT NULL;
CREATE INDEX office_invoices_org_status_idx ON public.office_invoices (organization_id, status);
CREATE INDEX office_invoices_org_client_idx ON public.office_invoices (organization_id, client_id);
CREATE INDEX office_invoices_org_case_idx ON public.office_invoices (organization_id, case_id);
CREATE INDEX office_invoices_org_due_idx ON public.office_invoices (organization_id, due_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_invoices TO authenticated;
GRANT ALL ON public.office_invoices TO service_role;
ALTER TABLE public.office_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office_invoices_select" ON public.office_invoices
  FOR SELECT TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer']::app_role[]));
CREATE POLICY "office_invoices_insert" ON public.office_invoices
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[])
    AND status = 'draft' AND created_by = auth.uid() AND invoice_number IS NULL
  );
CREATE POLICY "office_invoices_update" ON public.office_invoices
  FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));
CREATE POLICY "office_invoices_delete" ON public.office_invoices
  FOR DELETE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));

-- 3) بنود الفاتورة
CREATE TABLE public.office_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.office_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX office_invoice_items_invoice_idx ON public.office_invoice_items (invoice_id, sort_order);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_invoice_items TO authenticated;
GRANT ALL ON public.office_invoice_items TO service_role;
ALTER TABLE public.office_invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office_invoice_items_select" ON public.office_invoice_items
  FOR SELECT TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer']::app_role[]));
CREATE POLICY "office_invoice_items_insert" ON public.office_invoice_items
  FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));
CREATE POLICY "office_invoice_items_update" ON public.office_invoice_items
  FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));
CREATE POLICY "office_invoice_items_delete" ON public.office_invoice_items
  FOR DELETE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));

-- 4) الدفعات
CREATE TABLE public.office_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.office_invoices(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  method text NOT NULL DEFAULT 'bank_transfer'
    CHECK (method IN ('cash','bank_transfer','card','cheque','other')),
  reference_number text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  note text,
  received_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  voided_at timestamptz,
  voided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  void_reason text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX office_payments_invoice_idx ON public.office_payments (invoice_id);
CREATE INDEX office_payments_org_paid_idx ON public.office_payments (organization_id, paid_at DESC);
CREATE INDEX office_payments_org_client_idx ON public.office_payments (organization_id, client_id);
CREATE UNIQUE INDEX office_payments_reference_unique
  ON public.office_payments (invoice_id, lower(reference_number))
  WHERE reference_number IS NOT NULL AND voided_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.office_payments TO authenticated;
GRANT ALL ON public.office_payments TO service_role;
ALTER TABLE public.office_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office_payments_select" ON public.office_payments
  FOR SELECT TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer']::app_role[]));
CREATE POLICY "office_payments_insert" ON public.office_payments
  FOR INSERT TO authenticated
  WITH CHECK (
    private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[])
    AND created_by = auth.uid() AND voided_at IS NULL
  );
CREATE POLICY "office_payments_update" ON public.office_payments
  FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));

-- ============================================================
-- 5) محرك الحساب المالي (خادمي بالكامل)
-- ============================================================
CREATE OR REPLACE FUNCTION private.office_invoice_recalc(_invoice uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  inv public.office_invoices;
  v_sub numeric(14,2);
  v_disc numeric(14,2);
  v_tax numeric(14,2);
  v_total numeric(14,2);
  v_paid numeric(14,2);
BEGIN
  SELECT * INTO inv FROM public.office_invoices WHERE id = _invoice FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(round(quantity * unit_price, 2)), 0) INTO v_sub
  FROM public.office_invoice_items WHERE invoice_id = _invoice;

  IF inv.discount_type = 'percent' THEN
    v_disc := round(v_sub * LEAST(inv.discount_value, 100) / 100, 2);
  ELSE
    v_disc := LEAST(inv.discount_value, v_sub);
  END IF;

  v_tax := round((v_sub - v_disc) * inv.tax_rate / 100, 2);
  v_total := round(v_sub - v_disc + v_tax, 2);

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
  FROM public.office_payments WHERE invoice_id = _invoice AND voided_at IS NULL;

  UPDATE public.office_invoices SET
    subtotal = v_sub,
    discount_total = v_disc,
    tax_total = v_tax,
    total = v_total,
    paid_total = v_paid,
    balance = round(v_total - v_paid, 2),
    status = CASE
      WHEN status IN ('draft','cancelled') THEN status
      WHEN v_paid <= 0 THEN 'issued'
      WHEN v_paid >= v_total THEN 'paid'
      ELSE 'partially_paid'
    END,
    paid_at = CASE
      WHEN status IN ('draft','cancelled') THEN paid_at
      WHEN v_total > 0 AND v_paid >= v_total THEN COALESCE(paid_at, now())
      ELSE NULL
    END,
    updated_at = now()
  WHERE id = _invoice;
END;
$$;
REVOKE ALL ON FUNCTION private.office_invoice_recalc(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.office_invoice_recalc(uuid) TO service_role;

-- سجل تدقيق مالي داخلي (لا يُحذف — activity_logs محمية أصلاً)
CREATE OR REPLACE FUNCTION private.office_billing_audit(
  _organization_id uuid, _action text, _entity_type text, _entity_id uuid,
  _description text, _metadata jsonb
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, private
AS $$
  INSERT INTO public.activity_logs (organization_id, user_id, action, entity_type, entity_id, description, metadata)
  VALUES (_organization_id, auth.uid(), _action, _entity_type, _entity_id, _description, COALESCE(_metadata, '{}'::jsonb));
$$;
REVOKE ALL ON FUNCTION private.office_billing_audit(uuid, text, text, uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION private.office_billing_audit(uuid, text, text, uuid, text, jsonb) TO service_role;

-- ============================================================
-- 6) حرّاس الفاتورة
-- ============================================================
CREATE OR REPLACE FUNCTION private.office_invoices_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'draft' THEN
      RAISE EXCEPTION 'لا يمكن حذف فاتورة بعد إصدارها. استخدم الإلغاء بدلاً من الحذف.';
    END IF;
    IF EXISTS (SELECT 1 FROM public.office_payments WHERE invoice_id = OLD.id) THEN
      RAISE EXCEPTION 'لا يمكن حذف فاتورة مرتبطة بدفعات.';
    END IF;
    PERFORM private.office_billing_audit(OLD.organization_id, 'office_invoice.delete', 'office_invoice', OLD.id,
      'حذف مسودة فاتورة', jsonb_build_object('total', OLD.total));
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.invoice_number := NULL;
    NEW.status := 'draft';
    NEW.issued_at := NULL; NEW.issued_by := NULL; NEW.paid_at := NULL;
    NEW.cancelled_at := NULL; NEW.cancelled_by := NULL; NEW.cancellation_reason := NULL;
    NEW.subtotal := 0; NEW.discount_total := 0; NEW.tax_total := 0;
    NEW.total := 0; NEW.paid_total := 0; NEW.balance := 0;
    IF NOT EXISTS (SELECT 1 FROM public.clients c WHERE c.id = NEW.client_id AND c.organization_id = NEW.organization_id) THEN
      RAISE EXCEPTION 'العميل المحدد لا ينتمي إلى هذا المكتب.';
    END IF;
    IF NEW.case_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.cases k WHERE k.id = NEW.case_id AND k.organization_id = NEW.organization_id
    ) THEN
      RAISE EXCEPTION 'القضية المحددة لا تنتمي إلى هذا المكتب.';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'لا يمكن نقل الفاتورة إلى مكتب آخر.';
  END IF;

  IF OLD.status = 'cancelled' THEN
    RAISE EXCEPTION 'الفاتورة الملغاة لا تقبل أي تعديل.';
  END IF;

  IF OLD.status <> 'draft' THEN
    IF NEW.client_id <> OLD.client_id
       OR COALESCE(NEW.case_id::text, '') <> COALESCE(OLD.case_id::text, '')
       OR NEW.currency <> OLD.currency
       OR NEW.tax_rate <> OLD.tax_rate
       OR NEW.discount_type <> OLD.discount_type
       OR NEW.discount_value <> OLD.discount_value
       OR COALESCE(NEW.issue_date::text, '') <> COALESCE(OLD.issue_date::text, '')
       OR COALESCE(NEW.title, '') <> COALESCE(OLD.title, '')
    THEN
      RAISE EXCEPTION 'لا يمكن تعديل بيانات فاتورة مُصدرة. يمكن تعديل الملاحظات أو إلغاؤها فقط.';
    END IF;
    IF OLD.invoice_number IS NOT NULL AND COALESCE(NEW.invoice_number, '') <> OLD.invoice_number THEN
      RAISE EXCEPTION 'لا يمكن تغيير رقم فاتورة صادرة.';
    END IF;
  END IF;

  -- انتقالات الحالة المسموحة
  IF NEW.status <> OLD.status THEN
    IF NOT (
      (OLD.status = 'draft' AND NEW.status IN ('issued','cancelled'))
      OR (OLD.status IN ('issued','partially_paid','paid') AND NEW.status = 'cancelled')
      OR (OLD.status IN ('issued','partially_paid','paid') AND NEW.status IN ('issued','partially_paid','paid'))
    ) THEN
      RAISE EXCEPTION 'انتقال حالة غير مسموح للفاتورة.';
    END IF;
    IF NEW.status = 'cancelled' AND OLD.paid_total > 0 THEN
      RAISE EXCEPTION 'لا يمكن إلغاء فاتورة عليها دفعات محصّلة. أبطِل الدفعات أولاً.';
    END IF;
    IF NEW.status = 'cancelled' THEN
      NEW.cancelled_at := now();
      NEW.cancelled_by := auth.uid();
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.office_invoices_guard() FROM PUBLIC, anon, authenticated;

-- إصدار الفاتورة: ترقيم متسلسل ذرّي لكل مكتب وسنة (بتوقيت الرياض)
CREATE OR REPLACE FUNCTION private.office_invoices_issue()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_year integer;
  v_seq integer;
BEGIN
  IF OLD.status = 'draft' AND NEW.status = 'issued' THEN
    IF NOT EXISTS (SELECT 1 FROM public.office_invoice_items WHERE invoice_id = NEW.id) THEN
      RAISE EXCEPTION 'لا يمكن إصدار فاتورة بلا بنود.';
    END IF;
    v_year := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Riyadh'))::integer;
    INSERT INTO public.office_invoice_counters (organization_id, year, last_number)
    VALUES (NEW.organization_id, v_year, 1)
    ON CONFLICT (organization_id, year)
    DO UPDATE SET last_number = public.office_invoice_counters.last_number + 1, updated_at = now()
    RETURNING last_number INTO v_seq;

    NEW.invoice_number := 'INV-' || v_year::text || '-' || lpad(v_seq::text, 4, '0');
    NEW.issued_at := now();
    NEW.issued_by := auth.uid();
    NEW.issue_date := COALESCE(NEW.issue_date, (now() AT TIME ZONE 'Asia/Riyadh')::date);
    NEW.due_date := COALESCE(NEW.due_date, (now() AT TIME ZONE 'Asia/Riyadh')::date + 14);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.office_invoices_issue() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.office_invoices_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM private.office_billing_audit(NEW.organization_id, 'office_invoice.create', 'office_invoice', NEW.id,
      'إنشاء مسودة فاتورة', jsonb_build_object('client_id', NEW.client_id, 'case_id', NEW.case_id));
  ELSIF TG_OP = 'UPDATE' AND NEW.status <> OLD.status THEN
    IF NEW.status = 'issued' AND OLD.status = 'draft' THEN
      PERFORM private.office_billing_audit(NEW.organization_id, 'office_invoice.issue', 'office_invoice', NEW.id,
        'إصدار فاتورة ' || COALESCE(NEW.invoice_number, ''), jsonb_build_object('total', NEW.total));
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM private.office_billing_audit(NEW.organization_id, 'office_invoice.cancel', 'office_invoice', NEW.id,
        'إلغاء فاتورة ' || COALESCE(NEW.invoice_number, ''), jsonb_build_object('reason', NEW.cancellation_reason));
    ELSIF NEW.status = 'paid' THEN
      PERFORM private.office_billing_audit(NEW.organization_id, 'office_invoice.paid', 'office_invoice', NEW.id,
        'سداد كامل للفاتورة ' || COALESCE(NEW.invoice_number, ''), jsonb_build_object('total', NEW.total));
    END IF;
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.office_invoices_after() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER a_office_invoices_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.office_invoices
  FOR EACH ROW EXECUTE FUNCTION private.office_invoices_guard();
CREATE TRIGGER b_office_invoices_issue
  BEFORE UPDATE ON public.office_invoices
  FOR EACH ROW EXECUTE FUNCTION private.office_invoices_issue();
CREATE TRIGGER c_office_invoices_after
  AFTER INSERT OR UPDATE ON public.office_invoices
  FOR EACH ROW EXECUTE FUNCTION private.office_invoices_after();

-- ============================================================
-- 7) حرّاس البنود
-- ============================================================
CREATE OR REPLACE FUNCTION private.office_invoice_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  inv public.office_invoices;
BEGIN
  SELECT * INTO inv FROM public.office_invoices
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الفاتورة غير موجودة.';
  END IF;
  IF inv.status <> 'draft' THEN
    RAISE EXCEPTION 'لا يمكن تعديل بنود فاتورة بعد إصدارها.';
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  NEW.organization_id := inv.organization_id;
  NEW.line_total := round(NEW.quantity * NEW.unit_price, 2);
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND NEW.invoice_id <> OLD.invoice_id THEN
    RAISE EXCEPTION 'لا يمكن نقل بند إلى فاتورة أخرى.';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.office_invoice_items_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.office_invoice_items_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  PERFORM private.office_invoice_recalc(COALESCE(NEW.invoice_id, OLD.invoice_id));
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.office_invoice_items_after() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER a_office_invoice_items_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.office_invoice_items
  FOR EACH ROW EXECUTE FUNCTION private.office_invoice_items_guard();
CREATE TRIGGER b_office_invoice_items_after
  AFTER INSERT OR UPDATE OR DELETE ON public.office_invoice_items
  FOR EACH ROW EXECUTE FUNCTION private.office_invoice_items_after();

-- ============================================================
-- 8) حرّاس الدفعات
-- ============================================================
CREATE OR REPLACE FUNCTION private.office_payments_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  inv public.office_invoices;
  v_remaining numeric(14,2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'لا يمكن حذف دفعة. استخدم الإبطال مع ذكر السبب.';
  END IF;

  SELECT * INTO inv FROM public.office_invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'الفاتورة غير موجودة.'; END IF;

  IF TG_OP = 'INSERT' THEN
    IF inv.status NOT IN ('issued','partially_paid') THEN
      RAISE EXCEPTION 'لا يمكن تسجيل دفعة إلا على فاتورة مُصدرة غير مسددة.';
    END IF;
    v_remaining := round(inv.total - inv.paid_total, 2);
    IF NEW.amount > v_remaining THEN
      RAISE EXCEPTION 'مبلغ الدفعة يتجاوز المتبقي على الفاتورة (%).', v_remaining;
    END IF;
    NEW.organization_id := inv.organization_id;
    NEW.client_id := inv.client_id;
    NEW.voided_at := NULL; NEW.voided_by := NULL; NEW.void_reason := NULL;
    RETURN NEW;
  END IF;

  -- UPDATE: الإبطال فقط
  IF OLD.voided_at IS NOT NULL THEN
    RAISE EXCEPTION 'الدفعة المُبطلة لا تقبل أي تعديل.';
  END IF;
  IF NEW.amount <> OLD.amount OR NEW.invoice_id <> OLD.invoice_id
     OR NEW.organization_id <> OLD.organization_id OR NEW.client_id <> OLD.client_id
     OR NEW.method <> OLD.method OR NEW.paid_at <> OLD.paid_at
     OR COALESCE(NEW.reference_number, '') <> COALESCE(OLD.reference_number, '') THEN
    RAISE EXCEPTION 'بيانات الدفعة غير قابلة للتعديل. يمكن إبطالها فقط مع ذكر السبب.';
  END IF;
  IF NEW.voided_at IS NULL THEN
    RAISE EXCEPTION 'التعديل الوحيد المسموح على الدفعة هو الإبطال.';
  END IF;
  IF COALESCE(btrim(NEW.void_reason), '') = '' THEN
    RAISE EXCEPTION 'سبب إبطال الدفعة مطلوب.';
  END IF;
  NEW.voided_at := now();
  NEW.voided_by := auth.uid();
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.office_payments_guard() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.office_payments_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  PERFORM private.office_invoice_recalc(NEW.invoice_id);
  IF TG_OP = 'INSERT' THEN
    PERFORM private.office_billing_audit(NEW.organization_id, 'office_payment.create', 'office_payment', NEW.id,
      'تسجيل دفعة', jsonb_build_object('invoice_id', NEW.invoice_id, 'amount', NEW.amount, 'method', NEW.method));
  ELSIF NEW.voided_at IS NOT NULL AND OLD.voided_at IS NULL THEN
    PERFORM private.office_billing_audit(NEW.organization_id, 'office_payment.void', 'office_payment', NEW.id,
      'إبطال دفعة', jsonb_build_object('invoice_id', NEW.invoice_id, 'amount', NEW.amount, 'reason', NEW.void_reason));
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.office_payments_after() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER a_office_payments_guard
  BEFORE INSERT OR UPDATE OR DELETE ON public.office_payments
  FOR EACH ROW EXECUTE FUNCTION private.office_payments_guard();
CREATE TRIGGER b_office_payments_after
  AFTER INSERT OR UPDATE ON public.office_payments
  FOR EACH ROW EXECUTE FUNCTION private.office_payments_after();
