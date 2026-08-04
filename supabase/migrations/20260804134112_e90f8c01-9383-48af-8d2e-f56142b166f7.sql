-- ============================================================
-- المركز المالي — Payment Provider Agnostic (الأساس)
-- ============================================================

-- ---------- 1) الترقيم المالي ----------
CREATE TABLE public.platform_number_sequences (
  kind text NOT NULL CHECK (kind IN ('invoice','quote','credit_note')),
  period_key text NOT NULL,
  prefix text NOT NULL,
  padding integer NOT NULL DEFAULT 6 CHECK (padding BETWEEN 3 AND 12),
  next_value bigint NOT NULL DEFAULT 1 CHECK (next_value > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (kind, period_key)
);
GRANT SELECT ON public.platform_number_sequences TO authenticated;
GRANT ALL ON public.platform_number_sequences TO service_role;
ALTER TABLE public.platform_number_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sequences staff read" ON public.platform_number_sequences FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));
CREATE TRIGGER platform_number_sequences_updated_at BEFORE UPDATE ON public.platform_number_sequences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.next_financial_number(_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_period text := to_char(now() AT TIME ZONE 'Asia/Riyadh', 'YYYY');
  v_default_prefix text;
  v_prefix text;
  v_pad integer;
  v_val bigint;
BEGIN
  IF _kind NOT IN ('invoice','quote','credit_note') THEN
    RAISE EXCEPTION 'INVALID_SEQUENCE_KIND' USING ERRCODE = 'P0001';
  END IF;
  v_default_prefix := CASE _kind WHEN 'invoice' THEN 'MEH-INV'
                                 WHEN 'quote' THEN 'MEH-QT'
                                 ELSE 'MEH-CN' END;

  -- يمنع تكرار الأرقام حتى مع الطلبات المتزامنة
  PERFORM pg_advisory_xact_lock(hashtextextended(_kind || ':' || v_period, 77));

  INSERT INTO public.platform_number_sequences (kind, period_key, prefix)
  VALUES (_kind, v_period, v_default_prefix)
  ON CONFLICT (kind, period_key) DO NOTHING;

  UPDATE public.platform_number_sequences
     SET next_value = next_value + 1, updated_at = now()
   WHERE kind = _kind AND period_key = v_period
  RETURNING next_value - 1, prefix, padding INTO v_val, v_prefix, v_pad;

  RETURN v_prefix || '-' || v_period || '-' || lpad(v_val::text, v_pad, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_financial_number(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.next_financial_number(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_financial_number(text) TO service_role;

-- ---------- 2) الفترات المالية والإقفالات ----------
CREATE TABLE public.platform_financial_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  closed_at timestamptz,
  closed_by uuid,
  closed_by_email text,
  reopened_at timestamptz,
  reopened_by uuid,
  reopen_reason text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start),
  UNIQUE (period_start, period_end)
);
GRANT SELECT ON public.platform_financial_periods TO authenticated;
GRANT ALL ON public.platform_financial_periods TO service_role;
ALTER TABLE public.platform_financial_periods ENABLE ROW LEVEL SECURITY;
CREATE POLICY "periods staff read" ON public.platform_financial_periods FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));
CREATE TRIGGER platform_financial_periods_updated_at BEFORE UPDATE ON public.platform_financial_periods
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.platform_period_reopen_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id uuid NOT NULL REFERENCES public.platform_financial_periods(id) ON DELETE CASCADE,
  reason text NOT NULL,
  requested_by uuid NOT NULL,
  requested_by_email text NOT NULL,
  approved_by uuid,
  approved_by_email text,
  approved_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_period_reopen_approvals TO authenticated;
GRANT ALL ON public.platform_period_reopen_approvals TO service_role;
ALTER TABLE public.platform_period_reopen_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reopen approvals staff read" ON public.platform_period_reopen_approvals FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));
CREATE TRIGGER platform_period_reopen_approvals_updated_at BEFORE UPDATE ON public.platform_period_reopen_approvals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION private.assert_period_open(_at timestamptz)
RETURNS void LANGUAGE plpgsql STABLE SET search_path TO 'public', 'private' AS $$
BEGIN
  IF _at IS NULL THEN RETURN; END IF;
  IF EXISTS (
    SELECT 1 FROM public.platform_financial_periods p
    WHERE p.status = 'closed'
      AND (_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN p.period_start AND p.period_end
  ) THEN
    RAISE EXCEPTION 'FINANCIAL_PERIOD_CLOSED' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- ---------- 3) مزوّدو الدفع ----------
