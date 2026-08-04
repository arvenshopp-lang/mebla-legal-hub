-- =============================================================
-- المركز المالي: عمليات مركّبة ذرّية + تقارير — كلها محمية بالصلاحيات
-- =============================================================

CREATE OR REPLACE FUNCTION public.billing_save_draft(_payload jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_id uuid := nullif(_payload->>'id', '')::uuid;
  v_email text;
  v_item jsonb;
  v_idx integer := 0;
  v_status text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001'; END IF;

  IF v_id IS NULL THEN
    IF NOT private.has_platform_permission(v_uid, 'billing.create') THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
  ELSE
    IF NOT private.has_platform_permission(v_uid, 'billing.update') THEN
      RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    SELECT status INTO v_status FROM public.platform_invoices WHERE id = v_id;
    IF v_status IS NULL THEN RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
    IF v_status <> 'draft' THEN RAISE EXCEPTION 'INVOICE_NOT_EDITABLE' USING ERRCODE = 'P0001'; END IF;
  END IF;

  SELECT email INTO v_email FROM public.platform_staff WHERE user_id = v_uid;

  IF v_id IS NULL THEN
    INSERT INTO public.platform_invoices (
      number, organization_id, subscription_id, user_id, plan_code, plan_label,
      customer_name, customer_legal_name, customer_email, customer_phone,
      billing_address, commercial_registration, tax_number,
      currency, tax_rate, tax_exempt, tax_exemption_reason,
      service_period_start, service_period_end, due_at,
      notes, internal_notes, coupon_code, status, created_by, created_by_email
    ) VALUES (
      public.next_financial_number('invoice'),
      nullif(_payload->>'organization_id','')::uuid,
      nullif(_payload->>'subscription_id','')::uuid,
      nullif(_payload->>'user_id','')::uuid,
      nullif(_payload->>'plan_code',''),
      nullif(_payload->>'plan_label',''),
      _payload->>'customer_name',
      nullif(_payload->>'customer_legal_name',''),
      nullif(_payload->>'customer_email',''),
      nullif(_payload->>'customer_phone',''),
      nullif(_payload->>'billing_address',''),
      nullif(_payload->>'commercial_registration',''),
      nullif(_payload->>'tax_number',''),
      coalesce(nullif(_payload->>'currency',''), 'SAR'),
      coalesce((_payload->>'tax_rate')::numeric, 15),
      coalesce((_payload->>'tax_exempt')::boolean, false),
      nullif(_payload->>'tax_exemption_reason',''),
      nullif(_payload->>'service_period_start','')::date,
      nullif(_payload->>'service_period_end','')::date,
      nullif(_payload->>'due_at','')::timestamptz,
      nullif(_payload->>'notes',''),
      nullif(_payload->>'internal_notes',''),
      nullif(_payload->>'coupon_code',''),
      'draft', v_uid, v_email
    ) RETURNING id INTO v_id;
  ELSE
    UPDATE public.platform_invoices SET
      organization_id = nullif(_payload->>'organization_id','')::uuid,
      subscription_id = nullif(_payload->>'subscription_id','')::uuid,
      user_id = nullif(_payload->>'user_id','')::uuid,
      plan_code = nullif(_payload->>'plan_code',''),
      plan_label = nullif(_payload->>'plan_label',''),
      customer_name = _payload->>'customer_name',
      customer_legal_name = nullif(_payload->>'customer_legal_name',''),
      customer_email = nullif(_payload->>'customer_email',''),
      customer_phone = nullif(_payload->>'customer_phone',''),
      billing_address = nullif(_payload->>'billing_address',''),
      commercial_registration = nullif(_payload->>'commercial_registration',''),
      tax_number = nullif(_payload->>'tax_number',''),
      currency = coalesce(nullif(_payload->>'currency',''), 'SAR'),
      tax_rate = coalesce((_payload->>'tax_rate')::numeric, 15),
      tax_exempt = coalesce((_payload->>'tax_exempt')::boolean, false),
      tax_exemption_reason = nullif(_payload->>'tax_exemption_reason',''),
      service_period_start = nullif(_payload->>'service_period_start','')::date,
      service_period_end = nullif(_payload->>'service_period_end','')::date,
      due_at = nullif(_payload->>'due_at','')::timestamptz,
      notes = nullif(_payload->>'notes',''),
      internal_notes = nullif(_payload->>'internal_notes',''),
      coupon_code = nullif(_payload->>'coupon_code',''),
      updated_at = now()
    WHERE id = v_id;
  END IF;

  DELETE FROM public.platform_invoice_items WHERE invoice_id = v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(_payload->'items', '[]'::jsonb))
  LOOP
    INSERT INTO public.platform_invoice_items (
      invoice_id, description, quantity, unit_price, discount_amount, tax_rate, sort_order
    ) VALUES (
      v_id,
      v_item->>'description',
      greatest(coalesce((v_item->>'quantity')::numeric, 1), 0),
      greatest(coalesce((v_item->>'unit_price')::numeric, 0), 0),
      greatest(coalesce((v_item->>'discount_amount')::numeric, 0), 0),
      CASE WHEN coalesce((_payload->>'tax_exempt')::boolean, false) THEN 0
           ELSE coalesce((_payload->>'tax_rate')::numeric, 15) END,
      v_idx
    );
    v_idx := v_idx + 1;
  END LOOP;

  PERFORM public.recalc_invoice(v_id);
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_save_draft(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_save_draft(jsonb) TO authenticated, service_role;

-- ------------------------------------------------- المطابقة البنكية الذرّية
CREATE OR REPLACE FUNCTION public.billing_match_reconciliation(_entry_id uuid, _payment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_entry public.platform_bank_reconciliations;
  v_payment public.platform_payments;
BEGIN
  IF v_uid IS NULL OR NOT private.has_platform_permission(v_uid, 'billing.reconcile') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  SELECT email INTO v_email FROM public.platform_staff WHERE user_id = v_uid;

  SELECT * INTO v_entry FROM public.platform_bank_reconciliations WHERE id = _entry_id FOR UPDATE;
  IF v_entry.id IS NULL THEN RAISE EXCEPTION 'ENTRY_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_entry.status = 'matched' THEN RAISE EXCEPTION 'ENTRY_ALREADY_MATCHED' USING ERRCODE = 'P0001'; END IF;

  SELECT * INTO v_payment FROM public.platform_payments WHERE id = _payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_payment.currency <> v_entry.currency THEN RAISE EXCEPTION 'CURRENCY_MISMATCH' USING ERRCODE = 'P0001'; END IF;

  UPDATE public.platform_bank_reconciliations SET
    status = 'matched',
    payment_id = v_payment.id,
    invoice_id = v_payment.invoice_id,
    matched_amount = least(v_entry.amount, v_payment.amount),
    matched_by = v_uid,
    matched_by_email = v_email,
    matched_at = now(),
    updated_at = now()
  WHERE id = _entry_id;

  UPDATE public.platform_payments SET
    bank_reference = coalesce(bank_reference, v_entry.statement_ref),
    updated_at = now()
  WHERE id = _payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_match_reconciliation(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_match_reconciliation(uuid, uuid) TO authenticated, service_role;

-- ------------------------------------------ إعادة فتح الفترة بموافقة مزدوجة
CREATE OR REPLACE FUNCTION public.billing_reopen_period(_approval_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_ap public.platform_period_reopen_approvals;
BEGIN
  IF v_uid IS NULL OR NOT private.has_platform_permission(v_uid, 'billing.reopen_period') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  SELECT email INTO v_email FROM public.platform_staff WHERE user_id = v_uid;

  SELECT * INTO v_ap FROM public.platform_period_reopen_approvals WHERE id = _approval_id FOR UPDATE;
  IF v_ap.id IS NULL THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND' USING ERRCODE = 'P0001'; END IF;
  IF v_ap.status <> 'pending' THEN RAISE EXCEPTION 'REQUEST_NOT_PENDING' USING ERRCODE = 'P0001'; END IF;
  IF v_ap.requested_by = v_uid THEN RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN' USING ERRCODE = 'P0001'; END IF;

  UPDATE public.platform_period_reopen_approvals SET
    status = 'approved', approved_by = v_uid, approved_by_email = v_email,
    approved_at = now(), updated_at = now()
  WHERE id = _approval_id;

  UPDATE public.platform_financial_periods SET
    status = 'open', reopened_at = now(), reopened_by = v_uid,
    reopen_reason = v_ap.reason, updated_at = now()
  WHERE id = v_ap.period_id;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_reopen_period(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_reopen_period(uuid) TO authenticated, service_role;

-- ------------------------------------------------------ التقارير المالية
CREATE OR REPLACE FUNCTION public.billing_reports(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_invoiced numeric := 0;
  v_collected numeric := 0;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT (
      private.has_platform_permission(v_uid, 'billing.view_reports')
      OR private.has_platform_permission(v_uid, 'billing.read')) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(sum(total), 0) INTO v_invoiced
  FROM public.platform_invoices
  WHERE status NOT IN ('draft','cancelled') AND issued_at BETWEEN _from AND _to;

  SELECT coalesce(sum(amount), 0) INTO v_collected
  FROM public.platform_payments
  WHERE status IN ('paid','refunded','partially_refunded') AND coalesce(paid_at, received_at, created_at) BETWEEN _from AND _to;

  v_result := jsonb_build_object(
    'generated_at', now(),
    'range', jsonb_build_object('from', _from, 'to', _to),
    'summary', jsonb_build_object(
      'invoiced_total', round(v_invoiced, 2),
      'collected_total', round(v_collected, 2),
      'outstanding_total', (SELECT round(coalesce(sum(remaining), 0), 2) FROM public.platform_invoices
                            WHERE status IN ('issued','pending','partially_paid','overdue')),
      'overdue_total', (SELECT round(coalesce(sum(remaining), 0), 2) FROM public.platform_invoices
                        WHERE status IN ('issued','pending','partially_paid','overdue') AND due_at < now()),
      'refunded_total', (SELECT round(coalesce(sum(amount), 0), 2) FROM public.platform_refunds
                         WHERE status = 'completed' AND processed_at BETWEEN _from AND _to),
      'discount_total', (SELECT round(coalesce(sum(discount_total), 0), 2) FROM public.platform_invoices
                         WHERE status NOT IN ('draft','cancelled') AND issued_at BETWEEN _from AND _to),
      'tax_total', (SELECT round(coalesce(sum(tax_total), 0), 2) FROM public.platform_invoices
                    WHERE status NOT IN ('draft','cancelled') AND issued_at BETWEEN _from AND _to),
      'credit_note_total', (SELECT round(coalesce(sum(amount + tax_amount), 0), 2) FROM public.platform_credit_notes
                            WHERE status = 'issued' AND issued_at BETWEEN _from AND _to),
      'invoice_count', (SELECT count(*) FROM public.platform_invoices
                        WHERE status NOT IN ('draft','cancelled') AND issued_at BETWEEN _from AND _to),
      'draft_count', (SELECT count(*) FROM public.platform_invoices WHERE status = 'draft'),
      'paid_count', (SELECT count(*) FROM public.platform_invoices WHERE status = 'paid'),
      'partially_paid_count', (SELECT count(*) FROM public.platform_invoices WHERE status = 'partially_paid'),
      'pending_count', (SELECT count(*) FROM public.platform_invoices WHERE status IN ('issued','pending')),
      'overdue_count', (SELECT count(*) FROM public.platform_invoices
                        WHERE status IN ('issued','pending','partially_paid','overdue') AND due_at < now()),
      'collection_rate', CASE WHEN v_invoiced = 0 THEN 0 ELSE round((v_collected / v_invoiced) * 100, 2) END,
      'avg_collection_days', (SELECT coalesce(round(avg(extract(epoch FROM (paid_at - issued_at)) / 86400)::numeric, 1), 0)
                              FROM public.platform_invoices
                              WHERE status = 'paid' AND paid_at IS NOT NULL AND issued_at IS NOT NULL
                                AND paid_at BETWEEN _from AND _to),
      'attempt_success_rate', (SELECT CASE WHEN count(*) = 0 THEN 0
                                 ELSE round((count(*) FILTER (WHERE status = 'success')::numeric / count(*)) * 100, 2) END
                               FROM public.platform_payment_attempts WHERE created_at BETWEEN _from AND _to),
      'attempts_total', (SELECT count(*) FROM public.platform_payment_attempts WHERE created_at BETWEEN _from AND _to)
    ),
    'aging', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'sort'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('key', k, 'label', l, 'sort', s,
                 'count', count(i.id), 'amount', round(coalesce(sum(i.remaining), 0), 2)) AS x
        FROM (VALUES ('current','غير مستحقة',1,-999999,0),
                     ('d1_30','١–٣٠ يوماً',2,1,30),
                     ('d31_60','٣١–٦٠ يوماً',3,31,60),
                     ('d61_90','٦١–٩٠ يوماً',4,61,90),
                     ('d90_plus','أكثر من ٩٠ يوماً',5,91,999999)) AS b(k,l,s,lo,hi)
        LEFT JOIN public.platform_invoices i
          ON i.status IN ('issued','pending','partially_paid','overdue')
         AND i.remaining > 0
         AND floor(extract(epoch FROM (now() - coalesce(i.due_at, i.issued_at, i.created_at))) / 86400) BETWEEN b.lo AND b.hi
        GROUP BY k, l, s) y),
    'by_plan', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('label', coalesce(plan_label, 'بدون باقة'), 'count', count(*),
                 'invoiced', round(coalesce(sum(total), 0), 2), 'collected', round(coalesce(sum(paid_total), 0), 2)) AS x
        FROM public.platform_invoices
        WHERE status NOT IN ('draft','cancelled') AND issued_at BETWEEN _from AND _to
        GROUP BY coalesce(plan_label, 'بدون باقة') ORDER BY sum(total) DESC NULLS LAST LIMIT 20) y),
    'by_office', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('label', coalesce(o.name, i.customer_name), 'count', count(*),
                 'invoiced', round(coalesce(sum(i.total), 0), 2),
                 'collected', round(coalesce(sum(i.paid_total), 0), 2),
                 'outstanding', round(coalesce(sum(i.remaining), 0), 2)) AS x
        FROM public.platform_invoices i
        LEFT JOIN public.organizations o ON o.id = i.organization_id
        WHERE i.status NOT IN ('draft','cancelled') AND i.issued_at BETWEEN _from AND _to
        GROUP BY coalesce(o.name, i.customer_name) ORDER BY sum(i.total) DESC NULLS LAST LIMIT 20) y),
    'by_month', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'month'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('month', to_char(date_trunc('month', issued_at), 'YYYY-MM'),
                 'invoiced', round(coalesce(sum(total), 0), 2),
                 'collected', round(coalesce(sum(paid_total), 0), 2), 'count', count(*)) AS x
        FROM public.platform_invoices
        WHERE status NOT IN ('draft','cancelled')
          AND issued_at >= (date_trunc('month', now()) - interval '11 months')
        GROUP BY date_trunc('month', issued_at)) y),
    'payments_by_method', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('label', method, 'count', count(*), 'amount', round(coalesce(sum(amount), 0), 2)) AS x
        FROM public.platform_payments
        WHERE status IN ('paid','refunded','partially_refunded') AND coalesce(paid_at, received_at, created_at) BETWEEN _from AND _to
        GROUP BY method ORDER BY sum(amount) DESC NULLS LAST) y),
    'unmatched_payments', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', p.id, 'number', i.number, 'amount', p.amount,
                 'created_at', p.created_at, 'method', p.method, 'status', p.status) AS x
        FROM public.platform_payments p
        LEFT JOIN public.platform_invoices i ON i.id = p.invoice_id
        WHERE p.status = 'pending' ORDER BY p.created_at LIMIT 50) y),
    'unmatched_bank_entries', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('id', id, 'statement_ref', statement_ref, 'amount', amount,
                 'value_date', value_date, 'payer_name', payer_name) AS x
        FROM public.platform_bank_reconciliations WHERE status <> 'matched'
        ORDER BY value_date DESC LIMIT 50) y)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.billing_reports(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.billing_reports(timestamptz, timestamptz) TO authenticated, service_role;