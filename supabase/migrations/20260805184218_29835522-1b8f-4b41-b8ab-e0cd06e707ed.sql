CREATE TYPE public.sales_doc_kind AS ENUM ('quote','proposal','contract');
CREATE TYPE public.sales_doc_status AS ENUM
  ('draft','pending_approval','approved','sent','viewed','accepted','rejected','expired','cancelled','active','terminated');

CREATE TABLE public.sales_document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.sales_doc_kind NOT NULL,
  name text NOT NULL,
  intro text,
  terms text,
  default_tax_rate numeric(5,2) NOT NULL DEFAULT 15,
  default_validity_days integer NOT NULL DEFAULT 30,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_tpl_name_len CHECK (char_length(btrim(name)) BETWEEN 2 AND 160),
  CONSTRAINT sales_tpl_tax_chk CHECK (default_tax_rate >= 0 AND default_tax_rate <= 100),
  CONSTRAINT sales_tpl_validity_chk CHECK (default_validity_days BETWEEN 1 AND 365)
);
CREATE UNIQUE INDEX sales_document_templates_name_key ON public.sales_document_templates (kind, lower(btrim(name)));

CREATE TABLE public.sales_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.sales_doc_kind NOT NULL,
  number text,
  title text NOT NULL,
  status public.sales_doc_status NOT NULL DEFAULT 'draft',
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.crm_deals(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  template_id uuid REFERENCES public.sales_document_templates(id) ON DELETE SET NULL,
  currency text NOT NULL DEFAULT 'SAR',
  intro text,
  terms text,
  notes text,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  discount_type text NOT NULL DEFAULT 'none',
  discount_value numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate numeric(5,2) NOT NULL DEFAULT 15,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  valid_until date,
  starts_on date,
  ends_on date,
  owner_staff_id uuid REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  requires_approval boolean NOT NULL DEFAULT false,
  approved_by uuid,
  approved_at timestamptz,
  sent_at timestamptz,
  first_viewed_at timestamptz,
  decided_at timestamptz,
  decision_note text,
  locked boolean NOT NULL DEFAULT false,
  converted_invoice_id uuid REFERENCES public.platform_invoices(id) ON DELETE SET NULL,
  converted_subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  version integer NOT NULL DEFAULT 1,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_doc_title_len CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
  CONSTRAINT sales_doc_discount_type_chk CHECK (discount_type IN ('none','percent','amount')),
  CONSTRAINT sales_doc_amount_chk CHECK (subtotal >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND total >= 0),
  CONSTRAINT sales_doc_tax_chk CHECK (tax_rate >= 0 AND tax_rate <= 100)
);
CREATE UNIQUE INDEX sales_documents_number_key ON public.sales_documents (number) WHERE number IS NOT NULL;
CREATE INDEX sales_documents_status_idx ON public.sales_documents (kind, status, created_at DESC);
CREATE INDEX sales_documents_company_idx ON public.sales_documents (company_id);

CREATE TABLE public.sales_document_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sales_documents(id) ON DELETE CASCADE,
  description text NOT NULL,
  quantity numeric(12,2) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_item_desc_len CHECK (char_length(btrim(description)) BETWEEN 2 AND 300),
  CONSTRAINT sales_item_qty_chk CHECK (quantity > 0),
  CONSTRAINT sales_item_price_chk CHECK (unit_price >= 0 AND discount_amount >= 0 AND amount >= 0)
);
CREATE INDEX sales_document_items_doc_idx ON public.sales_document_items (document_id, sort_order);

CREATE TABLE public.sales_document_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sales_documents(id) ON DELETE CASCADE,
  event text NOT NULL,
  actor_email text,
  from_status public.sales_doc_status,
  to_status public.sales_doc_status,
  note text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sales_document_events_doc_idx ON public.sales_document_events (document_id, created_at DESC);

