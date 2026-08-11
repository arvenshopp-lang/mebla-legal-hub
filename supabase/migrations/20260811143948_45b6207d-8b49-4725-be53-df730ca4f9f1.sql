-- 1) ملاحظات القضية الداخلية: جدول مستقل مقيّد بالدور
CREATE TABLE public.case_internal_notes (
  case_id uuid PRIMARY KEY REFERENCES public.cases(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notes text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX case_internal_notes_org_idx ON public.case_internal_notes (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_internal_notes TO authenticated;
GRANT ALL ON public.case_internal_notes TO service_role;

ALTER TABLE public.case_internal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_internal_notes_select ON public.case_internal_notes
  FOR SELECT TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'lawyer'::app_role]));

CREATE POLICY case_internal_notes_insert ON public.case_internal_notes
  FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'lawyer'::app_role]));

CREATE POLICY case_internal_notes_update ON public.case_internal_notes
  FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'lawyer'::app_role]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role, 'lawyer'::app_role]));

CREATE POLICY case_internal_notes_delete ON public.case_internal_notes
  FOR DELETE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE TRIGGER case_internal_notes_set_updated_at
  BEFORE UPDATE ON public.case_internal_notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.case_internal_notes (case_id, organization_id, notes, created_at, updated_at)
SELECT c.id, c.organization_id, c.internal_notes, now(), now()
FROM public.cases c
WHERE c.internal_notes IS NOT NULL AND btrim(c.internal_notes) <> '';

ALTER TABLE public.cases DROP COLUMN internal_notes;

-- 2) ملاحظات العملاء المحتملين: مطابقة قراءة القائمة لصلاحية التعديل
DROP POLICY "office members read their leads" ON public.office_leads;

CREATE POLICY "office staff read their leads" ON public.office_leads
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = office_leads.organization_id
      AND om.user_id = auth.uid()
      AND om.status = 'active'::member_status
      AND om.role = ANY (ARRAY['owner'::app_role, 'admin'::app_role, 'lawyer'::app_role, 'legal_assistant'::app_role])
  ));

-- 3) سجل كشف البيانات الحساسة: لا انتحال هوية في السجل
DROP POLICY pii_access_logs_member_insert ON public.pii_access_logs;

CREATE POLICY pii_access_logs_member_insert ON public.pii_access_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_organization_member(organization_id, auth.uid())
    AND user_id = auth.uid()
  );

-- 4) بيانات الاشتراك والفوترة: للمالك والمدير فقط
DROP POLICY "org members read org subscriptions" ON public.subscriptions;

CREATE POLICY "org managers read org subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));