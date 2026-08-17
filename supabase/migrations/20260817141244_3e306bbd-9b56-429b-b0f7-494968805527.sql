CREATE TABLE public.office_invoice_branding (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  logo_path text,
  logo_mime text,
  footer_note text,
  signatory_name text,
  signatory_title text,
  bank_details text,
  show_signature boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.office_invoice_branding TO authenticated;
GRANT ALL ON public.office_invoice_branding TO service_role;

ALTER TABLE public.office_invoice_branding ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read office invoice branding"
ON public.office_invoice_branding
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = office_invoice_branding.organization_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
  )
);

CREATE POLICY "managers insert office invoice branding"
ON public.office_invoice_branding
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = office_invoice_branding.organization_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "managers update office invoice branding"
ON public.office_invoice_branding
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = office_invoice_branding.organization_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('owner', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = office_invoice_branding.organization_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('owner', 'admin')
  )
);

CREATE POLICY "managers delete office invoice branding"
ON public.office_invoice_branding
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = office_invoice_branding.organization_id
      AND m.user_id = auth.uid()
      AND m.status = 'active'
      AND m.role IN ('owner', 'admin')
  )
);

CREATE TRIGGER office_invoice_branding_set_updated_at
BEFORE UPDATE ON public.office_invoice_branding
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();