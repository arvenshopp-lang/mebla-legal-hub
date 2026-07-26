
-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('owner','admin','lawyer','legal_assistant','viewer');
CREATE TYPE public.member_status AS ENUM ('active','suspended','pending');
CREATE TYPE public.client_type AS ENUM ('individual','company','government');
CREATE TYPE public.case_status AS ENUM ('draft','open','in_progress','waiting','judgment_issued','execution','closed','archived');
CREATE TYPE public.case_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.client_role AS ENUM ('plaintiff','defendant','appellant','respondent','execution_applicant','execution_against','other');
CREATE TYPE public.hearing_status AS ENUM ('scheduled','completed','postponed','cancelled','missed');
CREATE TYPE public.deadline_status AS ENUM ('active','completed','cancelled','overdue');
CREATE TYPE public.deadline_type AS ENUM ('objection','appeal','response','submission','execution','expert_report','document_request','custom');
CREATE TYPE public.task_status AS ENUM ('pending','in_progress','completed','cancelled','overdue');
CREATE TYPE public.task_priority AS ENUM ('low','medium','high','urgent');
CREATE TYPE public.update_type AS ENUM ('case_created','hearing','memorandum','document','call','meeting','court_update','task','deadline','judgment','note','status_change');
CREATE TYPE public.invitation_status AS ENUM ('pending','accepted','revoked','expired');

-- ============ UPDATED_AT HELPER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  email text,
  phone text,
  avatar_url text,
  job_title text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.email
  );
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  commercial_registration text,
  tax_number text,
  phone text,
  email text,
  city text,
  address text,
  logo_url text,
  created_by uuid REFERENCES public.profiles(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_orgs_updated BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ ORGANIZATION_MEMBERS ============
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  status public.member_status NOT NULL DEFAULT 'active',
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX idx_org_members_user ON public.organization_members(user_id);

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.is_organization_member(_org uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = _user AND status = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.has_organization_role(_org uuid, _user uuid, _roles public.app_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = _org AND user_id = _user AND status = 'active' AND role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_org uuid, _user uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.organization_members
  WHERE organization_id = _org AND user_id = _user AND status = 'active'
  LIMIT 1;
$$;

-- ============ PROFILES policies (self + same-org) ============
CREATE POLICY "profiles_self_select" ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.organization_members m1
    JOIN public.organization_members m2 ON m1.organization_id = m2.organization_id
    WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id AND m1.status='active' AND m2.status='active'
  ));
CREATE POLICY "profiles_self_insert" ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "profiles_self_update" ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- ============ ORGANIZATIONS policies ============
CREATE POLICY "orgs_select" ON public.organizations FOR SELECT TO authenticated
  USING (public.is_organization_member(id, auth.uid()));
CREATE POLICY "orgs_insert_self" ON public.organizations FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
CREATE POLICY "orgs_update_owner_admin" ON public.organizations FOR UPDATE TO authenticated
  USING (public.has_organization_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_organization_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- ============ ORG MEMBERS policies ============
CREATE POLICY "members_select_same_org" ON public.organization_members FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id, auth.uid()));
-- creator (owner) may insert their own owner row when creating the org
CREATE POLICY "members_insert_owner_self" ON public.organization_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid() AND role = 'owner' AND NOT EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = organization_members.organization_id
    )
    OR public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[])
  );
CREATE POLICY "members_update_admins" ON public.organization_members FOR UPDATE TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "members_delete_admins" ON public.organization_members FOR DELETE TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- ============ ORGANIZATION_INVITATIONS ============
CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL,
  token text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(24),'hex'),
  status public.invitation_status NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  invited_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_invitations TO authenticated;
GRANT ALL ON public.organization_invitations TO service_role;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_invites_org ON public.organization_invitations(organization_id);
CREATE POLICY "invites_admin_all" ON public.organization_invitations FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- ============ CLIENTS ============
CREATE TABLE public.clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_type public.client_type NOT NULL DEFAULT 'individual',
  full_name text NOT NULL,
  company_name text,
  national_id text,
  commercial_registration text,
  email text,
  phone text,
  city text,
  address text,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clients TO authenticated;