CREATE TABLE public.platform_payment_provider_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT false,
  connection_status text NOT NULL DEFAULT 'not_configured'
    CHECK (connection_status IN ('not_configured','configured','verified','failed')),
  last_tested_at timestamptz,
  last_test_error text,
  supports_refunds boolean NOT NULL DEFAULT true,
  supports_webhooks boolean NOT NULL DEFAULT true,
  webhook_path text,
  integration_id uuid REFERENCES public.platform_integrations(id) ON DELETE SET NULL,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_payment_provider_configs TO authenticated;
GRANT ALL ON public.platform_payment_provider_configs TO service_role;
ALTER TABLE public.platform_payment_provider_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment providers staff read" ON public.platform_payment_provider_configs FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.manage_providers')
         OR private.has_platform_permission(auth.uid(), 'billing.read'));
CREATE TRIGGER platform_payment_provider_configs_updated_at BEFORE UPDATE ON public.platform_payment_provider_configs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- مُيسّر مُسجّل وغير مُفعّل، بلا أي مفاتيح
INSERT INTO public.platform_payment_provider_configs
  (code, name_ar, description, is_enabled, connection_status, webhook_path, sort_order)
VALUES
  ('manual', 'تحصيل يدوي / تحويل بنكي', 'تسجيل الدفعات يدوياً من الإدارة مع إثبات التحويل واعتماد مسجّل.', true, 'verified', NULL, 0),
  ('moyasar', 'مُيسّر (Moyasar)', 'بوابة دفع سعودية. تتطلب مفاتيح حقيقية واجتياز اختبار الاتصال قبل التفعيل.', false, 'not_configured', '/api/public/payments/moyasar', 10);

-- ---------- 4) الفواتير ----------
CREATE TABLE public.platform_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id uuid,
  plan_code text,
  plan_label text,
  customer_name text NOT NULL,
  customer_legal_name text,
  customer_email text,
  customer_phone text,
  billing_address text,
  commercial_registration text,
  tax_number text,
  currency text NOT NULL DEFAULT 'SAR',
  tax_rate numeric(5,2) NOT NULL DEFAULT 15.00 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  tax_exempt boolean NOT NULL DEFAULT false,
  tax_exemption_reason text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total numeric(14,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  paid_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (paid_total >= 0),
  refunded_total numeric(14,2) NOT NULL DEFAULT 0 CHECK (refunded_total >= 0),
  remaining numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN
    ('draft','issued','pending','paid','partially_paid','overdue','cancelled','refunded','partially_refunded')),
  payment_method text,
  payment_reference text,
  service_period_start date,
  service_period_end date,
  issued_at timestamptz,
  due_at timestamptz,
  paid_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  notes text,
  internal_notes text,
  pdf_path text,
  coupon_code text,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_invoices_org_idx ON public.platform_invoices (organization_id, issued_at DESC);
CREATE INDEX platform_invoices_status_idx ON public.platform_invoices (status, due_at);
GRANT SELECT ON public.platform_invoices TO authenticated;
GRANT ALL ON public.platform_invoices TO service_role;
ALTER TABLE public.platform_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices staff read" ON public.platform_invoices FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));
CREATE POLICY "invoices customer read" ON public.platform_invoices FOR SELECT TO authenticated
  USING (status <> 'draft'
         AND (user_id = auth.uid() OR private.is_organization_member(organization_id, auth.uid())));