CREATE TABLE public.sales_document_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES public.sales_documents(id) ON DELETE CASCADE,
  signer_name text NOT NULL,
  signer_email text NOT NULL,
  signer_role text,
  method text NOT NULL DEFAULT 'typed',
  signed_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  evidence_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sales_sig_method_chk CHECK (method IN ('typed','drawn','otp'))
);
CREATE INDEX sales_document_signatures_doc_idx ON public.sales_document_signatures (document_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_document_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_document_items TO authenticated;
GRANT SELECT ON public.sales_document_events TO authenticated;
GRANT SELECT ON public.sales_document_signatures TO authenticated;
GRANT ALL ON public.sales_document_templates, public.sales_documents, public.sales_document_items,
  public.sales_document_events, public.sales_document_signatures TO service_role;

ALTER TABLE public.sales_document_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_document_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_document_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_document_signatures ENABLE ROW LEVEL SECURITY;

CREATE POLICY sales_tpl_read ON public.sales_document_templates FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.read'));
CREATE POLICY sales_tpl_write ON public.sales_document_templates FOR INSERT TO authenticated
  WITH CHECK (private.has_platform_permission(auth.uid(), 'sales_docs.manage_templates'));
CREATE POLICY sales_tpl_update ON public.sales_document_templates FOR UPDATE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.manage_templates'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'sales_docs.manage_templates'));
CREATE POLICY sales_tpl_delete ON public.sales_document_templates FOR DELETE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.manage_templates'));

CREATE POLICY sales_doc_read ON public.sales_documents FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.read'));
CREATE POLICY sales_doc_insert ON public.sales_documents FOR INSERT TO authenticated
  WITH CHECK (private.has_platform_permission(auth.uid(), 'sales_docs.create'));
CREATE POLICY sales_doc_update ON public.sales_documents FOR UPDATE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.update') AND locked = false)
  WITH CHECK (private.has_platform_permission(auth.uid(), 'sales_docs.update'));
CREATE POLICY sales_doc_delete ON public.sales_documents FOR DELETE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.delete') AND status = 'draft');

CREATE POLICY sales_item_read ON public.sales_document_items FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.read'));
CREATE POLICY sales_item_insert ON public.sales_document_items FOR INSERT TO authenticated
  WITH CHECK (private.has_platform_permission(auth.uid(), 'sales_docs.update'));
CREATE POLICY sales_item_update ON public.sales_document_items FOR UPDATE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.update'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'sales_docs.update'));
CREATE POLICY sales_item_delete ON public.sales_document_items FOR DELETE TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.update'));

CREATE POLICY sales_event_read ON public.sales_document_events FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.read'));
CREATE POLICY sales_sig_read ON public.sales_document_signatures FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'sales_docs.read'));

CREATE TRIGGER sales_tpl_updated BEFORE UPDATE ON public.sales_document_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER sales_doc_updated BEFORE UPDATE ON public.sales_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- سجل الأحداث والتوقيعات غير قابل للتعديل أو الحذف
CREATE TRIGGER sales_events_no_update BEFORE UPDATE ON public.sales_document_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();
CREATE TRIGGER sales_events_no_delete BEFORE DELETE ON public.sales_document_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();
CREATE TRIGGER sales_sig_no_update BEFORE UPDATE ON public.sales_document_signatures
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();
CREATE TRIGGER sales_sig_no_delete BEFORE DELETE ON public.sales_document_signatures
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- تجميد القيم المالية بعد الاعتماد النهائي
CREATE OR REPLACE FUNCTION public.sales_documents_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status IN ('accepted','active','terminated','expired','cancelled','rejected') THEN
    IF NEW.subtotal <> OLD.subtotal OR NEW.total <> OLD.total OR NEW.tax_rate <> OLD.tax_rate
       OR NEW.tax_amount <> OLD.tax_amount OR NEW.discount_amount <> OLD.discount_amount
       OR NEW.currency <> OLD.currency OR NEW.kind <> OLD.kind
       OR coalesce(NEW.number,'') <> coalesce(OLD.number,'') THEN
      RAISE EXCEPTION 'SALES_DOC_LOCKED' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER sales_doc_immutability BEFORE UPDATE ON public.sales_documents
  FOR EACH ROW EXECUTE FUNCTION public.sales_documents_immutability_guard();

-- منع تعديل البنود بعد اعتماد المستند
CREATE OR REPLACE FUNCTION public.sales_document_items_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_doc uuid := coalesce(NEW.document_id, OLD.document_id);
  v_status public.sales_doc_status;
BEGIN
  SELECT status INTO v_status FROM public.sales_documents WHERE id = v_doc;
  IF v_status IS NOT NULL AND v_status NOT IN ('draft','pending_approval','approved') THEN
    RAISE EXCEPTION 'SALES_DOC_LOCKED' USING ERRCODE = 'P0001';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER sales_items_locked_guard BEFORE INSERT OR UPDATE OR DELETE ON public.sales_document_items
  FOR EACH ROW EXECUTE FUNCTION public.sales_document_items_guard();