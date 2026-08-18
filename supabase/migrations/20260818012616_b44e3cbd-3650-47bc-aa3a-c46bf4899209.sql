-- 1) عدّاد أرقام العقود لكل مكتب/سنة
CREATE TABLE public.contract_number_counters (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, year)
);
GRANT SELECT ON public.contract_number_counters TO authenticated;
GRANT ALL ON public.contract_number_counters TO service_role;
ALTER TABLE public.contract_number_counters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org members read contract counters"
ON public.contract_number_counters FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contract_number_counters.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
));

-- 2) جدول العقود
CREATE TABLE public.contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  case_id UUID REFERENCES public.cases(id) ON DELETE SET NULL,
  contract_number TEXT NOT NULL,
  title TEXT NOT NULL,
  contract_type TEXT NOT NULL DEFAULT 'custom',
  status TEXT NOT NULL DEFAULT 'draft',
  first_party JSONB NOT NULL DEFAULT '{}'::jsonb,
  second_party JSONB NOT NULL DEFAULT '{}'::jsonb,
  clauses JSONB NOT NULL DEFAULT '[]'::jsonb,
  total_amount NUMERIC(14,2),
  advance_amount NUMERIC(14,2),
  final_amount NUMERIC(14,2),
  lawyer_signature JSONB,
  client_signature JSONB,
  sign_token_hash TEXT,
  expires_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contracts_status_check CHECK (status IN ('draft','pending_signature','signed','cancelled','expired')),
  CONSTRAINT contracts_type_check CHECK (contract_type IN ('fee_agreement','legal_retainer','nda','settlement','custom')),
  CONSTRAINT contracts_number_unique UNIQUE (organization_id, contract_number)
);
CREATE UNIQUE INDEX contracts_sign_token_hash_key ON public.contracts (sign_token_hash) WHERE sign_token_hash IS NOT NULL;
CREATE INDEX contracts_org_created_idx ON public.contracts (organization_id, created_at DESC);
CREATE INDEX contracts_org_status_idx ON public.contracts (organization_id, status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT ALL ON public.contracts TO service_role;
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read contracts"
ON public.contracts FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contracts.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
));

CREATE POLICY "org members create contracts"
ON public.contracts FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contracts.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('owner','admin','lawyer','legal_assistant')
));

CREATE POLICY "org members update contracts"
ON public.contracts FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contracts.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('owner','admin','lawyer','legal_assistant')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contracts.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('owner','admin','lawyer','legal_assistant')
));

CREATE POLICY "org managers delete draft contracts"
ON public.contracts FOR DELETE TO authenticated
USING (
  status = 'draft'
  AND EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = contracts.organization_id
      AND m.user_id = auth.uid() AND m.status = 'active'
      AND m.role IN ('owner','admin')
  )
);

-- منع تعديل العقود الموقّعة أو الملغاة (يُسمح فقط بتغيير الحالة إلى expired)
CREATE OR REPLACE FUNCTION public.contracts_immutability_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.status IN ('signed','cancelled') THEN
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'CONTRACT_LOCKED: لا يمكن تعديل عقد موقّع أو ملغى.';
    END IF;
    IF NOT (OLD.status = 'cancelled' AND NEW.status = 'expired') THEN
      RAISE EXCEPTION 'CONTRACT_LOCKED: لا يمكن تعديل عقد موقّع أو ملغى.';
    END IF;
  END IF;
  NEW.organization_id := OLD.organization_id;
  NEW.contract_number := OLD.contract_number;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER contracts_immutability BEFORE UPDATE ON public.contracts
FOR EACH ROW EXECUTE FUNCTION public.contracts_immutability_guard();

-- 3) سجل تدقيق العقود
CREATE TABLE public.contract_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID,
  actor_label TEXT,
  ip_address TEXT,
  user_agent TEXT,
  trace_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_events_type_check CHECK (event_type IN (
    'created','updated','sent_for_signature','viewed_by_client','signed_by_client',
    'signed_by_lawyer','cancelled','exported_pdf','converted_to_case','converted_to_invoice'
  ))
);
CREATE INDEX contract_events_contract_idx ON public.contract_events (contract_id, created_at DESC);
GRANT SELECT ON public.contract_events TO authenticated;
GRANT ALL ON public.contract_events TO service_role;
ALTER TABLE public.contract_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read contract events"
ON public.contract_events FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contract_events.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
));

CREATE TRIGGER contract_events_no_update BEFORE UPDATE ON public.contract_events
FOR EACH ROW EXECUTE FUNCTION public.deny_update();
CREATE TRIGGER contract_events_no_delete BEFORE DELETE ON public.contract_events
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 4) توليد رقم عقد تسلسلي لكل مكتب/سنة
CREATE OR REPLACE FUNCTION public.next_contract_number(_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _year INTEGER := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Riyadh'))::INTEGER;
  _next INTEGER;
BEGIN
  INSERT INTO public.contract_number_counters (organization_id, year, last_number)
  VALUES (_organization_id, _year, 1)
  ON CONFLICT (organization_id, year)
  DO UPDATE SET last_number = public.contract_number_counters.last_number + 1, updated_at = now()
  RETURNING last_number INTO _next;

  RETURN 'CTR-' || _year::TEXT || '-' || LPAD(_next::TEXT, 4, '0');
END;
$$;
REVOKE ALL ON FUNCTION public.next_contract_number(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_contract_number(UUID) TO service_role;