CREATE TRIGGER platform_invoices_updated_at BEFORE UPDATE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.platform_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price numeric(14,2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_rate numeric(5,2) NOT NULL DEFAULT 15.00 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  line_subtotal numeric(14,2) NOT NULL DEFAULT 0,
  line_tax numeric(14,2) NOT NULL DEFAULT 0,
  line_total numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_invoice_items_invoice_idx ON public.platform_invoice_items (invoice_id, sort_order);
GRANT SELECT ON public.platform_invoice_items TO authenticated;
GRANT ALL ON public.platform_invoice_items TO service_role;
ALTER TABLE public.platform_invoice_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoice items readable with invoice" ON public.platform_invoice_items FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_invoices i WHERE i.id = invoice_id));
CREATE TRIGGER platform_invoice_items_updated_at BEFORE UPDATE ON public.platform_invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 5) المدفوعات ----------
CREATE TABLE public.platform_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'SAR',
  method text NOT NULL DEFAULT 'bank_transfer'
    CHECK (method IN ('bank_transfer','manual','card','apple_pay','stc_pay','other')),
  provider text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN
    ('pending','processing','paid','failed','cancelled','refunded','partially_refunded')),
  provider_payment_id text,
  provider_reference text,
  bank_reference text,
  proof_path text,
  refunded_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (refunded_amount >= 0),
  received_at timestamptz,
  paid_at timestamptz,
  submitted_by uuid,
  submitted_by_email text,
  approved_by uuid,
  approved_by_email text,
  approved_at timestamptz,
  rejection_reason text,
  failure_code text,
  failure_message text,
  correlation_id text,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_payments_invoice_idx ON public.platform_payments (invoice_id, created_at DESC);
CREATE UNIQUE INDEX platform_payments_provider_id_idx ON public.platform_payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
GRANT SELECT ON public.platform_payments TO authenticated;
GRANT ALL ON public.platform_payments TO service_role;
ALTER TABLE public.platform_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payments staff read" ON public.platform_payments FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));
CREATE POLICY "payments customer read" ON public.platform_payments FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE TRIGGER platform_payments_updated_at BEFORE UPDATE ON public.platform_payments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.platform_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid REFERENCES public.platform_payments(id) ON DELETE CASCADE,
  invoice_id uuid REFERENCES public.platform_invoices(id) ON DELETE SET NULL,
  provider text NOT NULL,
  operation text NOT NULL CHECK (operation IN ('create','verify','status','refund','webhook')),
  status text NOT NULL CHECK (status IN ('succeeded','failed')),
  provider_status text,
  http_status integer,
  error_code text,
  error_message text,
  request_id text,
  correlation_id text,
  request_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_payment_attempts_payment_idx ON public.platform_payment_attempts (payment_id, created_at DESC);
GRANT SELECT ON public.platform_payment_attempts TO authenticated;
GRANT ALL ON public.platform_payment_attempts TO service_role;
ALTER TABLE public.platform_payment_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment attempts staff read" ON public.platform_payment_attempts FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));

CREATE TABLE public.platform_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_id uuid NOT NULL REFERENCES public.platform_payments(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE RESTRICT,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'SAR',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  provider text NOT NULL DEFAULT 'manual',
  provider_refund_id text,
  requested_by uuid,
  requested_by_email text,
  approved_by uuid,
  approved_by_email text,
  approved_at timestamptz,
  processed_at timestamptz,
  failure_message text,
  correlation_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_refunds_invoice_idx ON public.platform_refunds (invoice_id, created_at DESC);
GRANT SELECT ON public.platform_refunds TO authenticated;
GRANT ALL ON public.platform_refunds TO service_role;
ALTER TABLE public.platform_refunds ENABLE ROW LEVEL SECURITY;
CREATE POLICY "refunds staff read" ON public.platform_refunds FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));
CREATE TRIGGER platform_refunds_updated_at BEFORE UPDATE ON public.platform_refunds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 6) رسائل المزود (Webhooks) ----------
CREATE TABLE public.platform_payment_webhooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text,
  event_type text,
  signature_valid boolean NOT NULL DEFAULT false,
  replay_detected boolean NOT NULL DEFAULT false,
  request_id text,
  correlation_id text,
  raw_headers jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_body text NOT NULL DEFAULT '',
  payment_id uuid REFERENCES public.platform_payments(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.platform_invoices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received','processed','ignored','failed','dead_letter')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  next_retry_at timestamptz,
  processed_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX platform_payment_webhooks_event_idx
  ON public.platform_payment_webhooks (provider, event_id) WHERE event_id IS NOT NULL;
CREATE INDEX platform_payment_webhooks_retry_idx
  ON public.platform_payment_webhooks (status, next_retry_at);
GRANT SELECT ON public.platform_payment_webhooks TO authenticated;
GRANT ALL ON public.platform_payment_webhooks TO service_role;
ALTER TABLE public.platform_payment_webhooks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payment webhooks staff read" ON public.platform_payment_webhooks FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.manage_providers'));
CREATE TRIGGER platform_payment_webhooks_updated_at BEFORE UPDATE ON public.platform_payment_webhooks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 7) الإشعارات الدائنة ----------
CREATE TABLE public.platform_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE RESTRICT,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  tax_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  currency text NOT NULL DEFAULT 'SAR',
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('draft','issued','cancelled')),
  issued_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_by_email text,
  pdf_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_credit_notes_invoice_idx ON public.platform_credit_notes (invoice_id, issued_at DESC);
