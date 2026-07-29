-- case_parties
DROP POLICY IF EXISTS parties_write ON public.case_parties;
CREATE POLICY parties_insert ON public.case_parties FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]));
CREATE POLICY parties_update ON public.case_parties FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]));
CREATE POLICY parties_delete ON public.case_parties FOR DELETE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

-- documents
DROP POLICY IF EXISTS docs_write ON public.documents;
CREATE POLICY docs_insert ON public.documents FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]));
CREATE POLICY docs_update ON public.documents FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]));
CREATE POLICY docs_delete ON public.documents FOR DELETE TO authenticated
  USING (
    private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
    OR (uploaded_by = auth.uid() AND private.has_organization_role(organization_id, auth.uid(), ARRAY['lawyer'::app_role,'legal_assistant'::app_role]))
  );

-- hearings
DROP POLICY IF EXISTS hearings_write ON public.hearings;
CREATE POLICY hearings_insert ON public.hearings FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]));
CREATE POLICY hearings_update ON public.hearings FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]));
CREATE POLICY hearings_delete ON public.hearings FOR DELETE TO authenticated
  USING (
    private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
    OR (created_by = auth.uid() AND private.has_organization_role(organization_id, auth.uid(), ARRAY['lawyer'::app_role,'legal_assistant'::app_role]))
  );

-- deadlines
DROP POLICY IF EXISTS deadlines_write ON public.deadlines;
CREATE POLICY deadlines_insert ON public.deadlines FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]));
CREATE POLICY deadlines_update ON public.deadlines FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]));
CREATE POLICY deadlines_delete ON public.deadlines FOR DELETE TO authenticated
  USING (
    private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
    OR (created_by = auth.uid() AND private.has_organization_role(organization_id, auth.uid(), ARRAY['lawyer'::app_role,'legal_assistant'::app_role]))
  );

-- tasks
DROP POLICY IF EXISTS tasks_write ON public.tasks;
CREATE POLICY tasks_insert ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]));
CREATE POLICY tasks_update ON public.tasks FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role,'legal_assistant'::app_role]));
CREATE POLICY tasks_delete ON public.tasks FOR DELETE TO authenticated
  USING (
    private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
    OR (created_by = auth.uid() AND private.has_organization_role(organization_id, auth.uid(), ARRAY['lawyer'::app_role,'legal_assistant'::app_role]))
  );