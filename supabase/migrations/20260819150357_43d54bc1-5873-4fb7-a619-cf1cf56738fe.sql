-- 1) توسيع حالات العقد (غير هدّام: الحالات القديمة تبقى صالحة)
ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE public.contracts ADD CONSTRAINT contracts_status_check CHECK (status IN (
  'draft','ready_for_signature','sent','viewed','pending_signature','partially_signed',
  'signed','rejected','cancelled','expired'
));

-- 2) حقول جديدة على العقود
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS current_version_id UUID,
  ADD COLUMN IF NOT EXISTS verification_id TEXT,
  ADD COLUMN IF NOT EXISTS office_endorsement JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS contracts_verification_id_key
  ON public.contracts (verification_id) WHERE verification_id IS NOT NULL;

-- 3) نسخ العقد — النسخة النهائية وبصمتها
CREATE TABLE public.contract_versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  state TEXT NOT NULL DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_versions_state_check CHECK (state IN ('active','superseded','cancelled')),
  CONSTRAINT contract_versions_number_unique UNIQUE (contract_id, version_number)
);
CREATE INDEX contract_versions_contract_idx ON public.contract_versions (contract_id, version_number DESC);
CREATE INDEX contract_versions_org_idx ON public.contract_versions (organization_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.contract_versions TO authenticated;
GRANT ALL ON public.contract_versions TO service_role;
ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read contract versions"
ON public.contract_versions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contract_versions.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
));

CREATE POLICY "org writers create contract versions"
ON public.contract_versions FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contract_versions.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('owner','admin','lawyer','legal_assistant')
));

CREATE POLICY "org writers supersede contract versions"
ON public.contract_versions FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contract_versions.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('owner','admin','lawyer','legal_assistant')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contract_versions.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('owner','admin','lawyer','legal_assistant')
));

-- محتوى النسخة وبصمتها غير قابلين للتعديل؛ يُسمح فقط بتغيير حالة النسخة
CREATE OR REPLACE FUNCTION public.contract_versions_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.id := OLD.id;
  NEW.organization_id := OLD.organization_id;
  NEW.contract_id := OLD.contract_id;
  NEW.version_number := OLD.version_number;
  NEW.content_hash := OLD.content_hash;
  NEW.snapshot := OLD.snapshot;
  NEW.created_by := OLD.created_by;
  NEW.created_at := OLD.created_at;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contract_versions_immutability BEFORE UPDATE ON public.contract_versions
FOR EACH ROW EXECUTE FUNCTION public.contract_versions_guard();

CREATE TRIGGER contract_versions_no_delete BEFORE DELETE ON public.contract_versions
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

ALTER TABLE public.contracts
  ADD CONSTRAINT contracts_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES public.contract_versions(id) ON DELETE SET NULL;

-- 4) موقّعو العقد
CREATE TABLE public.contract_signers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  version_id UUID REFERENCES public.contract_versions(id) ON DELETE SET NULL,
  party_role TEXT NOT NULL DEFAULT 'second_party',
  full_name TEXT NOT NULL,
  capacity TEXT,
  phone TEXT,
  email TEXT,
  sign_order INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  verification_method TEXT NOT NULL DEFAULT 'none',
  otp_reference UUID,
  sign_token_hash TEXT,
  token_expires_at TIMESTAMPTZ,
  consumed_at TIMESTAMPTZ,
  viewed_at TIMESTAMPTZ,
  consent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signature JSONB,
  signature_hash TEXT,
  ip_address TEXT,
  user_agent TEXT,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT contract_signers_status_check CHECK (status IN ('pending','sent','viewed','signed','rejected','cancelled','expired')),
  CONSTRAINT contract_signers_role_check CHECK (party_role IN ('first_party','second_party','witness','other')),
  CONSTRAINT contract_signers_verification_check CHECK (verification_method IN ('none','otp_sms','otp_email','external_provider')),
  CONSTRAINT contract_signers_order_check CHECK (sign_order >= 1)
);
CREATE UNIQUE INDEX contract_signers_token_key
  ON public.contract_signers (sign_token_hash) WHERE sign_token_hash IS NOT NULL;
CREATE INDEX contract_signers_contract_idx ON public.contract_signers (contract_id, sign_order);
CREATE INDEX contract_signers_org_idx ON public.contract_signers (organization_id, status);

GRANT SELECT, INSERT, UPDATE ON public.contract_signers TO authenticated;
GRANT ALL ON public.contract_signers TO service_role;
ALTER TABLE public.contract_signers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members read contract signers"
ON public.contract_signers FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contract_signers.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
));

CREATE POLICY "org writers create contract signers"
ON public.contract_signers FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contract_signers.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('owner','admin','lawyer','legal_assistant')
));

CREATE POLICY "org writers update contract signers"
ON public.contract_signers FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contract_signers.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('owner','admin','lawyer','legal_assistant')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.organization_members m
  WHERE m.organization_id = contract_signers.organization_id
    AND m.user_id = auth.uid() AND m.status = 'active'
    AND m.role IN ('owner','admin','lawyer','legal_assistant')
));

-- التوقيع المسجَّل وأدلته لا تُعدّل ولا تُحذف بعد تسجيلها
CREATE OR REPLACE FUNCTION public.contract_signers_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.organization_id := OLD.organization_id;
  NEW.contract_id := OLD.contract_id;
  NEW.created_at := OLD.created_at;
  NEW.updated_at := now();

  IF OLD.status = 'signed' THEN
    IF NEW.status <> 'signed' THEN
      RAISE EXCEPTION 'SIGNER_LOCKED: لا يمكن تغيير حالة موقّع أنهى التوقيع.';
    END IF;
    NEW.signature := OLD.signature;
    NEW.signature_hash := OLD.signature_hash;
    NEW.signed_at := OLD.signed_at;
    NEW.consent_at := OLD.consent_at;
    NEW.ip_address := OLD.ip_address;
    NEW.user_agent := OLD.user_agent;
    NEW.full_name := OLD.full_name;
    NEW.sign_order := OLD.sign_order;
    NEW.party_role := OLD.party_role;
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER contract_signers_immutability BEFORE UPDATE ON public.contract_signers
FOR EACH ROW EXECUTE FUNCTION public.contract_signers_guard();

CREATE TRIGGER contract_signers_no_delete BEFORE DELETE ON public.contract_signers
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();