GRANT ALL ON public.clients TO service_role;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_clients_org ON public.clients(organization_id);
CREATE INDEX idx_clients_created ON public.clients(created_at);
CREATE TRIGGER trg_clients_updated BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE POLICY "clients_select" ON public.clients FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "clients_insert" ON public.clients FOR INSERT TO authenticated
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]));
CREATE POLICY "clients_update" ON public.clients FOR UPDATE TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]))
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]));
CREATE POLICY "clients_delete" ON public.clients FOR DELETE TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- ============ CASES ============
CREATE TABLE public.cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  case_number text,
  case_title text NOT NULL,
  case_type text,
  client_role public.client_role,
  court_name text,
  court_branch text,
  judicial_circuit text,
  judge_name text,
  opponent_name text,
  status public.case_status NOT NULL DEFAULT 'open',
  priority public.case_priority NOT NULL DEFAULT 'medium',
  assigned_lawyer_id uuid REFERENCES public.profiles(id),
  opened_at date,
  closed_at date,
  next_action text,
  next_action_date timestamptz,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  description text,
  internal_notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cases TO authenticated;
GRANT ALL ON public.cases TO service_role;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_cases_org ON public.cases(organization_id);
CREATE INDEX idx_cases_client ON public.cases(client_id);
CREATE INDEX idx_cases_lawyer ON public.cases(assigned_lawyer_id);
CREATE INDEX idx_cases_status ON public.cases(status);
CREATE INDEX idx_cases_created ON public.cases(created_at);
CREATE INDEX idx_cases_next_action ON public.cases(next_action_date);
CREATE TRIGGER trg_cases_updated BEFORE UPDATE ON public.cases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.can_access_case(_case uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = _case AND public.is_organization_member(c.organization_id, _user)
  );
$$;

CREATE POLICY "cases_select" ON public.cases FOR SELECT TO authenticated
  USING (public.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "cases_insert" ON public.cases FOR INSERT TO authenticated
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]));
CREATE POLICY "cases_update" ON public.cases FOR UPDATE TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]))
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]));
CREATE POLICY "cases_delete" ON public.cases FOR DELETE TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- ============ CASE PARTIES ============
CREATE TABLE public.case_parties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  party_name text NOT NULL,
  party_type text,
  legal_role text,
  national_id text,
  commercial_registration text,
  phone text,
  email text,
  representative_name text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_parties TO authenticated;
GRANT ALL ON public.case_parties TO service_role;
ALTER TABLE public.case_parties ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_parties_case ON public.case_parties(case_id);
CREATE INDEX idx_parties_org ON public.case_parties(organization_id);
CREATE POLICY "parties_select" ON public.case_parties FOR SELECT TO authenticated USING (public.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "parties_write" ON public.case_parties FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]))
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]));

-- ============ HEARINGS ============
CREATE TABLE public.hearings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'جلسة',
  hearing_date timestamptz NOT NULL,
  court_name text,
  judicial_circuit text,
  hearing_type text,
  location text,
  remote_link text,
  status public.hearing_status NOT NULL DEFAULT 'scheduled',
  result text,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hearings TO authenticated;
GRANT ALL ON public.hearings TO service_role;
ALTER TABLE public.hearings ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_hearings_case ON public.hearings(case_id);
CREATE INDEX idx_hearings_org ON public.hearings(organization_id);
CREATE INDEX idx_hearings_date ON public.hearings(hearing_date);
CREATE INDEX idx_hearings_status ON public.hearings(status);
CREATE TRIGGER trg_hearings_updated BEFORE UPDATE ON public.hearings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "hearings_select" ON public.hearings FOR SELECT TO authenticated USING (public.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "hearings_write" ON public.hearings FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]))
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]));

-- ============ DEADLINES ============
CREATE TABLE public.deadlines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  deadline_type public.deadline_type NOT NULL DEFAULT 'custom',
  due_date timestamptz NOT NULL,
  status public.deadline_status NOT NULL DEFAULT 'active',
  priority public.case_priority NOT NULL DEFAULT 'high',
  responsible_user_id uuid REFERENCES public.profiles(id),
  completed_at timestamptz,
  notes text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deadlines TO authenticated;
GRANT ALL ON public.deadlines TO service_role;
ALTER TABLE public.deadlines ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_deadlines_case ON public.deadlines(case_id);
CREATE INDEX idx_deadlines_org ON public.deadlines(organization_id);
CREATE INDEX idx_deadlines_due ON public.deadlines(due_date);
CREATE INDEX idx_deadlines_status ON public.deadlines(status);
CREATE TRIGGER trg_deadlines_updated BEFORE UPDATE ON public.deadlines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "deadlines_select" ON public.deadlines FOR SELECT TO authenticated USING (public.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "deadlines_write" ON public.deadlines FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]))
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]));