GRANT SELECT ON public.platform_credit_notes TO authenticated;
GRANT ALL ON public.platform_credit_notes TO service_role;
ALTER TABLE public.platform_credit_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit notes staff read" ON public.platform_credit_notes FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));
CREATE POLICY "credit notes customer read" ON public.platform_credit_notes FOR SELECT TO authenticated
  USING (status = 'issued' AND private.is_organization_member(organization_id, auth.uid()));
CREATE TRIGGER platform_credit_notes_updated_at BEFORE UPDATE ON public.platform_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 8) الكوبونات ----------
CREATE TABLE public.platform_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percent','fixed')),
  discount_value numeric(14,2) NOT NULL CHECK (discount_value > 0),
  currency text NOT NULL DEFAULT 'SAR',
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redeemed_count integer NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_coupons TO authenticated;
GRANT ALL ON public.platform_coupons TO service_role;
ALTER TABLE public.platform_coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons staff read" ON public.platform_coupons FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));
CREATE TRIGGER platform_coupons_updated_at BEFORE UPDATE ON public.platform_coupons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.platform_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.platform_coupons(id) ON DELETE RESTRICT,
  invoice_id uuid NOT NULL REFERENCES public.platform_invoices(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  discount_amount numeric(14,2) NOT NULL CHECK (discount_amount >= 0),
  redeemed_at timestamptz NOT NULL DEFAULT now(),
  redeemed_by uuid,
  UNIQUE (coupon_id, invoice_id)
);
GRANT SELECT ON public.platform_coupon_redemptions TO authenticated;
GRANT ALL ON public.platform_coupon_redemptions TO service_role;
ALTER TABLE public.platform_coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupon redemptions staff read" ON public.platform_coupon_redemptions FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));

-- ---------- 9) المطابقة البنكية ----------
CREATE TABLE public.platform_bank_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_ref text NOT NULL,
  bank_name text,
  amount numeric(14,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'SAR',
  value_date date NOT NULL,
  payer_name text,
  status text NOT NULL DEFAULT 'unmatched' CHECK (status IN ('unmatched','matched','partially_matched','ignored')),
  payment_id uuid REFERENCES public.platform_payments(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.platform_invoices(id) ON DELETE SET NULL,
  matched_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK (matched_amount >= 0),
  matched_by uuid,
  matched_by_email text,
  matched_at timestamptz,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (statement_ref, value_date, amount)
);
GRANT SELECT ON public.platform_bank_reconciliations TO authenticated;
GRANT ALL ON public.platform_bank_reconciliations TO service_role;
ALTER TABLE public.platform_bank_reconciliations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reconciliations staff read" ON public.platform_bank_reconciliations FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));
CREATE TRIGGER platform_bank_reconciliations_updated_at BEFORE UPDATE ON public.platform_bank_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- 10) ملاحظات مالية داخلية ----------
CREATE TABLE public.platform_billing_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_type text NOT NULL CHECK (resource_type IN ('invoice','payment','refund','credit_note','reconciliation')),
  resource_id uuid NOT NULL,
  body text NOT NULL,
  is_internal boolean NOT NULL DEFAULT true,
  author_id uuid,
  author_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_billing_notes_resource_idx ON public.platform_billing_notes (resource_type, resource_id, created_at DESC);
