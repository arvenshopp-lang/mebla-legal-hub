-- =========================================================
-- P1-3 / P1-11 : Application-level field encryption + key management
-- =========================================================

-- 1) Encrypted PII columns (ciphertext + deterministic blind index)
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS national_id_enc text,
  ADD COLUMN IF NOT EXISTS national_id_bidx text,
  ADD COLUMN IF NOT EXISTS commercial_registration_enc text,
  ADD COLUMN IF NOT EXISTS commercial_registration_bidx text,
  ADD COLUMN IF NOT EXISTS pii_key_version smallint;

ALTER TABLE public.case_parties
  ADD COLUMN IF NOT EXISTS national_id_enc text,
  ADD COLUMN IF NOT EXISTS national_id_bidx text,
  ADD COLUMN IF NOT EXISTS commercial_registration_enc text,
  ADD COLUMN IF NOT EXISTS commercial_registration_bidx text,
  ADD COLUMN IF NOT EXISTS pii_key_version smallint;

CREATE INDEX IF NOT EXISTS clients_national_id_bidx_idx
  ON public.clients (organization_id, national_id_bidx);
CREATE INDEX IF NOT EXISTS clients_cr_bidx_idx
  ON public.clients (organization_id, commercial_registration_bidx);
CREATE INDEX IF NOT EXISTS case_parties_national_id_bidx_idx
  ON public.case_parties (organization_id, national_id_bidx);

-- 2) Hard guarantee: plaintext PII can never be persisted, whatever the caller
CREATE OR REPLACE FUNCTION public.strip_plaintext_pii()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.national_id := NULL;
  NEW.commercial_registration := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clients_strip_plaintext_pii ON public.clients;
CREATE TRIGGER clients_strip_plaintext_pii
  BEFORE INSERT OR UPDATE ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.strip_plaintext_pii();

DROP TRIGGER IF EXISTS case_parties_strip_plaintext_pii ON public.case_parties;
CREATE TRIGGER case_parties_strip_plaintext_pii
  BEFORE INSERT OR UPDATE ON public.case_parties
  FOR EACH ROW EXECUTE FUNCTION public.strip_plaintext_pii();

-- Purge any plaintext already at rest
UPDATE public.clients
   SET national_id = NULL, commercial_registration = NULL
 WHERE national_id IS NOT NULL OR commercial_registration IS NOT NULL;
UPDATE public.case_parties
   SET national_id = NULL, commercial_registration = NULL
 WHERE national_id IS NOT NULL OR commercial_registration IS NOT NULL;

-- 3) Key registry (metadata only — never key material)
CREATE TABLE IF NOT EXISTS public.encryption_key_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_version smallint NOT NULL UNIQUE,
  purpose text NOT NULL,
  algorithm text NOT NULL,
  derivation text NOT NULL,
  secret_name text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  activated_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  rotated_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.encryption_key_registry TO authenticated;
GRANT ALL ON public.encryption_key_registry TO service_role;
ALTER TABLE public.encryption_key_registry ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS key_registry_staff_read ON public.encryption_key_registry;
CREATE POLICY key_registry_staff_read ON public.encryption_key_registry
  FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'settings.manage'));

DROP TRIGGER IF EXISTS encryption_key_registry_updated_at ON public.encryption_key_registry;
CREATE TRIGGER encryption_key_registry_updated_at
  BEFORE UPDATE ON public.encryption_key_registry
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.encryption_key_registry
  (key_version, purpose, algorithm, derivation, secret_name, status, notes)
VALUES
  (1, 'pii_field_encryption', 'AES-256-GCM', 'HKDF-SHA256 (per organization + field)', 'MEHLA_MASTER_KEY_V1', 'active',
   'مفتاح رئيسي لتشفير حقول الهوية والسجل التجاري. يُشتق منه مفتاح فرعي لكل مكتب وحقل.'),
  (1, 'pii_blind_index', 'HMAC-SHA256', 'HMAC (per organization + field)', 'MEHLA_BLIND_INDEX_KEY_V1', 'active',
   'مفتاح بصمة البحث الحتمية — يتيح البحث بالرقم دون تخزينه صريحاً.')
ON CONFLICT DO NOTHING;

-- 4) Immutable PII reveal log
CREATE TABLE IF NOT EXISTS public.pii_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  entity_type text NOT NULL,
  entity_id uuid,
  field text NOT NULL,
  reason text,
  key_version smallint,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.pii_access_logs TO authenticated;
GRANT ALL ON public.pii_access_logs TO service_role;
ALTER TABLE public.pii_access_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pii_access_logs_org_admin_read ON public.pii_access_logs;
CREATE POLICY pii_access_logs_org_admin_read ON public.pii_access_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = pii_access_logs.organization_id
        AND m.user_id = auth.uid()
        AND m.status = 'active'
        AND m.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS pii_access_logs_member_insert ON public.pii_access_logs;
CREATE POLICY pii_access_logs_member_insert ON public.pii_access_logs
  FOR INSERT TO authenticated
  WITH CHECK (private.is_organization_member(pii_access_logs.organization_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.pii_access_logs_enforce_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.created_at := now();
  NEW.user_agent := left(coalesce(NEW.user_agent, ''), 300);
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pii_access_logs_actor ON public.pii_access_logs;
CREATE TRIGGER pii_access_logs_actor
  BEFORE INSERT ON public.pii_access_logs
  FOR EACH ROW EXECUTE FUNCTION public.pii_access_logs_enforce_actor();

CREATE INDEX IF NOT EXISTS pii_access_logs_org_created_idx
  ON public.pii_access_logs (organization_id, created_at DESC);