-- ============ TASKS ============
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  assigned_to uuid REFERENCES public.profiles(id),
  created_by uuid REFERENCES public.profiles(id),
  due_date timestamptz,
  priority public.task_priority NOT NULL DEFAULT 'medium',
  status public.task_status NOT NULL DEFAULT 'pending',
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tasks_org ON public.tasks(organization_id);
CREATE INDEX idx_tasks_case ON public.tasks(case_id);
CREATE INDEX idx_tasks_assigned ON public.tasks(assigned_to);
CREATE INDEX idx_tasks_due ON public.tasks(due_date);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE TRIGGER trg_tasks_updated BEFORE UPDATE ON public.tasks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "tasks_select" ON public.tasks FOR SELECT TO authenticated USING (public.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "tasks_write" ON public.tasks FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]))
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]));

-- ============ CASE UPDATES ============
CREATE TABLE public.case_updates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  update_type public.update_type NOT NULL,
  title text NOT NULL,
  description text,
  event_date timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.case_updates TO authenticated;
GRANT ALL ON public.case_updates TO service_role;
ALTER TABLE public.case_updates ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_updates_case ON public.case_updates(case_id);
CREATE INDEX idx_updates_org ON public.case_updates(organization_id);
CREATE INDEX idx_updates_created ON public.case_updates(created_at);
CREATE POLICY "updates_select" ON public.case_updates FOR SELECT TO authenticated USING (public.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "updates_insert" ON public.case_updates FOR INSERT TO authenticated
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]));

-- ============ DOCUMENTS ============
CREATE TABLE public.documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_type text,
  file_size bigint,
  document_category text,
  description text,
  is_confidential boolean NOT NULL DEFAULT true,
  uploaded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_docs_org ON public.documents(organization_id);
CREATE INDEX idx_docs_case ON public.documents(case_id);
CREATE INDEX idx_docs_client ON public.documents(client_id);
CREATE POLICY "docs_select" ON public.documents FOR SELECT TO authenticated USING (public.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "docs_write" ON public.documents FOR ALL TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]))
  WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[]));

-- ============ NOTIFICATIONS ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  related_case_id uuid REFERENCES public.cases(id) ON DELETE CASCADE,
  related_task_id uuid REFERENCES public.tasks(id) ON DELETE CASCADE,
  related_deadline_id uuid REFERENCES public.deadlines(id) ON DELETE CASCADE,
  related_hearing_id uuid REFERENCES public.hearings(id) ON DELETE CASCADE,
  is_read boolean NOT NULL DEFAULT false,
  scheduled_for timestamptz,
  sent_at timestamptz,
  dedup_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, dedup_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_notif_user ON public.notifications(user_id);
CREATE INDEX idx_notif_read ON public.notifications(is_read);
CREATE POLICY "notif_select_self" ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "notif_update_self" ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "notif_delete_self" ON public.notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ============ ACTIVITY LOGS ============
CREATE TABLE public.activity_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_logs_org ON public.activity_logs(organization_id);
CREATE INDEX idx_logs_created ON public.activity_logs(created_at);
CREATE POLICY "logs_select_admins" ON public.activity_logs FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));
CREATE POLICY "logs_insert_members" ON public.activity_logs FOR INSERT TO authenticated
  WITH CHECK (public.is_organization_member(organization_id, auth.uid()));

-- ============ USER NOTIFICATION PREFERENCES ============
CREATE TABLE public.user_notification_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  hearing_7_days boolean NOT NULL DEFAULT true,
  hearing_3_days boolean NOT NULL DEFAULT true,
  hearing_1_day boolean NOT NULL DEFAULT true,
  hearing_same_day boolean NOT NULL DEFAULT true,
  deadline_7_days boolean NOT NULL DEFAULT true,
  deadline_3_days boolean NOT NULL DEFAULT true,
  deadline_1_day boolean NOT NULL DEFAULT true,
  deadline_same_day boolean NOT NULL DEFAULT true,
  task_overdue boolean NOT NULL DEFAULT true,
  inactive_cases boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT true,
  in_app_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_notification_preferences TO authenticated;
GRANT ALL ON public.user_notification_preferences TO service_role;
ALTER TABLE public.user_notification_preferences ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_prefs_updated BEFORE UPDATE ON public.user_notification_preferences FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE POLICY "prefs_self" ON public.user_notification_preferences FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