GRANT SELECT ON public.platform_billing_notes TO authenticated;
GRANT ALL ON public.platform_billing_notes TO service_role;
ALTER TABLE public.platform_billing_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "billing notes staff read" ON public.platform_billing_notes FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'billing.read'));

-- ---------- 11) إعادة حساب مبالغ الفاتورة وحالتها ----------
CREATE OR REPLACE FUNCTION private.recalc_invoice(_invoice_id uuid)
RETURNS void LANGUAGE plpgsql SET search_path TO 'public', 'private' AS $$
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
$$;

CREATE OR REPLACE FUNCTION private.billing_recalc_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'private' AS $$
DECLARE v_id uuid;
BEGIN
  v_id := coalesce(
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE (to_jsonb(NEW) ->> 'invoice_id')::uuid END,
    CASE WHEN TG_OP = 'DELETE' THEN (to_jsonb(OLD) ->> 'invoice_id')::uuid ELSE NULL END
  );
  IF v_id IS NOT NULL THEN PERFORM private.recalc_invoice(v_id); END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER platform_invoice_items_recalc AFTER INSERT OR UPDATE OR DELETE ON public.platform_invoice_items
  FOR EACH ROW EXECUTE FUNCTION private.billing_recalc_trigger();
CREATE TRIGGER platform_payments_recalc AFTER INSERT OR UPDATE ON public.platform_payments
  FOR EACH ROW EXECUTE FUNCTION private.billing_recalc_trigger();
CREATE TRIGGER platform_refunds_recalc AFTER INSERT OR UPDATE ON public.platform_refunds
  FOR EACH ROW EXECUTE FUNCTION private.billing_recalc_trigger();

-- ---------- 12) حرس الفترة المقفلة ومنع الحذف ----------
CREATE OR REPLACE FUNCTION private.billing_period_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'private' AS $$
DECLARE v_at timestamptz;
BEGIN
  v_at := coalesce(
    (to_jsonb(NEW) ->> 'issued_at')::timestamptz,
    (to_jsonb(NEW) ->> 'received_at')::timestamptz,
    (to_jsonb(NEW) ->> 'created_at')::timestamptz
  );
  PERFORM private.assert_period_open(v_at);
  RETURN NEW;
END;
$$;

CREATE TRIGGER platform_invoices_period_guard BEFORE INSERT OR UPDATE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION private.billing_period_guard();
CREATE TRIGGER platform_payments_period_guard BEFORE INSERT OR UPDATE ON public.platform_payments
  FOR EACH ROW EXECUTE FUNCTION private.billing_period_guard();
CREATE TRIGGER platform_refunds_period_guard BEFORE INSERT OR UPDATE ON public.platform_refunds
  FOR EACH ROW EXECUTE FUNCTION private.billing_period_guard();

CREATE OR REPLACE FUNCTION private.block_financial_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'FINANCIAL_RECORDS_CANNOT_BE_DELETED' USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER platform_invoices_no_delete BEFORE DELETE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION private.block_financial_delete();
CREATE TRIGGER platform_payments_no_delete BEFORE DELETE ON public.platform_payments
  FOR EACH ROW EXECUTE FUNCTION private.block_financial_delete();
CREATE TRIGGER platform_refunds_no_delete BEFORE DELETE ON public.platform_refunds
  FOR EACH ROW EXECUTE FUNCTION private.block_financial_delete();
CREATE TRIGGER platform_credit_notes_no_delete BEFORE DELETE ON public.platform_credit_notes
  FOR EACH ROW EXECUTE FUNCTION private.block_financial_delete();

-- منع تغيير رقم الفاتورة أو المكتب بعد الإصدار
CREATE OR REPLACE FUNCTION private.invoice_immutability_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL THEN
    NEW.number := OLD.number;
    NEW.organization_id := OLD.organization_id;
    NEW.tax_rate := OLD.tax_rate;
    NEW.issued_at := OLD.issued_at;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER platform_invoices_immutability BEFORE UPDATE ON public.platform_invoices
  FOR EACH ROW EXECUTE FUNCTION private.invoice_immutability_guard();