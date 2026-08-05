-- مِهلة | MEHLA — حزمة المخطط الكاملة (Schema Bundle)
-- مُجمَّعة من supabase/migrations بالترتيب الزمني — مصدر الحقيقة هو ملفات المشروع.
-- آمنة: DDL فقط، لا حذف بيانات، لا DROP DATABASE. تُطبَّق على مشروع فارغ.
-- عدد ملفات الهجرة: 55

-- ============================================================
-- 20260726110148_cb98bb94-720e-4f99-99f4-7a22196fc340.sql
-- ============================================================

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

-- ============================================================
-- 20260726110219_32fcf8c9-f963-4510-870d-57c1d7716799.sql
-- ============================================================

-- Restrict SECURITY DEFINER helpers to authenticated only
REVOKE EXECUTE ON FUNCTION public.is_organization_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_organization_role(uuid, uuid, public.app_role[]) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_case(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_organization_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, uuid, public.app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_case(uuid, uuid) TO authenticated;

-- Storage policies: documents bucket, path = <organization_id>/...
CREATE POLICY "docs_storage_select" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'documents'
  AND public.is_organization_member((storage.foldername(name))[1]::uuid, auth.uid())
);
CREATE POLICY "docs_storage_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND public.has_organization_role((storage.foldername(name))[1]::uuid, auth.uid(),
      ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[])
);
CREATE POLICY "docs_storage_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_organization_role((storage.foldername(name))[1]::uuid, auth.uid(),
      ARRAY['owner','admin','lawyer','legal_assistant']::public.app_role[])
);
CREATE POLICY "docs_storage_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'documents'
  AND public.has_organization_role((storage.foldername(name))[1]::uuid, auth.uid(),
      ARRAY['owner','admin']::public.app_role[])
);

-- ============================================================
-- 20260729072825_51ca154d-82b6-445f-a541-12d573d3a3ff.sql
-- ============================================================
-- Secure, atomic organization onboarding RPC
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  _name text,
  _city text DEFAULT NULL,
  _legal_name text DEFAULT NULL,
  _commercial_registration text DEFAULT NULL,
  _tax_number text DEFAULT NULL,
  _phone text DEFAULT NULL,
  _email text DEFAULT NULL,
  _address text DEFAULT NULL
)
RETURNS TABLE(organization_id uuid, already_exists boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_name text := NULLIF(btrim(_name), '');
  v_existing_org uuid;
  v_new_org uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION 'ORG_NAME_REQUIRED' USING ERRCODE = 'P0001';
  END IF;

  -- Serialize onboarding per user so rapid double-submit cannot create two offices.
  PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  SELECT om.organization_id
    INTO v_existing_org
  FROM public.organization_members om
  JOIN public.organizations o ON o.id = om.organization_id
  WHERE om.user_id = v_user_id
    AND om.status = 'active'
    AND o.is_active = true
  ORDER BY om.created_at ASC
  LIMIT 1;

  IF v_existing_org IS NOT NULL THEN
    organization_id := v_existing_org;
    already_exists := true;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.organizations (
    name,
    city,
    legal_name,
    commercial_registration,
    tax_number,
    phone,
    email,
    address,
    created_by
  ) VALUES (
    v_name,
    NULLIF(btrim(_city), ''),
    NULLIF(btrim(_legal_name), ''),
    NULLIF(btrim(_commercial_registration), ''),
    NULLIF(btrim(_tax_number), ''),
    NULLIF(btrim(_phone), ''),
    NULLIF(btrim(_email), ''),
    NULLIF(btrim(_address), ''),
    v_user_id
  )
  RETURNING id INTO v_new_org;

  INSERT INTO public.organization_members (
    organization_id,
    user_id,
    role,
    status
  ) VALUES (
    v_new_org,
    v_user_id,
    'owner',
    'active'
  );

  organization_id := v_new_org;
  already_exists := false;
  RETURN NEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text) TO authenticated;

-- Direct organization creation is no longer part of the app flow.
DROP POLICY IF EXISTS "orgs_insert_self" ON public.organizations;
REVOKE INSERT ON public.organizations FROM authenticated;

-- Keep office visibility scoped to active memberships.
DROP POLICY IF EXISTS "orgs_select" ON public.organizations;
CREATE POLICY "orgs_select_member" ON public.organizations
FOR SELECT TO authenticated
USING (public.is_organization_member(id, auth.uid()));

DROP POLICY IF EXISTS "orgs_update_owner_admin" ON public.organizations;
CREATE POLICY "orgs_update_owner_admin" ON public.organizations
FOR UPDATE TO authenticated
USING (public.has_organization_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
WITH CHECK (public.has_organization_role(id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

-- Members can read their own membership row immediately; organization-wide reads remain limited to members.
DROP POLICY IF EXISTS "members_select_same_org" ON public.organization_members;
CREATE POLICY "members_select_self_or_same_org" ON public.organization_members
FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_organization_member(organization_id, auth.uid())
);

-- Direct first-owner membership creation is handled by the RPC. Admins can still invite/manage members.
DROP POLICY IF EXISTS "members_insert_owner_self" ON public.organization_members;
CREATE POLICY "members_insert_admins" ON public.organization_members
FOR INSERT TO authenticated
WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "members_update_admins" ON public.organization_members;
CREATE POLICY "members_update_admins" ON public.organization_members
FOR UPDATE TO authenticated
USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]))
WITH CHECK (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));

DROP POLICY IF EXISTS "members_delete_admins" ON public.organization_members;
CREATE POLICY "members_delete_admins" ON public.organization_members
FOR DELETE TO authenticated
USING (public.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::public.app_role[]));
-- ============================================================
-- 20260729073759_10c53c3c-32ae-4790-923c-0c538cb52736.sql
-- ============================================================
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
-- ============================================================
-- 20260729220121_feed0650-6414-43dd-8627-92607d7d8db4.sql
-- ============================================================
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM public, anon, authenticated;
GRANT USAGE ON SCHEMA private TO postgres, service_role;

ALTER FUNCTION public.is_organization_member(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.has_organization_role(uuid, uuid, app_role[]) SET SCHEMA private;
ALTER FUNCTION public.get_user_role(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_access_case(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.handle_new_user() SET SCHEMA private;

ALTER FUNCTION private.is_organization_member(uuid, uuid) SET search_path TO public, private;
ALTER FUNCTION private.has_organization_role(uuid, uuid, app_role[]) SET search_path TO public, private;
ALTER FUNCTION private.get_user_role(uuid, uuid) SET search_path TO public, private;
ALTER FUNCTION private.can_access_case(uuid, uuid) SET search_path TO public, private;
ALTER FUNCTION private.handle_new_user() SET search_path TO public, private;

REVOKE ALL ON FUNCTION private.is_organization_member(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.has_organization_role(uuid, uuid, app_role[]) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.get_user_role(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.can_access_case(uuid, uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION private.handle_new_user() FROM public, anon, authenticated;

ALTER FUNCTION public.create_organization_with_owner(text, text, text, text, text, text, text, text) SET search_path TO public, private;

-- Allow authorized staff to correct or remove case timeline entries
CREATE POLICY "updates_update" ON public.case_updates
FOR UPDATE TO authenticated
USING (
  private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  OR created_by = auth.uid()
)
WITH CHECK (
  private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  OR created_by = auth.uid()
);

CREATE POLICY "updates_delete" ON public.case_updates
FOR DELETE TO authenticated
USING (
  private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role])
  OR created_by = auth.uid()
);

-- Tighten invitation access to explicit owner/admin-only commands
DROP POLICY IF EXISTS "invites_admin_all" ON public.organization_invitations;

CREATE POLICY "invites_admin_select" ON public.organization_invitations
FOR SELECT TO authenticated
USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "invites_admin_insert" ON public.organization_invitations
FOR INSERT TO authenticated
WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "invites_admin_update" ON public.organization_invitations
FOR UPDATE TO authenticated
USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]))
WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));

CREATE POLICY "invites_admin_delete" ON public.organization_invitations
FOR DELETE TO authenticated
USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role, 'admin'::app_role]));
-- ============================================================
-- 20260729221422_e1b5aa1c-8103-4a14-b863-27d06e4c5519.sql
-- ============================================================
-- RLS policies are evaluated as the invoking role, so `authenticated` needs
-- USAGE on the private schema and EXECUTE on the helper functions the policies
-- call. The private schema is NOT exposed through the Data API, so these
-- functions remain uncallable from the client.
GRANT USAGE ON SCHEMA private TO authenticated;

GRANT EXECUTE ON FUNCTION private.is_organization_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.has_organization_role(uuid, uuid, app_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION private.get_user_role(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.can_access_case(uuid, uuid) TO authenticated;

-- handle_new_user stays trigger-only: no execute grant.
REVOKE ALL ON FUNCTION private.handle_new_user() FROM PUBLIC, anon, authenticated;
-- ============================================================
-- 20260729222857_0eeecfa0-abf1-4560-b5a5-2fc228d0b6a5.sql
-- ============================================================
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
-- ============================================================
-- 20260729223136_5c44bd9a-6eb8-4423-b4dd-8de3d083ae2f.sql
-- ============================================================
-- ============ 1) Global unique 10-digit case codes ============
CREATE TABLE IF NOT EXISTS public.case_code_registry (
  code text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.case_code_registry TO service_role;
ALTER TABLE public.case_code_registry ENABLE ROW LEVEL SECURITY;
-- no policies: registry is internal only (accessed by SECURITY DEFINER functions)

CREATE OR REPLACE FUNCTION private.generate_case_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  v_code text;
  i int := 0;
BEGIN
  PERFORM 1;
  LOOP
    i := i + 1;
    -- cryptographically random 10 digits, never starting with 0
    v_code := (1 + (get_byte(extensions.gen_random_bytes(1), 0) % 9))::text
      || lpad((((get_byte(extensions.gen_random_bytes(4), 0)::bigint << 24)
              + (get_byte(extensions.gen_random_bytes(4), 0)::bigint << 16)
              + (get_byte(extensions.gen_random_bytes(4), 0)::bigint << 8)
              + get_byte(extensions.gen_random_bytes(4), 0)::bigint) % 1000000000)::text, 9, '0');
    BEGIN
      INSERT INTO public.case_code_registry (code) VALUES (v_code);
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      IF i > 50 THEN RAISE EXCEPTION 'CASE_CODE_GENERATION_FAILED'; END IF;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION private.generate_case_code() FROM PUBLIC;

ALTER TABLE public.cases ADD COLUMN IF NOT EXISTS public_code text;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.cases WHERE public_code IS NULL LOOP
    UPDATE public.cases SET public_code = private.generate_case_code() WHERE id = r.id;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cases_public_code_key ON public.cases (public_code);

CREATE OR REPLACE FUNCTION private.cases_set_public_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.public_code := private.generate_case_code();
  ELSE
    NEW.public_code := OLD.public_code;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cases_public_code ON public.cases;
CREATE TRIGGER trg_cases_public_code
BEFORE INSERT OR UPDATE ON public.cases
FOR EACH ROW EXECUTE FUNCTION private.cases_set_public_code();

-- ============ 2) client-visible flag on case updates ============
ALTER TABLE public.case_updates
  ADD COLUMN IF NOT EXISTS is_client_visible boolean NOT NULL DEFAULT false;

-- ============ 3) document requests ============
CREATE TABLE IF NOT EXISTS public.document_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  case_id uuid NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
  title text NOT NULL,
  message text,
  requested_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  expires_at timestamptz,
  completed_at timestamptz,
  file_count integer NOT NULL DEFAULT 0,
  submitted_ip text,
  submitted_user_agent text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_requests TO authenticated;
GRANT ALL ON public.document_requests TO service_role;
ALTER TABLE public.document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_requests_select" ON public.document_requests FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY "doc_requests_insert" ON public.document_requests FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));
CREATE POLICY "doc_requests_update" ON public.document_requests FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));
CREATE POLICY "doc_requests_delete" ON public.document_requests FOR DELETE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner','admin']::app_role[]));

CREATE TRIGGER trg_doc_requests_updated_at BEFORE UPDATE ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS idx_doc_requests_case ON public.document_requests (case_id, created_at DESC);

-- ============ 4) request activity log ============
CREATE TABLE IF NOT EXISTS public.document_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_id uuid NOT NULL REFERENCES public.document_requests(id) ON DELETE CASCADE,
  event text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  actor_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_request_events TO authenticated;
GRANT ALL ON public.document_request_events TO service_role;
ALTER TABLE public.document_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_request_events_select" ON public.document_request_events FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));

CREATE INDEX IF NOT EXISTS idx_doc_request_events_request ON public.document_request_events (request_id, created_at DESC);

-- ============ 5) documents provenance ============
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS document_request_id uuid REFERENCES public.document_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS client_ip text;

-- ============ 6) case lookup rate limiting ============
CREATE TABLE IF NOT EXISTS public.case_lookup_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_hash text NOT NULL,
  code_attempt text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.case_lookup_attempts TO service_role;
ALTER TABLE public.case_lookup_attempts ENABLE ROW LEVEL SECURITY;
-- no policies: server-only table

CREATE INDEX IF NOT EXISTS idx_case_lookup_ip ON public.case_lookup_attempts (ip_hash, created_at DESC);

-- ============================================================
-- 20260729223530_29cb13ac-6a48-42b1-8512-12db64a914f5.sql
-- ============================================================
ALTER TABLE public.document_requests
  ADD CONSTRAINT document_requests_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL;
-- ============================================================
-- 20260731075218_a49a08d4-40eb-4478-84a3-2927caddc5be.sql
-- ============================================================

-- 1) Internal-only tables: no Data API access at all
REVOKE ALL ON public.case_code_registry FROM anon, authenticated;
REVOKE ALL ON public.case_lookup_attempts FROM anon, authenticated;
GRANT ALL ON public.case_code_registry TO service_role;
GRANT ALL ON public.case_lookup_attempts TO service_role;
COMMENT ON TABLE public.case_code_registry IS 'Internal only: service_role access, RLS on with no policies by design.';
COMMENT ON TABLE public.case_lookup_attempts IS 'Internal only: rate-limit ledger, service_role access, RLS on with no policies by design.';

-- 2) Audit log enrichment (immutable: no UPDATE/DELETE policies exist)
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS ip text;
ALTER TABLE public.activity_logs ADD COLUMN IF NOT EXISTS user_agent text;

CREATE OR REPLACE FUNCTION public.activity_logs_enforce_actor()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
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

DROP TRIGGER IF EXISTS activity_logs_enforce_actor_trg ON public.activity_logs;
CREATE TRIGGER activity_logs_enforce_actor_trg
BEFORE INSERT ON public.activity_logs
FOR EACH ROW EXECUTE FUNCTION public.activity_logs_enforce_actor();

-- 3) Upload links: bounded lifetime + no resurrection
CREATE OR REPLACE FUNCTION public.document_requests_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.expires_at IS NULL THEN
      NEW.expires_at := now() + interval '7 days';
    ELSIF NEW.expires_at > now() + interval '30 days' THEN
      NEW.expires_at := now() + interval '30 days';
    ELSIF NEW.expires_at <= now() THEN
      RAISE EXCEPTION 'EXPIRY_MUST_BE_FUTURE' USING ERRCODE = 'P0001';
    END IF;
    NEW.status := 'active';
    RETURN NEW;
  END IF;

  IF OLD.status <> 'active' AND NEW.status = 'active' THEN
    RAISE EXCEPTION 'LINK_CANNOT_BE_REACTIVATED' USING ERRCODE = 'P0001';
  END IF;
  NEW.token_hash := OLD.token_hash;
  NEW.organization_id := OLD.organization_id;
  NEW.case_id := OLD.case_id;
  IF OLD.status <> 'active' THEN
    NEW.expires_at := OLD.expires_at;
  ELSIF NEW.expires_at IS NOT NULL AND NEW.expires_at > now() + interval '30 days' THEN
    NEW.expires_at := now() + interval '30 days';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_requests_guard_trg ON public.document_requests;
CREATE TRIGGER document_requests_guard_trg
BEFORE INSERT OR UPDATE ON public.document_requests
FOR EACH ROW EXECUTE FUNCTION public.document_requests_guard();

-- ============================================================
-- 20260731112230_772db564-bceb-4ebd-bc93-5aba2d0e735a.sql
-- ============================================================
-- ============ ENUMS ============
CREATE TYPE public.platform_role AS ENUM ('super_admin', 'staff');
CREATE TYPE public.platform_staff_status AS ENUM ('active', 'suspended');
CREATE TYPE public.subscription_status AS ENUM ('active', 'expired', 'cancelled', 'trial');
CREATE TYPE public.ticket_status AS ENUM ('new', 'awaiting_reply', 'in_progress', 'closed');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');

-- ============ PLATFORM STAFF ============
CREATE TABLE public.platform_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  full_name text NOT NULL,
  email text NOT NULL,
  job_title text,
  role public.platform_role NOT NULL DEFAULT 'staff',
  status public.platform_staff_status NOT NULL DEFAULT 'active',
  permissions text[] NOT NULL DEFAULT '{}',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_staff TO authenticated;
GRANT ALL ON public.platform_staff TO service_role;
ALTER TABLE public.platform_staff ENABLE ROW LEVEL SECURITY;

-- ============ PRIVATE HELPERS ============
CREATE OR REPLACE FUNCTION private.is_platform_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = _user_id AND status = 'active'
  )
$$;

CREATE OR REPLACE FUNCTION private.is_platform_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = _user_id AND status = 'active' AND role = 'super_admin'
  )
$$;

CREATE OR REPLACE FUNCTION private.has_platform_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_staff
    WHERE user_id = _user_id
      AND status = 'active'
      AND (role = 'super_admin' OR _permission = ANY(permissions))
  )
$$;

REVOKE ALL ON FUNCTION private.is_platform_staff(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.is_platform_super_admin(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.has_platform_permission(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_platform_staff(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_platform_super_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_platform_permission(uuid, text) TO authenticated, service_role;

CREATE POLICY "staff read own row" ON public.platform_staff
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "staff with permission read team" ON public.platform_staff
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'staff.view'));

CREATE TRIGGER platform_staff_updated_at BEFORE UPDATE ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ PLANS ============
CREATE TABLE public.platform_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  name_en text,
  description text,
  price_monthly numeric(12,2) NOT NULL DEFAULT 0,
  price_yearly numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  max_users integer,
  max_cases integer,
  max_documents integer,
  max_branches integer,
  storage_gb integer,
  ai_enabled boolean NOT NULL DEFAULT false,
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  is_public boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_plans TO anon, authenticated;
GRANT ALL ON public.platform_plans TO service_role;
ALTER TABLE public.platform_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public can read active public plans" ON public.platform_plans
  FOR SELECT TO anon, authenticated USING (is_active AND is_public);
CREATE POLICY "plan managers read all" ON public.platform_plans
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'plans.manage'));
CREATE POLICY "plan managers insert" ON public.platform_plans
  FOR INSERT TO authenticated WITH CHECK (private.has_platform_permission(auth.uid(), 'plans.manage'));
CREATE POLICY "plan managers update" ON public.platform_plans
  FOR UPDATE TO authenticated USING (private.has_platform_permission(auth.uid(), 'plans.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'plans.manage'));
CREATE POLICY "plan managers delete" ON public.platform_plans
  FOR DELETE TO authenticated USING (private.has_platform_permission(auth.uid(), 'plans.manage'));

CREATE TRIGGER platform_plans_updated_at BEFORE UPDATE ON public.platform_plans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SUBSCRIPTIONS ============
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  plan_id uuid REFERENCES public.platform_plans(id) ON DELETE SET NULL,
  plan_code text NOT NULL,
  plan_label text NOT NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  billing_note text,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  status public.subscription_status NOT NULL DEFAULT 'active',
  cancelled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX subscriptions_user_idx ON public.subscriptions(user_id);
CREATE INDEX subscriptions_status_idx ON public.subscriptions(status, ends_at);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "subscription managers read" ON public.subscriptions
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'subscriptions.manage'));
CREATE POLICY "subscription managers insert" ON public.subscriptions
  FOR INSERT TO authenticated WITH CHECK (private.has_platform_permission(auth.uid(), 'subscriptions.manage'));
CREATE POLICY "subscription managers update" ON public.subscriptions
  FOR UPDATE TO authenticated USING (private.has_platform_permission(auth.uid(), 'subscriptions.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'subscriptions.manage'));

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ SUPPORT TICKETS ============
CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reference text NOT NULL UNIQUE DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  user_id uuid NOT NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  subject text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  status public.ticket_status NOT NULL DEFAULT 'new',
  description text NOT NULL,
  assigned_to uuid,
  last_reply_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_tickets_user_idx ON public.support_tickets(user_id);
CREATE INDEX support_tickets_status_idx ON public.support_tickets(status, last_reply_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users read own tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "users create own tickets" ON public.support_tickets
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "support staff read tickets" ON public.support_tickets
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'tickets.view'));
CREATE POLICY "support staff update tickets" ON public.support_tickets
  FOR UPDATE TO authenticated USING (private.has_platform_permission(auth.uid(), 'tickets.reply'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'tickets.reply'));

CREATE TRIGGER support_tickets_updated_at BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.support_ticket_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  author_id uuid,
  author_name text NOT NULL,
  is_staff boolean NOT NULL DEFAULT false,
  body text NOT NULL,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX support_ticket_messages_ticket_idx ON public.support_ticket_messages(ticket_id, created_at);

GRANT SELECT, INSERT ON public.support_ticket_messages TO authenticated;
GRANT ALL ON public.support_ticket_messages TO service_role;
ALTER TABLE public.support_ticket_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ticket owner reads messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );
CREATE POLICY "ticket owner adds messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid() AND is_staff = false
    AND EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_id AND t.user_id = auth.uid())
  );
CREATE POLICY "support staff read messages" ON public.support_ticket_messages
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'tickets.view'));
CREATE POLICY "support staff add messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated WITH CHECK (
    author_id = auth.uid() AND private.has_platform_permission(auth.uid(), 'tickets.reply')
  );

-- ============ ADMIN AUDIT LOG (immutable) ============
CREATE TABLE public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX admin_audit_logs_created_idx ON public.admin_audit_logs(created_at DESC);

GRANT SELECT, INSERT ON public.admin_audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.admin_audit_logs TO service_role;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read audit log" ON public.admin_audit_logs
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'logs.view'));
CREATE POLICY "staff write audit log" ON public.admin_audit_logs
  FOR INSERT TO authenticated WITH CHECK (private.is_platform_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.admin_audit_enforce_actor()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.actor_id := auth.uid();
  NEW.created_at := now();
  NEW.user_agent := left(coalesce(NEW.user_agent, ''), 300);
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_audit_logs_enforce BEFORE INSERT ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_enforce_actor();

-- ============ PLATFORM SETTINGS ============
CREATE TABLE public.platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_public boolean NOT NULL DEFAULT false,
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_settings TO anon, authenticated;
GRANT ALL ON public.platform_settings TO service_role;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone reads public settings" ON public.platform_settings
  FOR SELECT TO anon, authenticated USING (is_public);
CREATE POLICY "settings managers read" ON public.platform_settings
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'settings.manage'));
CREATE POLICY "settings managers insert" ON public.platform_settings
  FOR INSERT TO authenticated WITH CHECK (private.has_platform_permission(auth.uid(), 'settings.manage'));
CREATE POLICY "settings managers update" ON public.platform_settings
  FOR UPDATE TO authenticated USING (private.has_platform_permission(auth.uid(), 'settings.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'settings.manage'));

-- ============ SEED ============
INSERT INTO public.platform_plans (code, name_ar, name_en, description, price_monthly, price_yearly, max_users, max_cases, max_documents, max_branches, storage_gb, ai_enabled, features, sort_order)
VALUES
  ('basic', 'الباقة الأساسية', 'Basic', 'للمحامي المستقل الذي يدير قضاياه بنفسه.', 199, 1990, 2, 100, 500, 1, 5, false, '["إدارة القضايا والجلسات","تنبيهات المهل","بوابة متابعة العميل"]'::jsonb, 1),
  ('professional', 'الباقة الاحترافية', 'Professional', 'لمكاتب المحاماة الصغيرة والمتوسطة.', 499, 4990, 10, 1000, 5000, 3, 50, true, '["كل مزايا الأساسية","إدارة الفريق والصلاحيات","روابط طلب المستندات","تقارير متقدمة"]'::jsonb, 2),
  ('enterprise', 'باقة المؤسسات', 'Enterprise', 'للمكاتب الكبيرة والإدارات القانونية.', 1499, 14990, 100, NULL, NULL, 20, 500, true, '["كل مزايا الاحترافية","فروع متعددة","تكامل مخصص","دعم أولوية"]'::jsonb, 3);

DO $$
DECLARE v_uid uuid; v_email text := 'ziad.emb@gmail.com';
BEGIN
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.platform_staff (user_id, full_name, email, job_title, role, status, permissions)
    VALUES (v_uid, 'مالك المنصة', v_email, 'Super Admin', 'super_admin', 'active', '{}')
    ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin', status = 'active';
  END IF;
END $$;

-- ============================================================
-- 20260731151803_66e6823a-02bb-40f5-b9c1-4f98db2308ee.sql
-- ============================================================

-- ============ 1) أدوار الإدارة المخصصة ============
CREATE TABLE public.platform_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description text,
  permissions text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_roles TO authenticated;
GRANT ALL ON public.platform_roles TO service_role;
ALTER TABLE public.platform_roles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.platform_staff ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.platform_roles(id) ON DELETE SET NULL;

-- ============ 2) دالة الصلاحيات على الخادم ============
CREATE OR REPLACE FUNCTION public.platform_staff_permissions(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.id IS NULL OR s.status <> 'active' THEN '{}'::text[]
    WHEN s.role = 'super_admin' THEN ARRAY['*']::text[]
    ELSE (SELECT ARRAY(SELECT DISTINCT x FROM unnest(coalesce(s.permissions,'{}'::text[]) || coalesce(r.permissions,'{}'::text[])) AS x))
  END
  FROM public.platform_staff s
  LEFT JOIN public.platform_roles r ON r.id = s.role_id
  WHERE s.user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.platform_has_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM unnest(public.platform_staff_permissions(_user_id)) AS p
    WHERE p = '*' OR p = _permission
  )
$$;

CREATE OR REPLACE FUNCTION public.is_active_platform_staff(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_staff WHERE user_id = _user_id AND status = 'active')
$$;

REVOKE EXECUTE ON FUNCTION public.platform_staff_permissions(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.platform_has_permission(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_active_platform_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_staff_permissions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.platform_has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_active_platform_staff(uuid) TO authenticated, service_role;

CREATE POLICY "platform roles readable by active staff" ON public.platform_roles
  FOR SELECT TO authenticated USING (public.is_active_platform_staff(auth.uid()));
CREATE POLICY "platform roles managed with permission" ON public.platform_roles
  FOR ALL TO authenticated
  USING (public.platform_has_permission(auth.uid(), 'roles.manage'))
  WITH CHECK (public.platform_has_permission(auth.uid(), 'roles.manage') AND is_system = false);

CREATE TRIGGER platform_roles_updated_at BEFORE UPDATE ON public.platform_roles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_roles (code, name_ar, description, permissions, is_system) VALUES
  ('support_agent','موظف دعم','الرد على التذاكر ومتابعة الحسابات دون تعديل الإيرادات.',
   ARRAY['tickets.view','tickets.reply','tickets.assign','users.read','organizations.read','monitoring.read'], true),
  ('billing_manager','مسؤول الإيرادات','إدارة الاشتراكات والباقات والتقارير المالية.',
   ARRAY['subscriptions.manage','plans.manage','revenue.read','users.read','users.update','organizations.read','audit.read'], true),
  ('operations','مسؤول تشغيل','إعدادات المنصة والبريد والـ SEO والإشعارات والمراقبة.',
   ARRAY['settings.manage','seo.manage','email.manage','notifications.send','monitoring.read','audit.read','users.read','organizations.read'], true);

-- ============ 3) وصول الدعم المؤقت ============
CREATE TABLE public.support_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_user_id uuid NOT NULL,
  staff_email text NOT NULL,
  reason text NOT NULL,
  scope text[] NOT NULL DEFAULT ARRAY['cases'],
  status text NOT NULL DEFAULT 'pending',
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  approved_by uuid,
  approved_at timestamptz,
  revoked_by uuid,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_access_status_check CHECK (status IN ('pending','approved','revoked','expired','denied'))
);
CREATE INDEX support_access_org_idx ON public.support_access_grants (organization_id, status);
CREATE INDEX support_access_staff_idx ON public.support_access_grants (staff_user_id, status);
GRANT SELECT, INSERT, UPDATE ON public.support_access_grants TO authenticated;
GRANT ALL ON public.support_access_grants TO service_role;
ALTER TABLE public.support_access_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members see their support grants" ON public.support_access_grants
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = support_access_grants.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
    )
  );
CREATE POLICY "org owners decide on support grants" ON public.support_access_grants
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = support_access_grants.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active' AND om.role IN ('owner','admin')
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = support_access_grants.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active' AND om.role IN ('owner','admin')
    )
  );
CREATE POLICY "staff read support grants" ON public.support_access_grants
  FOR SELECT TO authenticated USING (public.is_active_platform_staff(auth.uid()));

CREATE TRIGGER support_access_updated_at BEFORE UPDATE ON public.support_access_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.has_active_support_access(_organization_id uuid, _staff_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_access_grants g
    WHERE g.organization_id = _organization_id
      AND g.staff_user_id = _staff_user_id
      AND g.status = 'approved'
      AND g.expires_at > now()
  )
$$;
REVOKE EXECUTE ON FUNCTION public.has_active_support_access(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_support_access(uuid, uuid) TO authenticated, service_role;

-- ============ 4) سجل تدقيق أعمق ============
ALTER TABLE public.admin_audit_logs
  ADD COLUMN IF NOT EXISTS before_data jsonb,
  ADD COLUMN IF NOT EXISTS after_data jsonb,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS browser text;

CREATE OR REPLACE FUNCTION public.admin_audit_enforce_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE ua text;
BEGIN
  NEW.actor_id := auth.uid();
  NEW.created_at := now();
  ua := left(coalesce(NEW.user_agent, ''), 300);
  NEW.user_agent := ua;
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  NEW.device := CASE
    WHEN ua ~* 'ipad|tablet' THEN 'تابلت'
    WHEN ua ~* 'mobile|iphone|android' THEN 'جوال'
    WHEN ua = '' THEN NULL
    ELSE 'حاسب' END;
  NEW.browser := CASE
    WHEN ua ~* 'edg/' THEN 'Edge'
    WHEN ua ~* 'chrome|crios' THEN 'Chrome'
    WHEN ua ~* 'firefox|fxios' THEN 'Firefox'
    WHEN ua ~* 'safari' THEN 'Safari'
    WHEN ua = '' THEN NULL
    ELSE 'أخرى' END;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS admin_audit_enforce_actor_trg ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_enforce_actor_trg BEFORE INSERT ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.admin_audit_enforce_actor();

-- ============ 5) ملاحظات داخلية على المستخدمين ============
CREATE TABLE public.platform_user_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  user_email text NOT NULL,
  body text NOT NULL,
  author_id uuid,
  author_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_user_notes_user_idx ON public.platform_user_notes (user_id, created_at DESC);
GRANT SELECT, INSERT, DELETE ON public.platform_user_notes TO authenticated;
GRANT ALL ON public.platform_user_notes TO service_role;
ALTER TABLE public.platform_user_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read user notes" ON public.platform_user_notes
  FOR SELECT TO authenticated USING (public.platform_has_permission(auth.uid(), 'users.read'));
CREATE POLICY "staff write user notes" ON public.platform_user_notes
  FOR INSERT TO authenticated WITH CHECK (public.platform_has_permission(auth.uid(), 'users.update'));
CREATE POLICY "staff delete user notes" ON public.platform_user_notes
  FOR DELETE TO authenticated USING (public.platform_has_permission(auth.uid(), 'users.delete'));

-- ============ 6) الإشعارات الإدارية ============
CREATE TABLE public.platform_broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  audience text NOT NULL,
  target_user_id uuid,
  target_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  channels text[] NOT NULL DEFAULT ARRAY['in_app'],
  recipients_count integer NOT NULL DEFAULT 0,
  email_sent_count integer NOT NULL DEFAULT 0,
  sent_by uuid,
  sent_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_broadcast_audience_check CHECK (audience IN ('user','organization','all'))
);
GRANT SELECT, INSERT ON public.platform_broadcasts TO authenticated;
GRANT ALL ON public.platform_broadcasts TO service_role;
ALTER TABLE public.platform_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read broadcasts" ON public.platform_broadcasts
  FOR SELECT TO authenticated USING (public.platform_has_permission(auth.uid(), 'notifications.send'));

-- ============ 7) قوالب البريد ============
CREATE TABLE public.platform_email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  subject text NOT NULL,
  body_html text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_email_templates TO authenticated;
GRANT ALL ON public.platform_email_templates TO service_role;
ALTER TABLE public.platform_email_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff read email templates" ON public.platform_email_templates
  FOR SELECT TO authenticated USING (public.is_active_platform_staff(auth.uid()));
CREATE POLICY "staff manage email templates" ON public.platform_email_templates
  FOR ALL TO authenticated
  USING (public.platform_has_permission(auth.uid(), 'email.manage'))
  WITH CHECK (public.platform_has_permission(auth.uid(), 'email.manage'));
CREATE TRIGGER platform_email_templates_updated_at BEFORE UPDATE ON public.platform_email_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.platform_email_templates (code, name_ar, subject, body_html) VALUES
  ('signup','ترحيب بالتسجيل','مرحباً بك في منصة مِهلة','<p>مرحباً {{name}}،</p><p>تم إنشاء حسابك في منصة مِهلة بنجاح.</p>'),
  ('verify','تفعيل الحساب','تفعيل حسابك في مِهلة','<p>مرحباً {{name}}،</p><p>لتفعيل حسابك اضغط على الرابط المرسل إليك.</p>'),
  ('reset_password','إعادة تعيين كلمة المرور','إعادة تعيين كلمة المرور','<p>مرحباً {{name}}،</p><p>وصلنا طلب لإعادة تعيين كلمة المرور الخاصة بحسابك.</p>'),
  ('subscription_activated','تفعيل الاشتراك','تم تفعيل اشتراكك في مِهلة','<p>مرحباً {{name}}،</p><p>تم تفعيل باقة {{plan}} حتى {{ends_at}}.</p>'),
  ('subscription_expiring','قرب انتهاء الاشتراك','اشتراكك في مِهلة على وشك الانتهاء','<p>مرحباً {{name}}،</p><p>ينتهي اشتراكك في {{ends_at}}.</p>'),
  ('support_reply','رد الدعم الفني','رد على تذكرتك {{reference}}','<p>مرحباً {{name}}،</p><p>{{body}}</p>');

-- ============ 8) الباقات: اللون والمدة ============
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#123C32',
  ADD COLUMN IF NOT EXISTS duration_months integer NOT NULL DEFAULT 12;

-- ============ 9) الاشتراكات: طريقة التفعيل والتعليق ============
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS activation_method text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text,
  ADD COLUMN IF NOT EXISTS last_modified_by uuid,
  ADD COLUMN IF NOT EXISTS last_modified_at timestamptz;

-- ============ 10) المكاتب: الإيقاف ============
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS suspended_at timestamptz,
  ADD COLUMN IF NOT EXISTS suspension_reason text;

-- ============================================================
-- 20260731151908_23de82f5-1cce-41a3-82b7-683caca770a5.sql
-- ============================================================

-- سياسات تعتمد على الدوال العامة: تُعاد كتابتها على الدوال الخاصة
DROP POLICY IF EXISTS "platform roles readable by active staff" ON public.platform_roles;
DROP POLICY IF EXISTS "platform roles managed with permission" ON public.platform_roles;
DROP POLICY IF EXISTS "staff read support grants" ON public.support_access_grants;
DROP POLICY IF EXISTS "staff read user notes" ON public.platform_user_notes;
DROP POLICY IF EXISTS "staff write user notes" ON public.platform_user_notes;
DROP POLICY IF EXISTS "staff delete user notes" ON public.platform_user_notes;
DROP POLICY IF EXISTS "staff read broadcasts" ON public.platform_broadcasts;
DROP POLICY IF EXISTS "staff read email templates" ON public.platform_email_templates;
DROP POLICY IF EXISTS "staff manage email templates" ON public.platform_email_templates;

DROP FUNCTION IF EXISTS public.platform_has_permission(uuid, text);
DROP FUNCTION IF EXISTS public.platform_staff_permissions(uuid);
DROP FUNCTION IF EXISTS public.is_active_platform_staff(uuid);
DROP FUNCTION IF EXISTS public.has_active_support_access(uuid, uuid);

-- الأدوار المخصصة تُدمج مع الصلاحيات المباشرة
CREATE OR REPLACE FUNCTION private.has_platform_permission(_user_id uuid, _permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_staff s
    LEFT JOIN public.platform_roles r ON r.id = s.role_id
    WHERE s.user_id = _user_id
      AND s.status = 'active'
      AND (
        s.role = 'super_admin'
        OR _permission = ANY(coalesce(s.permissions, '{}'::text[]))
        OR _permission = ANY(coalesce(r.permissions, '{}'::text[]))
      )
  )
$$;

CREATE OR REPLACE FUNCTION private.platform_staff_permissions(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN s.id IS NULL OR s.status <> 'active' THEN '{}'::text[]
    WHEN s.role = 'super_admin' THEN ARRAY['*']::text[]
    ELSE (SELECT ARRAY(SELECT DISTINCT x FROM unnest(coalesce(s.permissions,'{}'::text[]) || coalesce(r.permissions,'{}'::text[])) AS x))
  END
  FROM public.platform_staff s
  LEFT JOIN public.platform_roles r ON r.id = s.role_id
  WHERE s.user_id = _user_id
$$;

CREATE OR REPLACE FUNCTION private.has_active_support_access(_organization_id uuid, _staff_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.support_access_grants g
    WHERE g.organization_id = _organization_id
      AND g.staff_user_id = _staff_user_id
      AND g.status = 'approved'
      AND g.expires_at > now()
  )
$$;

REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;

CREATE POLICY "platform roles readable by active staff" ON public.platform_roles
  FOR SELECT TO authenticated USING (private.is_platform_staff(auth.uid()));
CREATE POLICY "platform roles managed with permission" ON public.platform_roles
  FOR ALL TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'roles.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'roles.manage') AND is_system = false);

CREATE POLICY "staff read support grants" ON public.support_access_grants
  FOR SELECT TO authenticated USING (private.is_platform_staff(auth.uid()));

CREATE POLICY "staff read user notes" ON public.platform_user_notes
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'users.read'));
CREATE POLICY "staff write user notes" ON public.platform_user_notes
  FOR INSERT TO authenticated WITH CHECK (private.has_platform_permission(auth.uid(), 'users.update'));
CREATE POLICY "staff delete user notes" ON public.platform_user_notes
  FOR DELETE TO authenticated USING (private.has_platform_permission(auth.uid(), 'users.delete'));

CREATE POLICY "staff read broadcasts" ON public.platform_broadcasts
  FOR SELECT TO authenticated USING (private.has_platform_permission(auth.uid(), 'notifications.send'));

CREATE POLICY "staff read email templates" ON public.platform_email_templates
  FOR SELECT TO authenticated USING (private.is_platform_staff(auth.uid()));
CREATE POLICY "staff manage email templates" ON public.platform_email_templates
  FOR ALL TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'email.manage'))
  WITH CHECK (private.has_platform_permission(auth.uid(), 'email.manage'));

-- ============================================================
-- 20260731152136_6f3f7c8f-7f17-45ca-9286-2298ca34b6f1.sql
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_user_directory(
  _search text DEFAULT NULL,
  _status text DEFAULT 'all',
  _sort text DEFAULT 'created_desc',
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, full_name text, email text, phone text, is_active boolean, created_at timestamptz,
  organization_id uuid, organization_name text, org_member_count bigint,
  plan_code text, plan_label text, subscription_status text, subscription_ends_at timestamptz,
  is_platform_staff boolean, total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT p.id, p.full_name, p.email, p.phone, p.is_active, p.created_at,
           om.organization_id,
           o.name AS organization_name,
           (SELECT count(*) FROM public.organization_members m
              WHERE m.organization_id = om.organization_id AND m.status = 'active') AS org_member_count,
           s.plan_code, s.plan_label, s.status::text AS subscription_status, s.ends_at AS subscription_ends_at,
           EXISTS (SELECT 1 FROM public.platform_staff ps WHERE ps.user_id = p.id) AS is_platform_staff
    FROM public.profiles p
    LEFT JOIN LATERAL (
      SELECT m.organization_id FROM public.organization_members m
      WHERE m.user_id = p.id AND m.status = 'active' ORDER BY m.created_at LIMIT 1
    ) om ON true
    LEFT JOIN public.organizations o ON o.id = om.organization_id
    LEFT JOIN LATERAL (
      SELECT sb.plan_code, sb.plan_label, sb.status, sb.ends_at FROM public.subscriptions sb
      WHERE sb.user_id = p.id ORDER BY (sb.status = 'active') DESC, sb.ends_at DESC LIMIT 1
    ) s ON true
  ), filtered AS (
    SELECT * FROM base b
    WHERE (_search IS NULL OR btrim(_search) = ''
           OR b.full_name ILIKE '%' || btrim(_search) || '%'
           OR coalesce(b.email,'') ILIKE '%' || btrim(_search) || '%'
           OR coalesce(b.organization_name,'') ILIKE '%' || btrim(_search) || '%')
      AND (_status = 'all'
           OR (_status = 'active' AND b.is_active)
           OR (_status = 'suspended' AND NOT b.is_active)
           OR (_status = 'no_org' AND b.organization_id IS NULL)
           OR (_status = 'subscribed' AND b.subscription_status = 'active')
           OR (_status = 'unsubscribed' AND coalesce(b.subscription_status,'none') <> 'active'))
  )
  SELECT f.*, (SELECT count(*) FROM filtered) AS total_count
  FROM filtered f
  ORDER BY
    CASE WHEN _sort = 'created_asc' THEN f.created_at END ASC NULLS LAST,
    CASE WHEN _sort = 'name_asc' THEN f.full_name END ASC NULLS LAST,
    CASE WHEN _sort = 'created_desc' THEN f.created_at END DESC NULLS LAST,
    f.created_at DESC
  LIMIT greatest(1, least(_limit, 100)) OFFSET greatest(0, _offset)
$$;

REVOKE EXECUTE ON FUNCTION public.admin_user_directory(text, text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_user_directory(text, text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_organization_directory(
  _search text DEFAULT NULL,
  _status text DEFAULT 'all',
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, name text, legal_name text, city text, phone text, email text, address text,
  commercial_registration text, tax_number text,
  is_active boolean, suspended_at timestamptz, suspension_reason text, created_at timestamptz,
  users_count bigint, lawyers_count bigint, cases_count bigint, clients_count bigint,
  documents_count bigint, storage_bytes bigint,
  plan_code text, plan_label text, subscription_status text, subscription_ends_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT o.id, o.name, o.legal_name, o.city, o.phone, o.email, o.address,
           o.commercial_registration, o.tax_number,
           o.is_active, o.suspended_at, o.suspension_reason, o.created_at,
           (SELECT count(*) FROM public.organization_members m WHERE m.organization_id = o.id AND m.status = 'active') AS users_count,
           (SELECT count(*) FROM public.organization_members m WHERE m.organization_id = o.id AND m.status = 'active' AND m.role IN ('owner','admin','lawyer')) AS lawyers_count,
           (SELECT count(*) FROM public.cases c WHERE c.organization_id = o.id) AS cases_count,
           (SELECT count(*) FROM public.clients cl WHERE cl.organization_id = o.id) AS clients_count,
           (SELECT count(*) FROM public.documents d WHERE d.organization_id = o.id) AS documents_count,
           (SELECT coalesce(sum(d.file_size), 0) FROM public.documents d WHERE d.organization_id = o.id) AS storage_bytes,
           s.plan_code, s.plan_label, s.status::text AS subscription_status, s.ends_at AS subscription_ends_at
    FROM public.organizations o
    LEFT JOIN LATERAL (
      SELECT sb.plan_code, sb.plan_label, sb.status, sb.ends_at FROM public.subscriptions sb
      WHERE sb.organization_id = o.id ORDER BY (sb.status = 'active') DESC, sb.ends_at DESC LIMIT 1
    ) s ON true
  ), filtered AS (
    SELECT * FROM base b
    WHERE (_search IS NULL OR btrim(_search) = ''
           OR b.name ILIKE '%' || btrim(_search) || '%'
           OR coalesce(b.city,'') ILIKE '%' || btrim(_search) || '%'
           OR coalesce(b.email,'') ILIKE '%' || btrim(_search) || '%')
      AND (_status = 'all'
           OR (_status = 'active' AND b.is_active)
           OR (_status = 'suspended' AND NOT b.is_active)
           OR (_status = 'subscribed' AND b.subscription_status = 'active')
           OR (_status = 'unsubscribed' AND coalesce(b.subscription_status,'none') <> 'active'))
  )
  SELECT f.*, (SELECT count(*) FROM filtered) AS total_count
  FROM filtered f
  ORDER BY f.created_at DESC
  LIMIT greatest(1, least(_limit, 100)) OFFSET greatest(0, _offset)
$$;

REVOKE EXECUTE ON FUNCTION public.admin_organization_directory(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_organization_directory(text, text, integer, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_revenue_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH paid AS (
    SELECT * FROM public.subscriptions WHERE status <> 'cancelled'
  )
  SELECT jsonb_build_object(
    'today', (SELECT coalesce(sum(amount),0) FROM paid WHERE created_at >= date_trunc('day', now())),
    'week', (SELECT coalesce(sum(amount),0) FROM paid WHERE created_at >= date_trunc('week', now())),
    'month', (SELECT coalesce(sum(amount),0) FROM paid WHERE created_at >= date_trunc('month', now())),
    'year', (SELECT coalesce(sum(amount),0) FROM paid WHERE created_at >= date_trunc('year', now())),
    'total', (SELECT coalesce(sum(amount),0) FROM paid),
    'active_count', (SELECT count(*) FROM paid WHERE status = 'active' AND ends_at > now()),
    'by_plan', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT plan_label AS label, count(*) AS count, coalesce(sum(amount),0) AS amount
        FROM paid GROUP BY plan_label ORDER BY 3 DESC) x),
    'by_month', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
               coalesce(sum(amount),0) AS amount, count(*) AS count
        FROM paid WHERE created_at >= (date_trunc('month', now()) - interval '11 months')
        GROUP BY 1 ORDER BY 1) x),
    'by_organization', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT coalesce(o.name, 'بدون مكتب') AS label, coalesce(sum(p.amount),0) AS amount, count(*) AS count
        FROM paid p LEFT JOIN public.organizations o ON o.id = p.organization_id
        GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.admin_revenue_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revenue_summary() TO service_role;

-- ============================================================
-- 20260802123041_6c12765a-b6e6-46e1-9457-e34e7dcb95ef.sql
-- ============================================================
-- =========================================================
-- 1. Plan capability columns
-- =========================================================
ALTER TABLE public.platform_plans
  ADD COLUMN IF NOT EXISTS max_clients integer,
  ADD COLUMN IF NOT EXISTS ocr_pages_monthly integer,
  ADD COLUMN IF NOT EXISTS esignature_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS voice_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_search_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS client_upload_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS support_level text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS sla_hours integer NOT NULL DEFAULT 24;

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS auto_renew boolean NOT NULL DEFAULT false;

-- Fallback plan used when an office has no active subscription.
INSERT INTO public.platform_plans
  (code, name_ar, name_en, description, price_monthly, price_yearly, currency,
   max_users, max_cases, max_documents, max_clients, storage_gb, ocr_pages_monthly,
   ai_enabled, esignature_enabled, voice_enabled, api_enabled,
   pdf_search_enabled, client_upload_enabled, support_level, sla_hours,
   is_active, is_public, sort_order, color, duration_months, features)
VALUES
  ('free', 'الباقة المجانية', 'Free', 'وصول محدود يُطبّق تلقائياً عند عدم وجود اشتراك نشط.',
   0, 0, 'SAR', 1, 5, 20, 5, 1, 0,
   false, false, false, false, true, false, 'community', 72,
   true, false, 0, '#6B7280', 1, '[]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- =========================================================
-- 2. Invoices
-- =========================================================
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  user_id uuid,
  number text NOT NULL UNIQUE,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  status text NOT NULL DEFAULT 'paid',
  payment_method text,
  paid_at timestamptz,
  issued_at timestamptz NOT NULL DEFAULT now(),
  pdf_path text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "invoices org members read" ON public.invoices;
CREATE POLICY "invoices org members read" ON public.invoices FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR private.is_organization_member(organization_id, auth.uid()));

DROP POLICY IF EXISTS "invoices staff read" ON public.invoices;
CREATE POLICY "invoices staff read" ON public.invoices FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'subscriptions.manage'));

DROP TRIGGER IF EXISTS invoices_set_updated_at ON public.invoices;
CREATE TRIGGER invoices_set_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS invoices_org_idx ON public.invoices(organization_id, issued_at DESC);

-- =========================================================
-- 3. Metered usage counters (OCR pages, API calls, ...)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.usage_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric text NOT NULL,
  period_start date NOT NULL,
  used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, metric, period_start)
);

GRANT SELECT ON public.usage_counters TO authenticated;
GRANT ALL ON public.usage_counters TO service_role;
ALTER TABLE public.usage_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage org members read" ON public.usage_counters;
CREATE POLICY "usage org members read" ON public.usage_counters FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));

DROP TRIGGER IF EXISTS usage_counters_set_updated_at ON public.usage_counters;
CREATE TRIGGER usage_counters_set_updated_at BEFORE UPDATE ON public.usage_counters
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Organization members can read their own office subscriptions.
DROP POLICY IF EXISTS "org members read org subscriptions" ON public.subscriptions;
CREATE POLICY "org members read org subscriptions" ON public.subscriptions FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));

-- =========================================================
-- 4. Entitlement resolution (server-side source of truth)
-- =========================================================
CREATE OR REPLACE FUNCTION private.org_subscription(_org uuid)
RETURNS public.subscriptions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT s.* FROM public.subscriptions s
  WHERE s.organization_id = _org
  ORDER BY (s.status = 'active' AND s.ends_at > now()) DESC,
           (s.status = 'trial' AND s.ends_at > now()) DESC,
           s.ends_at DESC
  LIMIT 1
$$;

-- Effective state: active | trial | expired | suspended | cancelled | none
CREATE OR REPLACE FUNCTION private.org_subscription_state(_org uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE
    WHEN s.id IS NULL THEN 'none'
    WHEN s.status = 'cancelled' THEN 'cancelled'
    WHEN s.suspended_at IS NOT NULL THEN 'suspended'
    WHEN s.ends_at <= now() THEN 'expired'
    WHEN s.status = 'trial' THEN 'trial'
    WHEN s.status = 'active' THEN 'active'
    ELSE s.status::text
  END
  FROM (SELECT * FROM private.org_subscription(_org)) s
$$;

-- Plan actually in force right now (falls back to the free plan).
CREATE OR REPLACE FUNCTION private.org_effective_plan(_org uuid)
RETURNS public.platform_plans
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_state text := private.org_subscription_state(_org);
  v_sub public.subscriptions;
  v_plan public.platform_plans;
BEGIN
  IF v_state IN ('active', 'trial') THEN
    SELECT * INTO v_sub FROM private.org_subscription(_org);
    IF v_sub.plan_id IS NOT NULL THEN
      SELECT * INTO v_plan FROM public.platform_plans WHERE id = v_sub.plan_id;
    END IF;
    IF v_plan.id IS NULL AND v_sub.plan_code IS NOT NULL THEN
      SELECT * INTO v_plan FROM public.platform_plans WHERE code = v_sub.plan_code;
    END IF;
    IF v_plan.id IS NOT NULL THEN
      RETURN v_plan;
    END IF;
  END IF;
  SELECT * INTO v_plan FROM public.platform_plans WHERE code = 'free';
  RETURN v_plan;
END;
$$;

CREATE OR REPLACE FUNCTION private.org_usage(_org uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT jsonb_build_object(
    'users', (SELECT count(*) FROM public.organization_members m
              WHERE m.organization_id = _org AND m.status <> 'suspended'),
    'cases', (SELECT count(*) FROM public.cases c WHERE c.organization_id = _org),
    'clients', (SELECT count(*) FROM public.clients cl WHERE cl.organization_id = _org),
    'documents', (SELECT count(*) FROM public.documents d WHERE d.organization_id = _org),
    'storage_bytes', (SELECT coalesce(sum(d.file_size), 0) FROM public.documents d WHERE d.organization_id = _org),
    'ocr_pages', (SELECT coalesce(sum(u.used), 0) FROM public.usage_counters u
                  WHERE u.organization_id = _org AND u.metric = 'ocr_pages'
                    AND u.period_start = date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')::date)
  )
$$;

-- Public read API for the app: full subscription snapshot for one office.
CREATE OR REPLACE FUNCTION public.my_subscription_overview(_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_sub public.subscriptions;
  v_plan public.platform_plans;
  v_state text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_organization_member(_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_sub FROM private.org_subscription(_organization_id);
  SELECT * INTO v_plan FROM private.org_effective_plan(_organization_id);
  v_state := private.org_subscription_state(_organization_id);

  RETURN jsonb_build_object(
    'state', v_state,
    'now', now(),
    'subscription', CASE WHEN v_sub.id IS NULL THEN NULL ELSE jsonb_build_object(
        'id', v_sub.id,
        'plan_code', v_sub.plan_code,
        'plan_label', v_sub.plan_label,
        'status', v_sub.status,
        'amount', v_sub.amount,
        'currency', v_sub.currency,
        'starts_at', v_sub.starts_at,
        'ends_at', v_sub.ends_at,
        'auto_renew', v_sub.auto_renew,
        'suspended_at', v_sub.suspended_at,
        'suspension_reason', v_sub.suspension_reason,
        'cancelled_at', v_sub.cancelled_at,
        'days_remaining', floor(extract(epoch FROM (v_sub.ends_at - now())) / 86400)::int
      ) END,
    'plan', jsonb_build_object(
        'code', v_plan.code,
        'name_ar', v_plan.name_ar,
        'description', v_plan.description,
        'price_monthly', v_plan.price_monthly,
        'price_yearly', v_plan.price_yearly,
        'currency', v_plan.currency,
        'max_users', v_plan.max_users,
        'max_cases', v_plan.max_cases,
        'max_clients', v_plan.max_clients,
        'max_documents', v_plan.max_documents,
        'storage_gb', v_plan.storage_gb,
        'ocr_pages_monthly', v_plan.ocr_pages_monthly,
        'ai_enabled', v_plan.ai_enabled,
        'esignature_enabled', v_plan.esignature_enabled,
        'voice_enabled', v_plan.voice_enabled,
        'api_enabled', v_plan.api_enabled,
        'pdf_search_enabled', v_plan.pdf_search_enabled,
        'client_upload_enabled', v_plan.client_upload_enabled,
        'support_level', v_plan.support_level,
        'sla_hours', v_plan.sla_hours,
        'features', v_plan.features
      ),
    'usage', private.org_usage(_organization_id),
    'history', (SELECT coalesce(jsonb_agg(h ORDER BY h->>'starts_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', s.id, 'plan_label', s.plan_label, 'status', s.status,
          'starts_at', s.starts_at, 'ends_at', s.ends_at,
          'amount', s.amount, 'currency', s.currency,
          'suspended_at', s.suspended_at
        ) AS h
        FROM public.subscriptions s WHERE s.organization_id = _organization_id
      ) x),
    'invoices', (SELECT coalesce(jsonb_agg(i ORDER BY i->>'issued_at' DESC), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'id', v.id, 'number', v.number, 'amount', v.amount, 'currency', v.currency,
          'status', v.status, 'payment_method', v.payment_method,
          'paid_at', v.paid_at, 'issued_at', v.issued_at, 'pdf_path', v.pdf_path
        ) AS i
        FROM public.invoices v WHERE v.organization_id = _organization_id
      ) y),
    'upgrade_plans', (SELECT coalesce(jsonb_agg(p ORDER BY p->>'sort_order'), '[]'::jsonb) FROM (
        SELECT jsonb_build_object(
          'code', pl.code, 'name_ar', pl.name_ar, 'price_monthly', pl.price_monthly,
          'sort_order', pl.sort_order, 'max_users', pl.max_users, 'max_cases', pl.max_cases,
          'esignature_enabled', pl.esignature_enabled, 'voice_enabled', pl.voice_enabled,
          'api_enabled', pl.api_enabled, 'ai_enabled', pl.ai_enabled
        ) AS p
        FROM public.platform_plans pl WHERE pl.is_active AND pl.is_public
      ) z)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.my_subscription_overview(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_subscription_overview(uuid) TO authenticated;

-- Metered usage recording (server-side only paths).
CREATE OR REPLACE FUNCTION public.record_metered_usage(_organization_id uuid, _metric text, _amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_period date := date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')::date;
  v_limit integer;
  v_used integer;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_organization_member(_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'INVALID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;
  IF _metric <> 'ocr_pages' THEN
    RAISE EXCEPTION 'UNKNOWN_METRIC' USING ERRCODE = 'P0001';
  END IF;

  IF private.org_subscription_state(_organization_id) NOT IN ('active', 'trial') THEN
    RAISE EXCEPTION 'SUBSCRIPTION_INACTIVE' USING ERRCODE = 'P0001';
  END IF;

  SELECT ocr_pages_monthly INTO v_limit FROM private.org_effective_plan(_organization_id);

  INSERT INTO public.usage_counters (organization_id, metric, period_start, used)
  VALUES (_organization_id, _metric, v_period, _amount)
  ON CONFLICT (organization_id, metric, period_start)
  DO UPDATE SET used = public.usage_counters.used + _amount
  RETURNING used INTO v_used;

  IF v_limit IS NOT NULL AND v_used > v_limit THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED:ocr_pages' USING ERRCODE = 'P0001';
  END IF;

  RETURN v_used;
END;
$$;

REVOKE ALL ON FUNCTION public.record_metered_usage(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_metered_usage(uuid, text, integer) TO authenticated;

-- =========================================================
-- 5. Hard quota enforcement at the database layer
-- =========================================================
CREATE OR REPLACE FUNCTION private.enforce_plan_quota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_org uuid := NEW.organization_id;
  v_state text;
  v_plan public.platform_plans;
  v_count bigint;
  v_bytes bigint;
BEGIN
  IF v_org IS NULL THEN
    RETURN NEW;
  END IF;

  v_state := private.org_subscription_state(v_org);
  SELECT * INTO v_plan FROM private.org_effective_plan(v_org);

  IF v_state = 'suspended' THEN
    RAISE EXCEPTION 'SUBSCRIPTION_SUSPENDED' USING ERRCODE = 'P0001';
  END IF;

  IF TG_TABLE_NAME = 'cases' AND v_plan.max_cases IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.cases WHERE organization_id = v_org;
    IF v_count >= v_plan.max_cases THEN
      RAISE EXCEPTION 'QUOTA_EXCEEDED:cases' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'clients' AND v_plan.max_clients IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.clients WHERE organization_id = v_org;
    IF v_count >= v_plan.max_clients THEN
      RAISE EXCEPTION 'QUOTA_EXCEEDED:clients' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'organization_members' THEN
    IF NEW.status <> 'suspended' AND v_plan.max_users IS NOT NULL THEN
      SELECT count(*) INTO v_count FROM public.organization_members
        WHERE organization_id = v_org AND status <> 'suspended';
      IF v_count >= v_plan.max_users THEN
        RAISE EXCEPTION 'QUOTA_EXCEEDED:users' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'organization_invitations' AND v_plan.max_users IS NOT NULL THEN
    SELECT count(*) INTO v_count FROM public.organization_members
      WHERE organization_id = v_org AND status <> 'suspended';
    IF v_count >= v_plan.max_users THEN
      RAISE EXCEPTION 'QUOTA_EXCEEDED:users' USING ERRCODE = 'P0001';
    END IF;
  ELSIF TG_TABLE_NAME = 'documents' THEN
    IF v_plan.max_documents IS NOT NULL THEN
      SELECT count(*) INTO v_count FROM public.documents WHERE organization_id = v_org;
      IF v_count >= v_plan.max_documents THEN
        RAISE EXCEPTION 'QUOTA_EXCEEDED:documents' USING ERRCODE = 'P0001';
      END IF;
    END IF;
    IF v_plan.storage_gb IS NOT NULL THEN
      SELECT coalesce(sum(file_size), 0) INTO v_bytes FROM public.documents WHERE organization_id = v_org;
      IF v_bytes + coalesce(NEW.file_size, 0) > (v_plan.storage_gb::bigint * 1073741824) THEN
        RAISE EXCEPTION 'QUOTA_EXCEEDED:storage' USING ERRCODE = 'P0001';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'document_requests' THEN
    IF NOT v_plan.client_upload_enabled THEN
      RAISE EXCEPTION 'FEATURE_UNAVAILABLE:client_upload' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS cases_enforce_quota ON public.cases;
CREATE TRIGGER cases_enforce_quota BEFORE INSERT ON public.cases
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

DROP TRIGGER IF EXISTS clients_enforce_quota ON public.clients;
CREATE TRIGGER clients_enforce_quota BEFORE INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

DROP TRIGGER IF EXISTS documents_enforce_quota ON public.documents;
CREATE TRIGGER documents_enforce_quota BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

DROP TRIGGER IF EXISTS members_enforce_quota ON public.organization_members;
CREATE TRIGGER members_enforce_quota BEFORE INSERT ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

DROP TRIGGER IF EXISTS invitations_enforce_quota ON public.organization_invitations;
CREATE TRIGGER invitations_enforce_quota BEFORE INSERT ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

DROP TRIGGER IF EXISTS document_requests_enforce_quota ON public.document_requests;
CREATE TRIGGER document_requests_enforce_quota BEFORE INSERT ON public.document_requests
  FOR EACH ROW EXECUTE FUNCTION private.enforce_plan_quota();

-- ============================================================
-- 20260802123200_b5313fe8-1c14-436f-b34d-44d098be1b83.sql
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.my_subscription_overview(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_metered_usage(uuid, text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_subscription_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_metered_usage(uuid, text, integer) TO authenticated;
-- ============================================================
-- 20260802124303_3053bcf7-2e1f-4bd0-a947-3659f2877304.sql
-- ============================================================
-- ============================ Arabic text normalisation ============================

CREATE OR REPLACE FUNCTION public.normalize_ar(_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT regexp_replace(
           translate(
             regexp_replace(coalesce(_input, ''), '[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]', '', 'g'),
             'أإآٱىئؤةڤگچپژ',
             'اااايياهفكجبز'
           ),
           '\s+', ' ', 'g')
$$;

COMMENT ON FUNCTION public.normalize_ar(text) IS
  'يوحّد أشكال الهمزات والألف والياء والتاء المربوطة ويحذف التشكيل والتطويل للبحث العربي.';

-- ================================ processing jobs ================================

CREATE TYPE public.document_job_status AS ENUM
  ('queued', 'extracting', 'ocr_processing', 'indexing', 'completed', 'failed');

CREATE TABLE public.document_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  status public.document_job_status NOT NULL DEFAULT 'queued',
  processing_type text NOT NULL DEFAULT 'text',
  progress integer NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  pages_total integer,
  pages_done integer NOT NULL DEFAULT 0,
  ocr_pages integer NOT NULL DEFAULT 0,
  attempts integer NOT NULL DEFAULT 0,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_processing_jobs_document_key UNIQUE (document_id)
);

GRANT SELECT, INSERT, UPDATE ON public.document_processing_jobs TO authenticated;
GRANT ALL ON public.document_processing_jobs TO service_role;
ALTER TABLE public.document_processing_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_select ON public.document_processing_jobs FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY jobs_insert ON public.document_processing_jobs FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));
CREATE POLICY jobs_update ON public.document_processing_jobs FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));

CREATE INDEX document_processing_jobs_org_idx ON public.document_processing_jobs (organization_id, status);
CREATE TRIGGER document_processing_jobs_touch BEFORE UPDATE ON public.document_processing_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ================================ document pages ================================

CREATE TABLE public.document_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  extracted_text text NOT NULL DEFAULT '',
  original_text text,
  ocr_used boolean NOT NULL DEFAULT false,
  ocr_confidence numeric(4,3),
  language text,
  is_blank boolean NOT NULL DEFAULT false,
  edited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  edited_at timestamptz,
  search_vector tsvector GENERATED ALWAYS AS
    (to_tsvector('simple'::regconfig, public.normalize_ar(extracted_text))) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT document_pages_unique UNIQUE (document_id, page_number)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_pages TO authenticated;
GRANT ALL ON public.document_pages TO service_role;
ALTER TABLE public.document_pages ENABLE ROW LEVEL SECURITY;

CREATE POLICY pages_select ON public.document_pages FOR SELECT TO authenticated
  USING (private.is_organization_member(organization_id, auth.uid()));
CREATE POLICY pages_insert ON public.document_pages FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));
CREATE POLICY pages_update ON public.document_pages FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin','lawyer','legal_assistant']::app_role[]));
CREATE POLICY pages_delete ON public.document_pages FOR DELETE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(),
    ARRAY['owner','admin']::app_role[]));

CREATE INDEX document_pages_search_idx ON public.document_pages USING GIN (search_vector);
CREATE INDEX document_pages_doc_idx ON public.document_pages (document_id, page_number);
CREATE INDEX document_pages_org_idx ON public.document_pages (organization_id);
CREATE TRIGGER document_pages_touch BEFORE UPDATE ON public.document_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- كل تعديل يدوي يحفظ النسخة الأصلية مرة واحدة فقط.
CREATE OR REPLACE FUNCTION public.document_pages_track_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.extracted_text IS DISTINCT FROM OLD.extracted_text THEN
    IF OLD.original_text IS NULL THEN
      NEW.original_text := OLD.extracted_text;
    END IF;
    NEW.edited_by := auth.uid();
    NEW.edited_at := now();
  END IF;
  NEW.organization_id := OLD.organization_id;
  NEW.document_id := OLD.document_id;
  NEW.page_number := OLD.page_number;
  RETURN NEW;
END;
$$;

CREATE TRIGGER document_pages_edit_guard BEFORE UPDATE ON public.document_pages
  FOR EACH ROW EXECUTE FUNCTION public.document_pages_track_edit();

-- ============================== document search API ==============================

CREATE OR REPLACE FUNCTION public.search_document_pages(
  _query text,
  _case_id uuid DEFAULT NULL,
  _client_id uuid DEFAULT NULL,
  _file_type text DEFAULT NULL,
  _ocr_only boolean DEFAULT false,
  _from date DEFAULT NULL,
  _to date DEFAULT NULL,
  _limit integer DEFAULT 20,
  _offset integer DEFAULT 0
)
RETURNS TABLE(
  document_id uuid,
  page_id uuid,
  page_number integer,
  file_name text,
  file_type text,
  document_created_at timestamptz,
  case_id uuid,
  case_title text,
  client_id uuid,
  client_name text,
  ocr_used boolean,
  snippet text,
  rank real,
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('simple'::regconfig, public.normalize_ar(_query)) AS tsq
  ), matched AS (
    SELECT p.id AS page_id, p.document_id, p.page_number, p.ocr_used, p.extracted_text,
           d.file_name, d.file_type, d.created_at AS document_created_at,
           d.case_id, c.case_title, d.client_id, cl.full_name AS client_name,
           ts_rank(p.search_vector, (SELECT tsq FROM q)) AS rank
    FROM public.document_pages p
    JOIN public.documents d ON d.id = p.document_id
    LEFT JOIN public.cases c ON c.id = d.case_id
    LEFT JOIN public.clients cl ON cl.id = d.client_id
    WHERE (SELECT tsq FROM q) IS NOT NULL
      AND p.search_vector @@ (SELECT tsq FROM q)
      AND (_case_id IS NULL OR d.case_id = _case_id)
      AND (_client_id IS NULL OR d.client_id = _client_id)
      AND (_file_type IS NULL OR coalesce(d.file_type, '') ILIKE '%' || _file_type || '%')
      AND (_ocr_only IS NOT TRUE OR p.ocr_used)
      AND (_from IS NULL OR d.created_at >= _from)
      AND (_to IS NULL OR d.created_at < (_to + 1))
  )
  SELECT m.document_id, m.page_id, m.page_number, m.file_name, m.file_type, m.document_created_at,
         m.case_id, m.case_title, m.client_id, m.client_name, m.ocr_used,
         ts_headline('simple'::regconfig, public.normalize_ar(m.extracted_text), (SELECT tsq FROM q),
                     'StartSel=<mark>,StopSel=</mark>,MaxWords=32,MinWords=12,MaxFragments=2,FragmentDelimiter= … ') AS snippet,
         m.rank,
         (SELECT count(*) FROM matched) AS total_count
  FROM matched m
  ORDER BY m.rank DESC, m.document_created_at DESC, m.page_number
  LIMIT greatest(1, least(coalesce(_limit, 20), 50))
  OFFSET greatest(0, coalesce(_offset, 0))
$$;

REVOKE ALL ON FUNCTION public.search_document_pages(text, uuid, uuid, text, boolean, date, date, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.search_document_pages(text, uuid, uuid, text, boolean, date, date, integer, integer) TO authenticated;
REVOKE ALL ON FUNCTION public.normalize_ar(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_ar(text) TO authenticated, service_role;

-- ============================== OCR quota accounting ==============================

CREATE OR REPLACE FUNCTION public.consume_ocr_pages(_organization_id uuid, _pages integer)
RETURNS TABLE(allowed boolean, used integer, monthly_limit integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_period date := date_trunc('month', now())::date;
  v_limit integer;
  v_used integer;
BEGIN
  IF NOT private.is_organization_member(_organization_id, auth.uid()) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  SELECT p.ocr_pages_monthly INTO v_limit
  FROM private.org_effective_plan(_organization_id) p;

  SELECT coalesce(uc.used, 0) INTO v_used
  FROM public.usage_counters uc
  WHERE uc.organization_id = _organization_id
    AND uc.metric = 'ocr_pages'
    AND uc.period_start = v_period;

  v_used := coalesce(v_used, 0);

  IF v_limit IS NOT NULL AND v_used + greatest(_pages, 0) > v_limit THEN
    RETURN QUERY SELECT false, v_used, v_limit;
    RETURN;
  END IF;

  INSERT INTO public.usage_counters (organization_id, metric, period_start, used)
  VALUES (_organization_id, 'ocr_pages', v_period, greatest(_pages, 0))
  ON CONFLICT (organization_id, metric, period_start)
  DO UPDATE SET used = public.usage_counters.used + greatest(_pages, 0), updated_at = now()
  RETURNING public.usage_counters.used INTO v_used;

  RETURN QUERY SELECT true, v_used, v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ocr_pages(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_ocr_pages(uuid, integer) TO authenticated;

-- ======================= platform-side aggregate metrics only ======================

CREATE OR REPLACE FUNCTION public.admin_service_usage_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE WHEN private.has_platform_permission(auth.uid(), 'analytics.view') THEN jsonb_build_object(
    'ocr_pages_month', (SELECT coalesce(sum(used), 0) FROM public.usage_counters
                        WHERE metric = 'ocr_pages' AND period_start = date_trunc('month', now())::date),
    'ocr_pages_total', (SELECT coalesce(sum(used), 0) FROM public.usage_counters WHERE metric = 'ocr_pages'),
    'indexed_documents', (SELECT count(DISTINCT document_id) FROM public.document_pages),
    'indexed_pages', (SELECT count(*) FROM public.document_pages),
    'jobs_completed', (SELECT count(*) FROM public.document_processing_jobs WHERE status = 'completed'),
    'jobs_failed', (SELECT count(*) FROM public.document_processing_jobs WHERE status = 'failed'),
    'jobs_running', (SELECT count(*) FROM public.document_processing_jobs
                     WHERE status IN ('queued','extracting','ocr_processing','indexing')),
    'avg_processing_seconds', (SELECT coalesce(round(avg(extract(epoch FROM (completed_at - started_at)))::numeric, 1), 0)
                               FROM public.document_processing_jobs
                               WHERE status = 'completed' AND started_at IS NOT NULL AND completed_at IS NOT NULL),
    'error_codes', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
                      SELECT coalesce(error_code, 'UNKNOWN') AS code, count(*) AS count
                      FROM public.document_processing_jobs WHERE status = 'failed'
                      GROUP BY 1 ORDER BY 2 DESC LIMIT 10) x)
  ) ELSE NULL::jsonb END
$$;

REVOKE ALL ON FUNCTION public.admin_service_usage_summary() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_service_usage_summary() TO authenticated;
-- ============================================================
-- 20260802132050_b755be93-dc50-4b0f-88e0-97ee96d88560.sql
-- ============================================================
CREATE TABLE public.print_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  print_ref text NOT NULL,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name text,
  user_email text,
  user_role text,
  action text NOT NULL,
  document_id uuid,
  document_type text NOT NULL,
  document_ref text,
  document_title text,
  document_version text NOT NULL DEFAULT 'v1',
  classification text NOT NULL DEFAULT 'internal',
  pages_count integer NOT NULL DEFAULT 1,
  copy_number integer NOT NULL DEFAULT 1,
  watermark_override boolean NOT NULL DEFAULT false,
  ip text,
  country text,
  browser text,
  os text,
  device text,
  session_id text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX print_audit_logs_org_created_idx ON public.print_audit_logs (organization_id, created_at DESC);
CREATE INDEX print_audit_logs_document_idx ON public.print_audit_logs (document_id);
CREATE UNIQUE INDEX print_audit_logs_print_ref_idx ON public.print_audit_logs (print_ref);

GRANT SELECT, INSERT ON public.print_audit_logs TO authenticated;
GRANT SELECT, INSERT ON public.print_audit_logs TO service_role;

ALTER TABLE public.print_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Office members read their office print logs"
ON public.print_audit_logs FOR SELECT TO authenticated
USING (private.is_organization_member(organization_id, auth.uid()));

CREATE POLICY "Office members append their own print logs"
ON public.print_audit_logs FOR INSERT TO authenticated
WITH CHECK (private.is_organization_member(organization_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.print_audit_enforce_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE ua text;
BEGIN
  NEW.user_id := auth.uid();
  NEW.created_at := now();
  ua := left(coalesce(NEW.user_agent, ''), 400);
  NEW.user_agent := ua;
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  NEW.action := lower(coalesce(NEW.action, 'print'));
  IF NEW.action NOT IN ('print', 'export_pdf', 'download') THEN
    RAISE EXCEPTION 'INVALID_PRINT_ACTION' USING ERRCODE = 'P0001';
  END IF;
  NEW.pages_count := greatest(coalesce(NEW.pages_count, 1), 1);
  NEW.copy_number := greatest(coalesce(NEW.copy_number, 1), 1);
  RETURN NEW;
END;
$$;

CREATE TRIGGER print_audit_logs_enforce_actor
BEFORE INSERT ON public.print_audit_logs
FOR EACH ROW EXECUTE FUNCTION public.print_audit_enforce_actor();

CREATE OR REPLACE FUNCTION public.print_copy_number(_organization_id uuid, _document_id uuid, _document_ref text)
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
  SELECT CASE WHEN private.is_organization_member(_organization_id, auth.uid())
    THEN (SELECT count(*)::int + 1 FROM public.print_audit_logs l
          WHERE l.organization_id = _organization_id
            AND ((_document_id IS NOT NULL AND l.document_id = _document_id)
                 OR (_document_id IS NULL AND _document_ref IS NOT NULL AND l.document_ref = _document_ref)))
    ELSE 1 END
$$;

REVOKE ALL ON FUNCTION public.print_copy_number(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.print_copy_number(uuid, uuid, text) TO authenticated, service_role;
-- ============================================================
-- 20260802142622_34098dc9-45ac-4ca0-b968-18faa0f4f8c7.sql
-- ============================================================
REVOKE EXECUTE ON FUNCTION public.consume_ocr_pages(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.admin_service_usage_summary() FROM anon, public;
GRANT EXECUTE ON FUNCTION public.consume_ocr_pages(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_service_usage_summary() TO authenticated, service_role;

DROP POLICY IF EXISTS "staff write audit log" ON public.admin_audit_logs;
CREATE POLICY "staff write audit log" ON public.admin_audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    private.is_platform_staff(auth.uid())
    AND actor_id = auth.uid()
    AND (
      actor_email IS NULL
      OR lower(actor_email) = lower(coalesce((SELECT p.email FROM public.profiles p WHERE p.id = auth.uid()), actor_email))
    )
  );

DROP POLICY IF EXISTS "support staff add messages" ON public.support_ticket_messages;
CREATE POLICY "support staff add messages" ON public.support_ticket_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND is_staff = true
    AND private.has_platform_permission(auth.uid(), 'tickets.reply')
  );
-- ============================================================
-- 20260802143212_d402c744-69ef-4c73-affe-82963ac88b59.sql
-- ============================================================
CREATE TABLE public.document_access_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('view','preview','download','print','export','share','process')),
  token_hash text NOT NULL UNIQUE,
  watermark_office text NOT NULL,
  watermark_user text NOT NULL,
  watermark_note text,
  classification text NOT NULL DEFAULT 'internal',
  recipient_label text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expires_at timestamp with time zone NOT NULL,
  max_uses integer NOT NULL DEFAULT 3,
  used_count integer NOT NULL DEFAULT 0,
  last_used_at timestamp with time zone,
  revoked_at timestamp with time zone,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_access_tokens TO authenticated;
GRANT ALL ON public.document_access_tokens TO service_role;

ALTER TABLE public.document_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_share_links_select" ON public.document_access_tokens
  FOR SELECT TO authenticated
  USING (kind = 'share' AND private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role,'lawyer'::app_role]));

CREATE INDEX document_access_tokens_org_idx ON public.document_access_tokens (organization_id, created_at DESC);
CREATE INDEX document_access_tokens_document_idx ON public.document_access_tokens (document_id, kind);

CREATE TRIGGER document_access_tokens_touch
  BEFORE UPDATE ON public.document_access_tokens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.document_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id uuid REFERENCES public.documents(id) ON DELETE SET NULL,
  share_token_id uuid REFERENCES public.document_access_tokens(id) ON DELETE SET NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_name text,
  office_name text,
  document_name text,
  action_type text NOT NULL CHECK (action_type IN ('VIEW','PREVIEW','DOWNLOAD','SHARE','PRINT','EXPORT')),
  print_id text,
  ip text,
  browser text,
  os text,
  device text,
  session_id text,
  source_page text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_access_logs TO authenticated;
GRANT ALL ON public.document_access_logs TO service_role;

ALTER TABLE public.document_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_access_logs_select_admins" ON public.document_access_logs
  FOR SELECT TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

CREATE INDEX document_access_logs_org_idx ON public.document_access_logs (organization_id, created_at DESC);
CREATE INDEX document_access_logs_document_idx ON public.document_access_logs (document_id, created_at DESC);

DROP POLICY IF EXISTS "docs_storage_select" ON storage.objects;
-- ============================================================
-- 20260802145353_6ab85a0e-9a4d-4d90-985b-7b9317c6c1e7.sql
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
-- ============================================================
-- 20260802145432_2efa6ef8-a183-4bb0-a6a2-243dfa2a7f7c.sql
-- ============================================================
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
REVOKE ALL ON SCHEMA net FROM anon, authenticated, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM anon, authenticated, public;
GRANT USAGE ON SCHEMA net TO postgres, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO postgres, service_role;
-- ============================================================
-- 20260802151349_281c3e0e-216a-452f-9070-a558d6fbd325.sql
-- ============================================================
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS rating smallint,
  ADD COLUMN IF NOT EXISTS rating_comment text,
  ADD COLUMN IF NOT EXISTS rated_at timestamptz,
  ADD COLUMN IF NOT EXISTS rated_staff_id uuid,
  ADD COLUMN IF NOT EXISTS rated_staff_name text;

CREATE OR REPLACE FUNCTION public.support_tickets_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.user_id := coalesce(auth.uid(), NEW.user_id);
    NEW.reference := coalesce(nullif(btrim(NEW.reference), ''),
      'TK-' || to_char(now(), 'YYMMDD') || '-' || lpad((floor(random() * 100000))::int::text, 5, '0'));
    NEW.status := 'new';
    NEW.rating := NULL; NEW.rating_comment := NULL; NEW.rated_at := NULL;
    NEW.rated_staff_id := NULL; NEW.rated_staff_name := NULL;
    NEW.last_reply_at := now();
    RETURN NEW;
  END IF;

  IF private.has_platform_permission(auth.uid(), 'tickets.reply') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF OLD.status <> 'closed' THEN
    RAISE EXCEPTION 'TICKET_NOT_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.rated_at IS NOT NULL THEN
    RAISE EXCEPTION 'TICKET_ALREADY_RATED' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.rating IS NULL OR NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'INVALID_RATING' USING ERRCODE = 'P0001';
  END IF;

  NEW.id := OLD.id;
  NEW.reference := OLD.reference;
  NEW.user_id := OLD.user_id;
  NEW.organization_id := OLD.organization_id;
  NEW.subject := OLD.subject;
  NEW.category := OLD.category;
  NEW.priority := OLD.priority;
  NEW.status := OLD.status;
  NEW.description := OLD.description;
  NEW.assigned_to := OLD.assigned_to;
  NEW.last_reply_at := OLD.last_reply_at;
  NEW.closed_at := OLD.closed_at;
  NEW.created_at := OLD.created_at;
  NEW.rating_comment := nullif(left(btrim(coalesce(NEW.rating_comment, '')), 1000), '');
  NEW.rated_at := now();
  NEW.rated_staff_id := OLD.assigned_to;
  NEW.rated_staff_name := (SELECT ps.full_name FROM public.platform_staff ps WHERE ps.user_id = OLD.assigned_to);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_tickets_guard_ins ON public.support_tickets;
CREATE TRIGGER support_tickets_guard_ins
BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_guard();

DROP TRIGGER IF EXISTS support_tickets_guard_upd ON public.support_tickets;
CREATE TRIGGER support_tickets_guard_upd
BEFORE UPDATE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_guard();

DROP POLICY IF EXISTS "ticket owner rates closed ticket" ON public.support_tickets;
CREATE POLICY "ticket owner rates closed ticket"
ON public.support_tickets FOR UPDATE TO authenticated
USING (user_id = auth.uid() AND status = 'closed' AND rated_at IS NULL)
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.support_ticket_messages_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_status ticket_status;
BEGIN
  SELECT status INTO v_status FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF v_status IS NULL THEN
    RAISE EXCEPTION 'TICKET_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.is_staff = false AND v_status = 'closed' THEN
    RAISE EXCEPTION 'TICKET_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  NEW.body := btrim(NEW.body);
  NEW.created_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_messages_guard_ins ON public.support_ticket_messages;
CREATE TRIGGER support_ticket_messages_guard_ins
BEFORE INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.support_ticket_messages_guard();

CREATE OR REPLACE FUNCTION public.support_ticket_messages_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ticket public.support_tickets; v_org uuid;
BEGIN
  SELECT * INTO v_ticket FROM public.support_tickets WHERE id = NEW.ticket_id;
  IF v_ticket.id IS NULL THEN RETURN NEW; END IF;

  UPDATE public.support_tickets
     SET last_reply_at = NEW.created_at,
         status = CASE WHEN NEW.is_staff THEN status
                       WHEN status = 'closed' THEN status
                       ELSE 'new'::ticket_status END,
         updated_at = now()
   WHERE id = NEW.ticket_id;

  IF NEW.is_staff THEN
    v_org := coalesce(v_ticket.organization_id, (
      SELECT m.organization_id FROM public.organization_members m
      WHERE m.user_id = v_ticket.user_id AND m.status = 'active'
      ORDER BY m.created_at LIMIT 1));
    IF v_org IS NOT NULL THEN
      INSERT INTO public.notifications (organization_id, user_id, type, title, message)
      VALUES (v_org, v_ticket.user_id, 'support_reply',
              'رد جديد على تذكرة الدعم ' || v_ticket.reference,
              left(NEW.body, 300));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_ticket_messages_after_ins ON public.support_ticket_messages;
CREATE TRIGGER support_ticket_messages_after_ins
AFTER INSERT ON public.support_ticket_messages
FOR EACH ROW EXECUTE FUNCTION public.support_ticket_messages_after_insert();

REVOKE ALL ON FUNCTION public.support_tickets_guard() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.support_ticket_messages_guard() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.support_ticket_messages_after_insert() FROM anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'support_ticket_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.support_ticket_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;
-- ============================================================
-- 20260802151958_ccb8f093-74d5-4e3b-9de4-4664291bf50c.sql
-- ============================================================
CREATE TABLE IF NOT EXISTS public.system_failures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL UNIQUE,
  surface text NOT NULL,
  action text NOT NULL,
  error_code text,
  error_message text NOT NULL,
  http_status integer,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  document_id uuid,
  ticket_id uuid,
  path text,
  ip text,
  browser text,
  os text,
  device text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  search_vector tsvector GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(ref, '') || ' ' ||
      coalesce(surface, '') || ' ' ||
      coalesce(action, '') || ' ' ||
      coalesce(error_code, '') || ' ' ||
      public.normalize_ar(coalesce(error_message, ''))
    )
  ) STORED
);

CREATE INDEX IF NOT EXISTS system_failures_created_idx ON public.system_failures (created_at DESC);
CREATE INDEX IF NOT EXISTS system_failures_surface_idx ON public.system_failures (surface, created_at DESC);
CREATE INDEX IF NOT EXISTS system_failures_search_idx ON public.system_failures USING gin (search_vector);

GRANT SELECT ON public.system_failures TO authenticated;
GRANT ALL ON public.system_failures TO service_role;

ALTER TABLE public.system_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "platform staff read failures" ON public.system_failures;
CREATE POLICY "platform staff read failures"
ON public.system_failures FOR SELECT TO authenticated
USING (private.has_platform_permission(auth.uid(), 'monitoring.read'));
-- ============================================================
-- 20260802160846_0a85c20f-567a-41e6-a149-f5a40de00b48.sql
-- ============================================================
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS file_status text NOT NULL DEFAULT 'UNCHECKED',
  ADD COLUMN IF NOT EXISTS storage_verified_at timestamp with time zone;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_file_status_check;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_file_status_check
  CHECK (file_status IN ('UNCHECKED', 'AVAILABLE', 'FILE_MISSING', 'INVALID_FILE'));

CREATE INDEX IF NOT EXISTS documents_file_status_idx
  ON public.documents (organization_id, file_status, created_at DESC);
-- ============================================================
-- 20260802161948_84e030f9-c1ab-4963-8449-4dd33dfc04ff.sql
-- ============================================================
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
-- ============================================================
-- 20260802163738_26e6495d-bb09-44d4-b07c-ae202c53241e.sql
-- ============================================================
-- 1) سجل كشف البيانات الحساسة: نتيجة العملية ومعرّف التتبع وبيئة الطلب
ALTER TABLE public.pii_access_logs
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS trace_ref text,
  ADD COLUMN IF NOT EXISTS aal text,
  ADD COLUMN IF NOT EXISTS device text,
  ADD COLUMN IF NOT EXISTS browser text;

ALTER TABLE public.pii_access_logs DROP CONSTRAINT IF EXISTS pii_access_logs_outcome_check;
ALTER TABLE public.pii_access_logs
  ADD CONSTRAINT pii_access_logs_outcome_check
  CHECK (outcome IN ('success', 'denied', 'rate_limited', 'mfa_required'));

CREATE INDEX IF NOT EXISTS pii_access_logs_actor_recent_idx
  ON public.pii_access_logs (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.pii_access_logs_enforce_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE ua text;
BEGIN
  NEW.user_id := auth.uid();
  NEW.created_at := now();
  ua := left(coalesce(NEW.user_agent, ''), 300);
  NEW.user_agent := ua;
  NEW.ip := left(coalesce(NEW.ip, ''), 60);
  NEW.trace_ref := left(coalesce(NEW.trace_ref, ''), 40);
  NEW.aal := left(coalesce(NEW.aal, ''), 10);
  NEW.device := CASE
    WHEN ua ~* 'ipad|tablet' THEN 'تابلت'
    WHEN ua ~* 'mobile|iphone|android' THEN 'جوال'
    WHEN ua = '' THEN NULL
    ELSE 'حاسب' END;
  NEW.browser := CASE
    WHEN ua ~* 'edg/' THEN 'Edge'
    WHEN ua ~* 'chrome|crios' THEN 'Chrome'
    WHEN ua ~* 'firefox|fxios' THEN 'Firefox'
    WHEN ua ~* 'safari' THEN 'Safari'
    WHEN ua = '' THEN NULL
    ELSE 'أخرى' END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pii_access_logs_enforce_actor ON public.pii_access_logs;
CREATE TRIGGER pii_access_logs_enforce_actor
  BEFORE INSERT ON public.pii_access_logs
  FOR EACH ROW EXECUTE FUNCTION public.pii_access_logs_enforce_actor();

-- 2) سجل وصول المستندات: تسجيل المحاولات المرفوضة أيضاً
ALTER TABLE public.document_access_logs
  ADD COLUMN IF NOT EXISTS outcome text NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS denial_reason text,
  ADD COLUMN IF NOT EXISTS trace_ref text;

ALTER TABLE public.document_access_logs DROP CONSTRAINT IF EXISTS document_access_logs_outcome_check;
ALTER TABLE public.document_access_logs
  ADD CONSTRAINT document_access_logs_outcome_check
  CHECK (outcome IN ('success', 'denied'));

-- 3) متابعة إعادة التشفير التدريجية عند تدوير المفاتيح
CREATE TABLE IF NOT EXISTS public.pii_reencryption_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_version smallint NOT NULL,
  to_version smallint NOT NULL,
  entity text NOT NULL CHECK (entity IN ('clients', 'case_parties')),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'paused', 'completed', 'failed')),
  processed integer NOT NULL DEFAULT 0,
  failed integer NOT NULL DEFAULT 0,
  cursor_id uuid,
  last_error text,
  started_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.pii_reencryption_jobs TO authenticated;
GRANT ALL ON public.pii_reencryption_jobs TO service_role;
GRANT ALL ON public.encryption_key_registry TO service_role;
ALTER TABLE public.pii_reencryption_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reencryption_jobs_staff_read ON public.pii_reencryption_jobs;
CREATE POLICY reencryption_jobs_staff_read ON public.pii_reencryption_jobs
  FOR SELECT TO authenticated
  USING (private.has_platform_permission(auth.uid(), 'settings.manage'));

DROP TRIGGER IF EXISTS pii_reencryption_jobs_updated_at ON public.pii_reencryption_jobs;
CREATE TRIGGER pii_reencryption_jobs_updated_at
  BEFORE UPDATE ON public.pii_reencryption_jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) حماية المفاتيح: لا يُقاعد إصدار ما لم تُنقل كل البيانات المرتبطة به
CREATE OR REPLACE FUNCTION public.encryption_key_registry_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE remaining bigint;
BEGIN
  IF NEW.status = 'retired' AND coalesce(OLD.status, '') <> 'retired' THEN
    SELECT (SELECT count(*) FROM public.clients WHERE pii_key_version = NEW.key_version)
         + (SELECT count(*) FROM public.case_parties WHERE pii_key_version = NEW.key_version)
      INTO remaining;
    IF remaining > 0 THEN
      RAISE EXCEPTION 'KEY_VERSION_STILL_IN_USE:%', remaining USING ERRCODE = 'P0001';
    END IF;
    NEW.retired_at := now();
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS encryption_key_registry_guard ON public.encryption_key_registry;
CREATE TRIGGER encryption_key_registry_guard
  BEFORE UPDATE ON public.encryption_key_registry
  FOR EACH ROW EXECUTE FUNCTION public.encryption_key_registry_guard();
-- ============================================================
-- 20260802171037_557cea93-113e-4991-a238-93a68d15208d.sql
-- ============================================================
-- هذه الدوال Triggers داخلية فقط: تنفيذها يتم بواسطة قاعدة البيانات نفسها
-- ولا يعتمد على صلاحية EXECUTE، لذا سحب الصلاحية العامة لا يعطّل أي وظيفة.
REVOKE ALL ON FUNCTION public.support_tickets_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_ticket_messages_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.support_ticket_messages_after_insert() FROM PUBLIC, anon, authenticated;
-- ============================================================
-- 20260802184742_fa6ae1f6-cd9e-4a24-8907-9e5147cd30fb.sql
-- ============================================================
-- 1) حالات مستقلة: توثيق الجوال منفصل تماماً عن التحقق بخطوتين
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verification_status text NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS mfa_status text NOT NULL DEFAULT 'disabled';

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_verification_status_chk
  CHECK (phone_verification_status IN ('not_required','pending','verified','failed','disabled'));

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_mfa_status_chk
  CHECK (mfa_status IN ('disabled','sms_enabled','totp_enabled','both_enabled'));

-- 2) إعدادات الرسائل والتحقق (صف واحد)
CREATE TABLE public.sms_settings (
  id boolean PRIMARY KEY DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  active_provider text NOT NULL DEFAULT 'infobip',
  provider_label text,
  base_url text,
  application_id text,
  service_sid text,
  sender_id text,
  sender_name text,
  default_country text NOT NULL DEFAULT 'SA',
  default_dial_code text NOT NULL DEFAULT '+966',
  code_length smallint NOT NULL DEFAULT 6,
  code_ttl_minutes smallint NOT NULL DEFAULT 5,
  resend_wait_seconds smallint NOT NULL DEFAULT 60,
  max_verify_attempts smallint NOT NULL DEFAULT 5,
  rate_limit_per_hour smallint NOT NULL DEFAULT 5,
  message_template text NOT NULL DEFAULT 'رمز التحقق في مِهلة: {{code}} — صالح {{minutes}} دقائق. لا تشاركه مع أحد.',
  message_language text NOT NULL DEFAULT 'ar',
  test_mode boolean NOT NULL DEFAULT true,
  signup_mode text NOT NULL DEFAULT 'disabled',
  show_phone_field boolean NOT NULL DEFAULT true,
  require_phone boolean NOT NULL DEFAULT false,
  hide_phone_when_disabled boolean NOT NULL DEFAULT true,
  allow_signup_during_outage boolean NOT NULL DEFAULT true,
  show_outage_notice boolean NOT NULL DEFAULT false,
  emergency_email_only boolean NOT NULL DEFAULT false,
  alert_admin_on_failure boolean NOT NULL DEFAULT true,
  api_key_hint text,
  api_secret_hint text,
  health_status text NOT NULL DEFAULT 'disabled',
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error_reason text,
  last_trace_ref text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_settings_singleton CHECK (id),
  CONSTRAINT sms_settings_provider_chk CHECK (active_provider IN ('infobip','twilio','unifonic','custom')),
  CONSTRAINT sms_settings_mode_chk CHECK (signup_mode IN ('disabled','optional','required_unverified_allowed','required_verified','outage_bypass')),
  CONSTRAINT sms_settings_health_chk CHECK (health_status IN ('operational','degraded','unavailable','disabled')),
  CONSTRAINT sms_settings_code_len_chk CHECK (code_length BETWEEN 4 AND 8),
  CONSTRAINT sms_settings_ttl_chk CHECK (code_ttl_minutes BETWEEN 1 AND 30)
);

GRANT SELECT ON public.sms_settings TO authenticated;
GRANT ALL ON public.sms_settings TO service_role;
ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform settings managers read sms settings"
ON public.sms_settings FOR SELECT TO authenticated
USING (private.has_platform_permission(auth.uid(), 'settings.manage'));

CREATE TRIGGER sms_settings_set_updated_at
BEFORE UPDATE ON public.sms_settings
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.sms_settings (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 3) رموز التحقق: بصمة مشفّرة فقط، تُدار من الخادم حصراً
CREATE TABLE public.otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose text NOT NULL,
  phone_e164 text NOT NULL,
  code_hash text NOT NULL,
  user_id uuid,
  email text,
  attempts smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 5,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  provider text,
  provider_reference text,
  delivery_status text NOT NULL DEFAULT 'queued',
  ip text,
  device text,
  user_agent text,
  trace_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT otp_purpose_chk CHECK (purpose IN ('signup','phone_verification','login_mfa','phone_change')),
  CONSTRAINT otp_delivery_chk CHECK (delivery_status IN ('queued','sent','delivered','failed','test'))
);

CREATE INDEX otp_verifications_phone_idx ON public.otp_verifications (phone_e164, purpose, created_at DESC);
CREATE INDEX otp_verifications_active_idx ON public.otp_verifications (expires_at) WHERE consumed_at IS NULL;

GRANT ALL ON public.otp_verifications TO service_role;
ALTER TABLE public.otp_verifications ENABLE ROW LEVEL SECURITY;

-- 4) سجل إرسال الرسائل وصحة المزوّد
CREATE TABLE public.sms_delivery_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  purpose text NOT NULL,
  action text NOT NULL,
  phone_masked text NOT NULL,
  outcome text NOT NULL,
  error_code text,
  error_message text,
  latency_ms integer,
  reference_id text,
  trace_ref text,
  ip text,
  device text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sms_logs_action_chk CHECK (action IN ('send','resend','verify','test')),
  CONSTRAINT sms_logs_outcome_chk CHECK (outcome IN ('success','failure','rate_limited','invalid_code','expired'))
);

CREATE INDEX sms_delivery_logs_created_idx ON public.sms_delivery_logs (created_at DESC);

GRANT SELECT ON public.sms_delivery_logs TO authenticated;
GRANT ALL ON public.sms_delivery_logs TO service_role;
ALTER TABLE public.sms_delivery_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform settings managers read sms logs"
ON public.sms_delivery_logs FOR SELECT TO authenticated
USING (private.has_platform_permission(auth.uid(), 'settings.manage'));
-- ============================================================
-- 20260802190049_cef802a4-b346-4c56-bbec-044aac035eae.sql
-- ============================================================
-- ============ 1) قوالب المزوّدين ============
CREATE TABLE public.integration_definitions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  display_name_ar text NOT NULL,
  category text NOT NULL DEFAULT 'otp',
  category_label text NOT NULL DEFAULT 'خدمة التحقق عبر SMS',
  adapter_type text NOT NULL,
  logo_path text,
  website_url text,
  default_base_url text,
  supported_auth_types text[] NOT NULL DEFAULT '{}',
  required_fields text[] NOT NULL DEFAULT '{}',
  optional_fields text[] NOT NULL DEFAULT '{}',
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_hint text,
  is_builtin boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.integration_definitions TO authenticated;
GRANT ALL ON public.integration_definitions TO service_role;
ALTER TABLE public.integration_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integration_definitions_staff_read" ON public.integration_definitions
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps WHERE ps.user_id = auth.uid() AND ps.status = 'active'));

CREATE TRIGGER integration_definitions_updated_at
  BEFORE UPDATE ON public.integration_definitions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 2) التكاملات المهيأة ============
CREATE TABLE public.platform_integrations (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  definition_id uuid NOT NULL REFERENCES public.integration_definitions(id) ON DELETE RESTRICT,
  provider_key text NOT NULL,
  internal_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  website_url text,
  logo_path text,
  logo_source text NOT NULL DEFAULT 'builtin',
  environment text NOT NULL DEFAULT 'sandbox',
  base_url text NOT NULL,
  auth_type text NOT NULL,
  secret_reference text NOT NULL,
  configuration_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  health_check_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  mapping_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  timeout_ms integer NOT NULL DEFAULT 10000,
  max_retries integer NOT NULL DEFAULT 1,
  monitor_interval_minutes integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'not_configured',
  is_enabled boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT false,
  consecutive_failures integer NOT NULL DEFAULT 0,
  verified_at timestamptz,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_checked_at timestamptz,
  latency_ms integer,
  last_error_code text,
  last_error_detail text,
  last_trace_id text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT platform_integrations_environment_check CHECK (environment IN ('sandbox','production')),
  CONSTRAINT platform_integrations_status_check CHECK (status IN ('not_configured','verifying','connected','degraded','unavailable','failed','disabled')),
  CONSTRAINT platform_integrations_timeout_check CHECK (timeout_ms BETWEEN 1000 AND 30000),
  CONSTRAINT platform_integrations_retries_check CHECK (max_retries BETWEEN 0 AND 5)
);

CREATE INDEX platform_integrations_active_idx ON public.platform_integrations (provider_key, is_active) WHERE is_active;
CREATE UNIQUE INDEX platform_integrations_single_active_otp_idx
  ON public.platform_integrations ((configuration_json->>'category'))
  WHERE is_active;

GRANT SELECT ON public.platform_integrations TO authenticated;
GRANT ALL ON public.platform_integrations TO service_role;
ALTER TABLE public.platform_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_integrations_staff_read" ON public.platform_integrations
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps WHERE ps.user_id = auth.uid() AND ps.status = 'active'));

CREATE TRIGGER platform_integrations_updated_at
  BEFORE UPDATE ON public.platform_integrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 3) خزنة الأسرار ============
CREATE TABLE public.integration_secrets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  secret_reference text NOT NULL,
  field_key text NOT NULL,
  ciphertext text NOT NULL,
  key_version smallint NOT NULL DEFAULT 1,
  masked_hint text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  rotated_at timestamptz,
  revoked_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_secrets_status_check CHECK (status IN ('active','revoked')),
  CONSTRAINT integration_secrets_unique UNIQUE (secret_reference, field_key)
);

GRANT ALL ON public.integration_secrets TO service_role;
ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;
-- لا سياسة SELECT: المتصفح لا يستطيع قراءة أي سر إطلاقاً.

CREATE TRIGGER integration_secrets_updated_at
  BEFORE UPDATE ON public.integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 4) سجل الفحوصات ============
CREATE TABLE public.integration_health_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id uuid REFERENCES public.platform_integrations(id) ON DELETE SET NULL,
  provider_key text NOT NULL,
  internal_name text,
  result text NOT NULL,
  check_kind text NOT NULL DEFAULT 'manual',
  status_code integer,
  latency_ms integer,
  safe_error_code text,
  safe_error_detail text,
  trace_id text NOT NULL,
  actor_id uuid,
  checked_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integration_health_logs_result_check CHECK (result IN ('success','failure','blocked','skipped'))
);

CREATE INDEX integration_health_logs_integration_idx
  ON public.integration_health_logs (integration_id, checked_at DESC);

GRANT SELECT ON public.integration_health_logs TO authenticated;
GRANT ALL ON public.integration_health_logs TO service_role;
ALTER TABLE public.integration_health_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integration_health_logs_staff_read" ON public.integration_health_logs
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_staff ps WHERE ps.user_id = auth.uid() AND ps.status = 'active'));

-- ============ 5) قوالب المزوّدين الجاهزة ============
INSERT INTO public.integration_definitions
  (provider_key, display_name, display_name_ar, category, category_label, adapter_type, logo_path, website_url,
   default_base_url, supported_auth_types, required_fields, optional_fields, capabilities, health_hint, is_builtin, sort_order)
VALUES
  ('infobip', 'Infobip', 'إنفوبيب', 'otp', 'خدمة التحقق عبر SMS', 'infobip', 'infobip', 'https://www.infobip.com',
   'https://api.infobip.com', ARRAY['api_key_header'], ARRAY['api_key'], ARRAY['sender_id','base_url'],
   '{"send_otp":true,"verify_otp":true,"delivery_status":true,"health_check":true}'::jsonb,
   'GET /account/1/balance — يتحقق من صحة المفتاح ورصيد الحساب.', true, 10),
  ('twilio', 'Twilio Verify', 'تويليو', 'otp', 'خدمة التحقق عبر SMS', 'twilio', 'twilio', 'https://www.twilio.com',
   'https://api.twilio.com', ARRAY['basic_auth'], ARRAY['account_sid','api_secret'], ARRAY['service_sid','sender_id','base_url'],
   '{"send_otp":true,"verify_otp":true,"delivery_status":true,"health_check":true}'::jsonb,
   'GET /2010-04-01/Accounts/{AccountSid}.json — يتحقق من المعرّف والمفتاح وحالة الحساب.', true, 20),
  ('unifonic', 'Unifonic', 'يونيفونك', 'otp', 'خدمة التحقق عبر SMS', 'unifonic', 'unifonic', 'https://www.unifonic.com',
   'https://el.cloud.unifonic.com', ARRAY['query_api_key'], ARRAY['application_id'], ARRAY['sender_id','base_url'],
   '{"send_otp":true,"verify_otp":true,"delivery_status":true,"health_check":true}'::jsonb,
   'GET /rest/Account/GetAppDefaultSenderID — يتحقق من AppSid والمُرسل المعتمد.', true, 30),
  ('custom_rest', 'Custom REST API', 'مزوّد REST مخصص', 'otp', 'خدمة تحقق مخصصة', 'custom_rest', NULL, NULL,
   NULL, ARRAY['api_key_header','bearer_token','basic_auth','oauth2_client_credentials','query_api_key','custom_headers'],
   ARRAY[]::text[], ARRAY['api_key','api_secret','access_token','client_id','client_secret','username','password','sender_id'],
   '{"send_otp":true,"verify_otp":true,"delivery_status":true,"health_check":true,"configurable":true}'::jsonb,
   'يحدده المالك بالكامل: الطريقة والمسار وشروط النجاح.', true, 90);
-- ============================================================
-- 20260802191712_14bdc8fe-e88c-447e-bb1a-b443aa6e5c6a.sql
-- ============================================================
-- سمات التصميم
CREATE TABLE public.design_themes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  is_active boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.design_themes TO service_role;
ALTER TABLE public.design_themes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.design_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid NOT NULL REFERENCES public.design_themes(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  scope text NOT NULL DEFAULT 'global',
  page_key text NOT NULL DEFAULT 'global',
  design_tokens_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  page_tokens_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_css text NOT NULL DEFAULT '',
  sanitized_css text NOT NULL DEFAULT '',
  page_css_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'draft',
  change_summary text,
  published_at timestamptz,
  published_by uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (theme_id, version_number)
);
GRANT ALL ON public.design_versions TO service_role;
ALTER TABLE public.design_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.design_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid NOT NULL REFERENCES public.design_themes(id) ON DELETE CASCADE,
  page_key text NOT NULL DEFAULT 'global',
  design_tokens_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  custom_css text NOT NULL DEFAULT '',
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  revision_number integer NOT NULL DEFAULT 1,
  UNIQUE (theme_id, page_key)
);
GRANT ALL ON public.design_drafts TO service_role;
ALTER TABLE public.design_drafts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.design_publish_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid REFERENCES public.design_themes(id) ON DELETE SET NULL,
  active_version_id uuid REFERENCES public.design_versions(id) ON DELETE SET NULL,
  previous_version_id uuid REFERENCES public.design_versions(id) ON DELETE SET NULL,
  rollback_available boolean NOT NULL DEFAULT false,
  rollback_used_at timestamptz,
  rollback_used_by uuid,
  cache_version integer NOT NULL DEFAULT 1,
  last_published_at timestamptz,
  last_published_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  singleton boolean NOT NULL DEFAULT true,
  UNIQUE (singleton)
);
GRANT ALL ON public.design_publish_state TO service_role;
ALTER TABLE public.design_publish_state ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.design_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  page_key text,
  version_id uuid,
  before_summary jsonb,
  after_summary jsonb,
  ip_address text,
  user_agent text,
  trace_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.design_audit_logs TO service_role;
ALTER TABLE public.design_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE INDEX design_versions_theme_idx ON public.design_versions (theme_id, version_number DESC);
CREATE INDEX design_audit_logs_created_idx ON public.design_audit_logs (created_at DESC);

CREATE TRIGGER design_themes_updated_at BEFORE UPDATE ON public.design_themes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER design_publish_state_updated_at BEFORE UPDATE ON public.design_publish_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.design_themes (name, status, is_active) VALUES ('تصميم مِهلة الافتراضي', 'active', true);
INSERT INTO public.design_publish_state (theme_id, singleton)
  SELECT id, true FROM public.design_themes LIMIT 1;
-- ============================================================
-- 20260802193402_95ceca21-906b-4239-8c17-e8ec536e0ce8.sql
-- ============================================================
ALTER TABLE public.otp_verifications
  ADD COLUMN IF NOT EXISTS integration_id uuid REFERENCES public.platform_integrations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dispatch_source text,
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS remote_verification boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS dispatch_trace text;

ALTER TABLE public.otp_verifications DROP CONSTRAINT IF EXISTS otp_delivery_chk;
ALTER TABLE public.otp_verifications ADD CONSTRAINT otp_delivery_chk
  CHECK (delivery_status = ANY (ARRAY['queued','sending','sent','delivered','failed','test']));

ALTER TABLE public.otp_verifications DROP CONSTRAINT IF EXISTS otp_dispatch_source_chk;
ALTER TABLE public.otp_verifications ADD CONSTRAINT otp_dispatch_source_chk
  CHECK (dispatch_source IS NULL OR dispatch_source = ANY (ARRAY['integration','legacy','test_mode']));

-- رمز واحد نشط فقط لكل رقم وغرض: يمنع إرسال رمزين من مزودين مختلفين لنفس الطلب.
CREATE UNIQUE INDEX IF NOT EXISTS otp_verifications_single_active_idx
  ON public.otp_verifications (phone_e164, purpose)
  WHERE consumed_at IS NULL;

-- منع تكرار الإرسال عند الضغط المتكرر على الزر.
CREATE UNIQUE INDEX IF NOT EXISTS otp_verifications_idempotency_idx
  ON public.otp_verifications (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS otp_verifications_integration_idx
  ON public.otp_verifications (integration_id, created_at DESC);
-- ============================================================
-- 20260804131610_d036c164-ee9a-4b04-b953-ae884d957289.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_platform_metrics(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_revenue boolean;
  v_mrr numeric := 0;
  v_active_orgs integer := 0;
  v_active_start integer := 0;
  v_lost integer := 0;
  v_trials integer := 0;
  v_converted integer := 0;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL OR NOT private.is_platform_staff(v_uid) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = 'P0001';
  END IF;

  v_revenue := private.has_platform_permission(v_uid, 'revenue.read');

  SELECT count(DISTINCT s.organization_id)
    INTO v_active_orgs
  FROM public.subscriptions s
  WHERE s.status = 'active' AND s.ends_at > now() AND s.organization_id IS NOT NULL;

  SELECT coalesce(sum(
           CASE
             WHEN s.starts_at IS NULL OR s.ends_at IS NULL THEN 0
             WHEN extract(epoch FROM (s.ends_at - s.starts_at)) <= 0 THEN 0
             ELSE s.amount * (2629800.0 / extract(epoch FROM (s.ends_at - s.starts_at)))
           END), 0)
    INTO v_mrr
  FROM public.subscriptions s
  WHERE s.status = 'active' AND s.ends_at > now();

  SELECT count(*) INTO v_active_start
  FROM public.subscriptions s
  WHERE s.starts_at < _from AND s.ends_at > _from AND s.status <> 'cancelled';

  SELECT count(*) INTO v_lost
  FROM public.subscriptions s
  WHERE (s.cancelled_at BETWEEN _from AND _to)
     OR (s.status = 'expired' AND s.ends_at BETWEEN _from AND _to);

  SELECT count(*) INTO v_trials
  FROM public.subscriptions s
  WHERE s.created_at BETWEEN _from AND _to AND s.status = 'trial';

  SELECT count(*) INTO v_converted
  FROM public.subscriptions s
  WHERE s.created_at BETWEEN _from AND _to
    AND s.status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.subscriptions t
      WHERE t.organization_id = s.organization_id AND t.status = 'trial' AND t.created_at <= s.created_at
    );

  v_result := jsonb_build_object(
    'range', jsonb_build_object('from', _from, 'to', _to),
    'generated_at', now(),
    'organizations', jsonb_build_object(
      'total', (SELECT count(*) FROM public.organizations),
      'active', (SELECT count(*) FROM public.organizations WHERE is_active),
      'suspended', (SELECT count(*) FROM public.organizations WHERE NOT is_active),
      'trial', (SELECT count(DISTINCT organization_id) FROM public.subscriptions
                WHERE status = 'trial' AND ends_at > now() AND organization_id IS NOT NULL),
      'no_subscription', (SELECT count(*) FROM public.organizations o WHERE NOT EXISTS (
          SELECT 1 FROM public.subscriptions s WHERE s.organization_id = o.id AND s.status = 'active' AND s.ends_at > now())),
      'new_in_range', (SELECT count(*) FROM public.organizations WHERE created_at BETWEEN _from AND _to)
    ),
    'users', jsonb_build_object(
      'total', (SELECT count(*) FROM public.profiles),
      'active', (SELECT count(*) FROM public.profiles WHERE is_active),
      'suspended', (SELECT count(*) FROM public.profiles WHERE NOT is_active),
      'new_in_range', (SELECT count(*) FROM public.profiles WHERE created_at BETWEEN _from AND _to),
      'phone_verified', (SELECT count(*) FROM public.profiles WHERE phone_verification_status = 'verified'),
      'mfa_enabled', (SELECT count(*) FROM public.profiles WHERE coalesce(mfa_status, 'disabled') <> 'disabled'),
      'without_org', (SELECT count(*) FROM public.profiles p WHERE NOT EXISTS (
          SELECT 1 FROM public.organization_members m WHERE m.user_id = p.id AND m.status = 'active'))
    ),
    'subscriptions', jsonb_build_object(
      'total', (SELECT count(*) FROM public.subscriptions),
      'active', (SELECT count(*) FROM public.subscriptions WHERE status = 'active' AND ends_at > now()),
      'trial', (SELECT count(*) FROM public.subscriptions WHERE status = 'trial' AND ends_at > now()),
      'expiring_14d', (SELECT count(*) FROM public.subscriptions
                       WHERE status = 'active' AND ends_at > now() AND ends_at <= now() + interval '14 days'),
      'expired', (SELECT count(*) FROM public.subscriptions WHERE ends_at <= now() AND status <> 'cancelled'),
      'cancelled', (SELECT count(*) FROM public.subscriptions WHERE status = 'cancelled'),
      'suspended', (SELECT count(*) FROM public.subscriptions WHERE suspended_at IS NOT NULL),
      'auto_renew', (SELECT count(*) FROM public.subscriptions WHERE auto_renew AND status = 'active'),
      'new_in_range', (SELECT count(*) FROM public.subscriptions WHERE created_at BETWEEN _from AND _to)
    ),
    'usage', jsonb_build_object(
      'cases', (SELECT count(*) FROM public.cases),
      'cases_in_range', (SELECT count(*) FROM public.cases WHERE created_at BETWEEN _from AND _to),
      'clients', (SELECT count(*) FROM public.clients),
      'documents', (SELECT count(*) FROM public.documents),
      'documents_in_range', (SELECT count(*) FROM public.documents WHERE created_at BETWEEN _from AND _to),
      'storage_bytes', (SELECT coalesce(sum(file_size), 0) FROM public.documents),
      'ocr_pages_in_range', (SELECT coalesce(sum(used), 0) FROM public.usage_counters
                             WHERE metric = 'ocr_pages' AND period_start >= _from::date AND period_start <= _to::date),
      'hearings_in_range', (SELECT count(*) FROM public.hearings WHERE created_at BETWEEN _from AND _to)
    ),
    'messaging', jsonb_build_object(
      'sms_sent_in_range', (SELECT count(*) FROM public.sms_delivery_logs
                            WHERE created_at BETWEEN _from AND _to AND outcome = 'sent'),
      'sms_failed_in_range', (SELECT count(*) FROM public.sms_delivery_logs
                              WHERE created_at BETWEEN _from AND _to AND outcome <> 'sent'),
      'notifications_in_range', (SELECT count(*) FROM public.notifications WHERE created_at BETWEEN _from AND _to),
      'broadcasts_in_range', (SELECT count(*) FROM public.platform_broadcasts WHERE created_at BETWEEN _from AND _to)
    ),
    'support', jsonb_build_object(
      'open', (SELECT count(*) FROM public.support_tickets WHERE status <> 'closed'),
      'closed', (SELECT count(*) FROM public.support_tickets WHERE status = 'closed'),
      'new_in_range', (SELECT count(*) FROM public.support_tickets WHERE created_at BETWEEN _from AND _to),
      'unassigned', (SELECT count(*) FROM public.support_tickets WHERE assigned_to IS NULL AND status <> 'closed'),
      'avg_first_reply_hours', (SELECT coalesce(round(avg(extract(epoch FROM (last_reply_at - created_at)) / 3600)::numeric, 1), 0)
                                FROM public.support_tickets WHERE last_reply_at IS NOT NULL AND created_at BETWEEN _from AND _to)
    ),
    'reliability', jsonb_build_object(
      'failures_in_range', (SELECT count(*) FROM public.system_failures WHERE created_at BETWEEN _from AND _to),
      'failures_by_surface', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
          SELECT surface AS label, count(*) AS count FROM public.system_failures
          WHERE created_at BETWEEN _from AND _to GROUP BY 1 ORDER BY 2 DESC LIMIT 8) x),
      'auth_failures_in_range', (SELECT count(*) FROM public.system_failures
                                 WHERE created_at BETWEEN _from AND _to AND surface = 'auth'),
      'audit_events_in_range', (SELECT count(*) FROM public.admin_audit_logs WHERE created_at BETWEEN _from AND _to)
    ),
    'revenue', CASE WHEN NOT v_revenue THEN NULL ELSE jsonb_build_object(
      'in_range', (SELECT coalesce(sum(amount), 0) FROM public.subscriptions
                   WHERE created_at BETWEEN _from AND _to AND status <> 'cancelled'),
      'today', (SELECT coalesce(sum(amount), 0) FROM public.subscriptions
                WHERE created_at >= date_trunc('day', now()) AND status <> 'cancelled'),
      'month', (SELECT coalesce(sum(amount), 0) FROM public.subscriptions
                WHERE created_at >= date_trunc('month', now()) AND status <> 'cancelled'),
      'year', (SELECT coalesce(sum(amount), 0) FROM public.subscriptions
               WHERE created_at >= date_trunc('year', now()) AND status <> 'cancelled'),
      'total', (SELECT coalesce(sum(amount), 0) FROM public.subscriptions WHERE status <> 'cancelled'),
      'mrr', round(v_mrr, 2),
      'arr', round(v_mrr * 12, 2),
      'arpu', CASE WHEN v_active_orgs = 0 THEN 0 ELSE round(v_mrr / v_active_orgs, 2) END,
      'paying_organizations', v_active_orgs,
      'churn_rate', CASE WHEN v_active_start = 0 THEN 0 ELSE round((v_lost::numeric / v_active_start) * 100, 2) END,
      'churned_in_range', v_lost,
      'trials_in_range', v_trials,
      'trial_conversion_rate', CASE WHEN (v_trials + v_converted) = 0 THEN 0
                                    ELSE round((v_converted::numeric / (v_trials + v_converted)) * 100, 2) END,
      'invoices', jsonb_build_object(
        'total', (SELECT count(*) FROM public.invoices),
        'in_range', (SELECT count(*) FROM public.invoices WHERE issued_at BETWEEN _from AND _to),
        'paid', (SELECT count(*) FROM public.invoices WHERE status = 'paid'),
        'pending', (SELECT count(*) FROM public.invoices WHERE status = 'pending'),
        'overdue', (SELECT count(*) FROM public.invoices WHERE status = 'pending' AND issued_at < now() - interval '30 days'),
        'paid_amount', (SELECT coalesce(sum(amount), 0) FROM public.invoices WHERE status = 'paid'),
        'outstanding_amount', (SELECT coalesce(sum(amount), 0) FROM public.invoices WHERE status <> 'paid')
      ),
      'by_plan', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
          SELECT plan_label AS label, count(*) AS count, coalesce(sum(amount), 0) AS amount
          FROM public.subscriptions WHERE status <> 'cancelled' GROUP BY 1 ORDER BY 3 DESC LIMIT 10) x),
      'by_month', (SELECT coalesce(jsonb_agg(x ORDER BY x->>'month'), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('month', to_char(date_trunc('month', created_at), 'YYYY-MM'),
                                    'amount', coalesce(sum(amount), 0), 'count', count(*)) AS x
          FROM public.subscriptions
          WHERE status <> 'cancelled' AND created_at >= (date_trunc('month', now()) - interval '11 months')
          GROUP BY date_trunc('month', created_at)) y)
    ) END
  );

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_platform_metrics(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_platform_metrics(timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_metrics(timestamptz, timestamptz) TO service_role;
-- ============================================================
-- 20260804134112_e90f8c01-9383-48af-8d2e-f56142b166f7.sql
-- ============================================================
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
-- ============================================================
-- 20260804135349_9a6637a0-cb87-4928-a9a3-262b1ac8716f.sql
-- ============================================================
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
-- ============================================================
-- 20260804141254_00910f58-f0de-4bc3-b15a-f4cb4363a446.sql
-- ============================================================
-- تقييد استدعاء دالة المؤشرات الإدارية (SECURITY DEFINER) على المستخدمين المسجّلين فقط.
-- الدالة تتحقق داخلياً من كون المستدعي من فريق المنصة، والآن لم تصبح قابلة للاستدعاء
-- من الزوار غير المسجّلين (anon) عبر واجهة البيانات مطلقاً.
REVOKE ALL ON FUNCTION public.admin_platform_metrics(timestamp with time zone, timestamp with time zone) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_platform_metrics(timestamp with time zone, timestamp with time zone) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_platform_metrics(timestamp with time zone, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_platform_metrics(timestamp with time zone, timestamp with time zone) TO service_role;
-- ============================================================
-- 20260804152401_edbc116f-199f-413b-bad6-23a4eaaa5a81.sql
-- ============================================================
-- 1) قيود الفواتير
ALTER TABLE public.platform_invoices
  ADD CONSTRAINT platform_invoices_remaining_check CHECK (remaining >= 0),
  ADD CONSTRAINT platform_invoices_discount_le_subtotal_check CHECK (discount_total <= subtotal);

-- 2) قيود الدفعات
ALTER TABLE public.platform_payments
  ADD CONSTRAINT platform_payments_refunded_le_amount_check CHECK (refunded_amount <= amount);

-- 3) منع تكرار مرجع المزود (فهرس جزئي: يستثني المحاولات الفاشلة/الملغاة والقيم الفارغة)
CREATE UNIQUE INDEX IF NOT EXISTS platform_payments_provider_ref_uidx
  ON public.platform_payments (provider, provider_reference)
  WHERE provider_reference IS NOT NULL AND status NOT IN ('failed', 'cancelled');

-- 4) منع تجاوز مجموع الدفعات المعتمدة لإجمالي الفاتورة
CREATE OR REPLACE FUNCTION private.payment_amount_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_total numeric(14,2);
  v_sum numeric(14,2);
BEGIN
  IF NEW.status NOT IN ('paid', 'refunded', 'partially_refunded') THEN
    RETURN NEW;
  END IF;

  SELECT total INTO v_total FROM public.platform_invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_sum
  FROM public.platform_payments
  WHERE invoice_id = NEW.invoice_id
    AND id <> NEW.id
    AND status IN ('paid', 'refunded', 'partially_refunded');

  IF v_sum + NEW.amount > v_total + 0.005 THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_INVOICE_TOTAL' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_payments_amount_guard ON public.platform_payments;
CREATE TRIGGER platform_payments_amount_guard
  BEFORE INSERT OR UPDATE ON public.platform_payments
  FOR EACH ROW EXECUTE FUNCTION private.payment_amount_guard();

-- 5) منع تجاوز مجموع الاستردادات للمبلغ القابل للاسترداد
CREATE OR REPLACE FUNCTION private.refund_amount_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_paid numeric(14,2);
  v_sum numeric(14,2);
BEGIN
  IF NEW.status IN ('failed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT amount INTO v_paid
  FROM public.platform_payments
  WHERE id = NEW.payment_id AND status IN ('paid', 'refunded', 'partially_refunded')
  FOR UPDATE;

  IF v_paid IS NULL THEN
    RAISE EXCEPTION 'REFUND_REQUIRES_SETTLED_PAYMENT' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_sum
  FROM public.platform_refunds
  WHERE payment_id = NEW.payment_id
    AND id <> NEW.id
    AND status NOT IN ('failed', 'cancelled');

  IF v_sum + NEW.amount > v_paid + 0.005 THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_PAID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS platform_refunds_amount_guard ON public.platform_refunds;
CREATE TRIGGER platform_refunds_amount_guard
  BEFORE INSERT OR UPDATE ON public.platform_refunds
  FOR EACH ROW EXECUTE FUNCTION private.refund_amount_guard();

-- 6) توسيع حماية ثبات الفاتورة بعد الإصدار
CREATE OR REPLACE FUNCTION private.invoice_immutability_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.issued_at IS NOT NULL THEN
    NEW.number := OLD.number;
    NEW.organization_id := OLD.organization_id;
    NEW.tax_rate := OLD.tax_rate;
    NEW.tax_exempt := OLD.tax_exempt;
    NEW.tax_exemption_reason := OLD.tax_exemption_reason;
    NEW.currency := OLD.currency;
    NEW.issued_at := OLD.issued_at;
    NEW.created_by := OLD.created_by;
    NEW.created_by_email := OLD.created_by_email;
    IF NEW.status = 'draft' THEN
      RAISE EXCEPTION 'ISSUED_INVOICE_CANNOT_RETURN_TO_DRAFT' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 7) فهارس المركز المالي
CREATE INDEX IF NOT EXISTS platform_invoices_issued_at_idx ON public.platform_invoices (issued_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS platform_invoices_created_at_idx ON public.platform_invoices (created_at DESC);
CREATE INDEX IF NOT EXISTS platform_invoices_outstanding_idx ON public.platform_invoices (due_at)
  WHERE status IN ('issued', 'pending', 'partially_paid', 'overdue');
CREATE INDEX IF NOT EXISTS platform_invoices_customer_email_idx ON public.platform_invoices (lower(customer_email))
  WHERE customer_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_invoices_customer_name_idx ON public.platform_invoices (customer_name);
CREATE INDEX IF NOT EXISTS platform_payments_provider_status_idx ON public.platform_payments (provider, status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_payments_org_idx ON public.platform_payments (organization_id, created_at DESC)
  WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS platform_refunds_status_idx ON public.platform_refunds (status, created_at DESC);
CREATE INDEX IF NOT EXISTS platform_credit_notes_status_idx ON public.platform_credit_notes (status, issued_at DESC);
CREATE INDEX IF NOT EXISTS platform_bank_reconciliations_status_idx ON public.platform_bank_reconciliations (status, value_date DESC);
-- ============================================================
-- 20260804152503_ca45d958-d522-4c72-829f-ac653c7cf368.sql
-- ============================================================
CREATE OR REPLACE FUNCTION private.payment_amount_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_total numeric(14,2);
  v_sum numeric(14,2);
BEGIN
  IF NEW.status NOT IN ('paid', 'refunded', 'partially_refunded') THEN
    RETURN NEW;
  END IF;

  SELECT total INTO v_total FROM public.platform_invoices WHERE id = NEW.invoice_id FOR UPDATE;
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_sum
  FROM public.platform_payments
  WHERE invoice_id = NEW.invoice_id
    AND id <> NEW.id
    AND status IN ('paid', 'refunded', 'partially_refunded');

  IF v_sum + NEW.amount > v_total + 0.005 THEN
    RAISE EXCEPTION 'PAYMENT_EXCEEDS_INVOICE_TOTAL' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.refund_amount_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'private'
AS $$
DECLARE
  v_paid numeric(14,2);
  v_sum numeric(14,2);
BEGIN
  IF NEW.status IN ('failed', 'cancelled') THEN
    RETURN NEW;
  END IF;

  SELECT amount INTO v_paid
  FROM public.platform_payments
  WHERE id = NEW.payment_id AND status IN ('paid', 'refunded', 'partially_refunded')
  FOR UPDATE;

  IF v_paid IS NULL THEN
    RAISE EXCEPTION 'REFUND_REQUIRES_SETTLED_PAYMENT' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(sum(amount), 0) INTO v_sum
  FROM public.platform_refunds
  WHERE payment_id = NEW.payment_id
    AND id <> NEW.id
    AND status NOT IN ('failed', 'cancelled');

  IF v_sum + NEW.amount > v_paid + 0.005 THEN
    RAISE EXCEPTION 'REFUND_EXCEEDS_PAID_AMOUNT' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION private.payment_amount_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.refund_amount_guard() FROM PUBLIC, anon, authenticated;
-- ============================================================
-- 20260804163447_0a086417-1e86-46aa-9e64-f4ed60db0620.sql
-- ============================================================
-- =====================================================================
-- المرحلة الثالثة | أساس RBAC لفريق منصة مِهلة
-- =====================================================================

-- 1) الأقسام -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description text,
  parent_department_id uuid REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  manager_user_id uuid,
  default_role_id uuid REFERENCES public.platform_roles(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_departments TO authenticated;
GRANT ALL ON public.platform_departments TO service_role;
ALTER TABLE public.platform_departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read departments"
  ON public.platform_departments FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE OR REPLACE FUNCTION public.platform_departments_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cur uuid; hops int := 0;
BEGIN
  NEW.updated_at := now();
  IF NEW.parent_department_id IS NOT NULL THEN
    IF NEW.parent_department_id = NEW.id THEN
      RAISE EXCEPTION 'DEPARTMENT_CYCLE' USING ERRCODE = 'P0001';
    END IF;
    cur := NEW.parent_department_id;
    WHILE cur IS NOT NULL AND hops < 50 LOOP
      IF cur = NEW.id THEN RAISE EXCEPTION 'DEPARTMENT_CYCLE' USING ERRCODE = 'P0001'; END IF;
      SELECT parent_department_id INTO cur FROM public.platform_departments WHERE id = cur;
      hops := hops + 1;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS platform_departments_guard ON public.platform_departments;
CREATE TRIGGER platform_departments_guard
  BEFORE INSERT OR UPDATE ON public.platform_departments
  FOR EACH ROW EXECUTE FUNCTION public.platform_departments_guard();

-- 2) بيانات الموظف: القسم والمدير المباشر -----------------------------
ALTER TABLE public.platform_staff
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS manager_user_id uuid;

CREATE INDEX IF NOT EXISTS platform_staff_department_idx ON public.platform_staff(department_id);
CREATE INDEX IF NOT EXISTS platform_staff_manager_idx ON public.platform_staff(manager_user_id);

CREATE OR REPLACE FUNCTION public.platform_staff_manager_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cur uuid; hops int := 0;
BEGIN
  IF NEW.manager_user_id IS NOT NULL THEN
    IF NEW.manager_user_id = NEW.user_id THEN
      RAISE EXCEPTION 'MANAGER_CYCLE' USING ERRCODE = 'P0001';
    END IF;
    cur := NEW.manager_user_id;
    WHILE cur IS NOT NULL AND hops < 50 LOOP
      IF cur = NEW.user_id THEN RAISE EXCEPTION 'MANAGER_CYCLE' USING ERRCODE = 'P0001'; END IF;
      SELECT manager_user_id INTO cur FROM public.platform_staff WHERE user_id = cur;
      hops := hops + 1;
    END LOOP;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS platform_staff_manager_guard ON public.platform_staff;
CREATE TRIGGER platform_staff_manager_guard
  BEFORE INSERT OR UPDATE ON public.platform_staff
  FOR EACH ROW EXECUTE FUNCTION public.platform_staff_manager_guard();

-- 3) الصلاحيات الأساسية (دور + فرد) قبل أي منح ------------------------
CREATE OR REPLACE FUNCTION private.base_platform_permissions(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT array_agg(DISTINCT p) FROM (
       SELECT unnest(coalesce(s.permissions, '{}'::text[])) AS p
       FROM public.platform_staff s WHERE s.user_id = _user_id AND s.status = 'active'
       UNION
       SELECT unnest(coalesce(r.permissions, '{}'::text[])) AS p
       FROM public.platform_staff s
       JOIN public.platform_roles r ON r.id = s.role_id
       WHERE s.user_id = _user_id AND s.status = 'active'
     ) x), '{}'::text[])
$$;

CREATE OR REPLACE FUNCTION private.is_platform_super_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_staff
                 WHERE user_id = _user_id AND status = 'active' AND role = 'super_admin')
$$;

-- 4) منح الصلاحيات: مؤقتة أو مفوَّضة ----------------------------------
CREATE TABLE IF NOT EXISTS public.platform_permission_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grantee_user_id uuid NOT NULL,
  permission text NOT NULL,
  source text NOT NULL DEFAULT 'temporary',
  granted_by uuid NOT NULL,
  granted_by_email text,
  reason text NOT NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT grant_source_valid CHECK (source IN ('temporary', 'delegation')),
  CONSTRAINT grant_window_valid CHECK (expires_at > starts_at),
  CONSTRAINT grant_reason_present CHECK (length(btrim(reason)) >= 8),
  CONSTRAINT grant_no_self_delegation CHECK (source <> 'delegation' OR grantee_user_id <> granted_by)
);

GRANT SELECT ON public.platform_permission_grants TO authenticated;
GRANT ALL ON public.platform_permission_grants TO service_role;
ALTER TABLE public.platform_permission_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read grants"
  ON public.platform_permission_grants FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS ppg_grantee_active_idx
  ON public.platform_permission_grants(grantee_user_id, permission, expires_at)
  WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS ppg_granter_idx ON public.platform_permission_grants(granted_by);
CREATE UNIQUE INDEX IF NOT EXISTS ppg_unique_live_idx
  ON public.platform_permission_grants(grantee_user_id, permission, source)
  WHERE revoked_at IS NULL;

-- الصلاحيات المفعّلة = الأساسية + المنح السارية زمنياً
CREATE OR REPLACE FUNCTION private.granted_platform_permissions(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT g.permission), '{}'::text[])
  FROM public.platform_permission_grants g
  JOIN public.platform_staff s ON s.user_id = g.grantee_user_id AND s.status = 'active'
  WHERE g.grantee_user_id = _user_id
    AND g.revoked_at IS NULL
    AND g.starts_at <= now()
    AND g.expires_at > now()
$$;

CREATE OR REPLACE FUNCTION private.effective_platform_permissions(_user_id uuid)
RETURNS text[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT array_agg(DISTINCT p) FROM (
      SELECT unnest(private.base_platform_permissions(_user_id)) AS p
      UNION
      SELECT unnest(private.granted_platform_permissions(_user_id)) AS p
    ) y), '{}'::text[])
$$;

-- التحقق المركزي: يشمل المنح السارية دون كسر أي سلوك قائم
CREATE OR REPLACE FUNCTION private.has_platform_permission(_user_id uuid, _permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
    WHEN _user_id IS NULL THEN false
    WHEN private.is_platform_super_admin(_user_id) THEN true
    WHEN NOT private.is_platform_staff(_user_id) THEN false
    ELSE _permission = ANY (private.effective_platform_permissions(_user_id))
  END
$$;

-- لا تصعيد + لا تسلسل تفويض
CREATE OR REPLACE FUNCTION public.platform_permission_grants_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_super boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- لا يُعاد إحياء منح مسحوب، ولا تُغيّر هويته أو صلاحيته
    IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
      RAISE EXCEPTION 'GRANT_CANNOT_BE_REVIVED' USING ERRCODE = 'P0001';
    END IF;
    NEW.grantee_user_id := OLD.grantee_user_id;
    NEW.permission := OLD.permission;
    NEW.source := OLD.source;
    NEW.granted_by := OLD.granted_by;
    NEW.starts_at := OLD.starts_at;
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.platform_staff
                 WHERE user_id = NEW.grantee_user_id AND status = 'active') THEN
    RAISE EXCEPTION 'GRANTEE_NOT_ACTIVE_STAFF' USING ERRCODE = 'P0001';
  END IF;

  v_super := private.is_platform_super_admin(NEW.granted_by);

  IF NOT v_super THEN
    IF NOT EXISTS (SELECT 1 FROM public.platform_staff
                   WHERE user_id = NEW.granted_by AND status = 'active') THEN
      RAISE EXCEPTION 'GRANTER_NOT_ACTIVE_STAFF' USING ERRCODE = 'P0001';
    END IF;
    -- لا تصعيد: لا يُمنح إلا ما يملكه المانح فعلاً
    IF NOT (NEW.permission = ANY (private.effective_platform_permissions(NEW.granted_by))) THEN
      RAISE EXCEPTION 'PRIVILEGE_ESCALATION_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    -- لا تسلسل: التفويض لا يُبنى على صلاحية مفوَّضة
    IF NEW.source = 'delegation'
       AND NOT (NEW.permission = ANY (private.base_platform_permissions(NEW.granted_by))) THEN
      RAISE EXCEPTION 'CHAINED_DELEGATION_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  NEW.created_at := now();
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS platform_permission_grants_guard ON public.platform_permission_grants;
CREATE TRIGGER platform_permission_grants_guard
  BEFORE INSERT OR UPDATE ON public.platform_permission_grants
  FOR EACH ROW EXECUTE FUNCTION public.platform_permission_grants_guard();

CREATE OR REPLACE FUNCTION public.deny_hard_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'RECORD_DELETE_FORBIDDEN' USING ERRCODE = 'P0001';
END; $$;

DROP TRIGGER IF EXISTS platform_permission_grants_no_delete ON public.platform_permission_grants;
CREATE TRIGGER platform_permission_grants_no_delete
  BEFORE DELETE ON public.platform_permission_grants
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 5) طلبات الاعتماد (Four-Eyes) ---------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL,
  requested_by_email text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '3 days'),
  decided_by uuid,
  decided_by_email text,
  decided_at timestamptz,
  decision_reason text,
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_status_valid CHECK (status IN ('pending','approved','rejected','expired','executed')),
  CONSTRAINT approval_reason_present CHECK (length(btrim(reason)) >= 8),
  CONSTRAINT approval_four_eyes CHECK (decided_by IS NULL OR decided_by <> requested_by),
  CONSTRAINT approval_window_valid CHECK (expires_at > requested_at)
);

GRANT SELECT ON public.platform_approval_requests TO authenticated;
GRANT ALL ON public.platform_approval_requests TO service_role;
ALTER TABLE public.platform_approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read approvals"
  ON public.platform_approval_requests FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS par_status_idx ON public.platform_approval_requests(status, requested_at DESC);
CREATE INDEX IF NOT EXISTS par_requester_idx ON public.platform_approval_requests(requested_by);
CREATE UNIQUE INDEX IF NOT EXISTS par_unique_pending_idx
  ON public.platform_approval_requests(action, resource_type, coalesce(resource_id, ''))
  WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.platform_approval_requests_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.status := 'pending';
    NEW.decided_by := NULL; NEW.decided_at := NULL; NEW.executed_at := NULL;
    NEW.requested_at := now(); NEW.created_at := now(); NEW.updated_at := now();
    RETURN NEW;
  END IF;

  NEW.action := OLD.action;
  NEW.resource_type := OLD.resource_type;
  NEW.resource_id := OLD.resource_id;
  NEW.requested_by := OLD.requested_by;
  NEW.requested_at := OLD.requested_at;
  NEW.payload := OLD.payload;
  NEW.reason := OLD.reason;
  NEW.updated_at := now();

  IF OLD.status <> 'pending' AND NEW.status IN ('approved','rejected') THEN
    RAISE EXCEPTION 'REQUEST_NOT_PENDING' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status IN ('approved','rejected') THEN
    IF NEW.decided_by IS NULL THEN
      RAISE EXCEPTION 'DECISION_ACTOR_REQUIRED' USING ERRCODE = 'P0001';
    END IF;
    IF NEW.decided_by = OLD.requested_by THEN
      RAISE EXCEPTION 'SELF_APPROVAL_FORBIDDEN' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.expires_at <= now() THEN
      RAISE EXCEPTION 'REQUEST_EXPIRED' USING ERRCODE = 'P0001';
    END IF;
    NEW.decided_at := now();
  END IF;

  IF NEW.status = 'executed' AND OLD.status <> 'approved' THEN
    RAISE EXCEPTION 'REQUEST_NOT_APPROVED' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS platform_approval_requests_guard ON public.platform_approval_requests;
CREATE TRIGGER platform_approval_requests_guard
  BEFORE INSERT OR UPDATE ON public.platform_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.platform_approval_requests_guard();

DROP TRIGGER IF EXISTS platform_approval_requests_no_delete ON public.platform_approval_requests;
CREATE TRIGGER platform_approval_requests_no_delete
  BEFORE DELETE ON public.platform_approval_requests
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 6) جلسات الموظفين والأجهزة ------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_staff_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  device text,
  browser text,
  os text,
  ip text,
  country text,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  requests_count integer NOT NULL DEFAULT 1,
  revoked_at timestamptz,
  revoked_by uuid,
  revoke_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_session_unique UNIQUE (user_id, device_fingerprint)
);

GRANT SELECT ON public.platform_staff_sessions TO authenticated;
GRANT ALL ON public.platform_staff_sessions TO service_role;
ALTER TABLE public.platform_staff_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read sessions"
  ON public.platform_staff_sessions FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid())
         AND (user_id = auth.uid() OR private.has_platform_permission(auth.uid(), 'staff.sessions.read')));

CREATE INDEX IF NOT EXISTS pss_user_idx ON public.platform_staff_sessions(user_id, last_seen_at DESC);

-- 7) قيود الوصول لكل موظف (IP / جهاز / وقت) ---------------------------
CREATE TABLE IF NOT EXISTS public.platform_staff_restrictions (
  user_id uuid PRIMARY KEY,
  ip_enforced boolean NOT NULL DEFAULT false,
  allowed_ips text[] NOT NULL DEFAULT '{}'::text[],
  device_enforced boolean NOT NULL DEFAULT false,
  trusted_devices text[] NOT NULL DEFAULT '{}'::text[],
  time_enforced boolean NOT NULL DEFAULT false,
  work_start_minute integer NOT NULL DEFAULT 0,
  work_end_minute integer NOT NULL DEFAULT 1440,
  allowed_weekdays integer[] NOT NULL DEFAULT '{0,1,2,3,4,5,6}'::integer[],
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT work_window_valid CHECK (work_start_minute >= 0 AND work_end_minute <= 1440
                                      AND work_end_minute > work_start_minute)
);

GRANT SELECT ON public.platform_staff_restrictions TO authenticated;
GRANT ALL ON public.platform_staff_restrictions TO service_role;
ALTER TABLE public.platform_staff_restrictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read restrictions"
  ON public.platform_staff_restrictions FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid())
         AND (user_id = auth.uid()
              OR private.has_platform_permission(auth.uid(), 'staff.restrictions.manage')));

-- 8) الانتحال ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_impersonation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  actor_email text,
  target_user_id uuid NOT NULL,
  target_email text,
  reason text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  approval_request_id uuid REFERENCES public.platform_approval_requests(id) ON DELETE SET NULL,
  approved_by uuid,
  approved_at timestamptz,
  started_at timestamptz,
  expires_at timestamptz NOT NULL,
  ended_at timestamptz,
  ended_by uuid,
  end_reason text,
  read_only boolean NOT NULL DEFAULT true,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT imp_status_valid CHECK (status IN ('pending','active','ended','rejected','expired')),
  CONSTRAINT imp_reason_present CHECK (length(btrim(reason)) >= 8),
  CONSTRAINT imp_read_only_always CHECK (read_only),
  CONSTRAINT imp_not_self CHECK (actor_user_id <> target_user_id),
  CONSTRAINT imp_four_eyes CHECK (approved_by IS NULL OR approved_by <> actor_user_id)
);

GRANT SELECT ON public.platform_impersonation_sessions TO authenticated;
GRANT ALL ON public.platform_impersonation_sessions TO service_role;
ALTER TABLE public.platform_impersonation_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read impersonation"
  ON public.platform_impersonation_sessions FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS pis_actor_idx ON public.platform_impersonation_sessions(actor_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS pis_single_active_idx
  ON public.platform_impersonation_sessions(actor_user_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS public.platform_impersonation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.platform_impersonation_sessions(id) ON DELETE RESTRICT,
  actor_user_id uuid NOT NULL,
  target_user_id uuid NOT NULL,
  event text NOT NULL,
  path text,
  detail text,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.platform_impersonation_events TO authenticated;
GRANT ALL ON public.platform_impersonation_events TO service_role;
ALTER TABLE public.platform_impersonation_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read impersonation events"
  ON public.platform_impersonation_events FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS pie_session_idx ON public.platform_impersonation_events(session_id, created_at);

CREATE OR REPLACE FUNCTION public.deny_update()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'RECORD_IMMUTABLE' USING ERRCODE = 'P0001';
END; $$;

DROP TRIGGER IF EXISTS platform_impersonation_events_immutable ON public.platform_impersonation_events;
CREATE TRIGGER platform_impersonation_events_immutable
  BEFORE UPDATE ON public.platform_impersonation_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS platform_impersonation_events_no_delete ON public.platform_impersonation_events;
CREATE TRIGGER platform_impersonation_events_no_delete
  BEFORE DELETE ON public.platform_impersonation_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

DROP TRIGGER IF EXISTS platform_impersonation_sessions_no_delete ON public.platform_impersonation_sessions;
CREATE TRIGGER platform_impersonation_sessions_no_delete
  BEFORE DELETE ON public.platform_impersonation_sessions
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 9) سجل التدقيق: غير قابل للتعديل أو الحذف ---------------------------
DROP TRIGGER IF EXISTS admin_audit_logs_immutable ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_logs_immutable
  BEFORE UPDATE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS admin_audit_logs_no_delete ON public.admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_delete
  BEFORE DELETE ON public.admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 10) أقسام تأسيسية (متوافقة مع البيانات القائمة) ---------------------
INSERT INTO public.platform_departments (code, name_ar, description)
VALUES
  ('operations', 'التشغيل', 'إدارة المنصة والإعدادات والمراقبة.'),
  ('support', 'الدعم الفني', 'التذاكر والتواصل مع المكاتب.'),
  ('finance', 'المالية', 'الفواتير والمدفوعات والتقارير المالية.'),
  ('security', 'الأمان والامتثال', 'سجل التدقيق والصلاحيات والمخاطر.')
ON CONFLICT (code) DO NOTHING;
-- ============================================================
-- 20260804163518_7fdf5666-2338-4f16-99a7-b7fc2624d3be.sql
-- ============================================================
REVOKE ALL ON FUNCTION public.platform_permission_grants_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_departments_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_staff_manager_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.platform_approval_requests_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deny_update() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deny_hard_delete() FROM PUBLIC, anon, authenticated;
-- ============================================================
-- 20260804164913_8eb8432f-05d0-4d87-a3e2-55b4661267cc.sql
-- ============================================================
-- 1) حالة الدور
ALTER TABLE public.platform_roles ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- الدور المعطّل لا يمنح أي صلاحية
CREATE OR REPLACE FUNCTION private.base_platform_permissions(_user_id uuid)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT coalesce(
    (SELECT array_agg(DISTINCT p) FROM (
       SELECT unnest(coalesce(s.permissions, '{}'::text[])) AS p
       FROM public.platform_staff s WHERE s.user_id = _user_id AND s.status = 'active'
       UNION
       SELECT unnest(coalesce(r.permissions, '{}'::text[])) AS p
       FROM public.platform_staff s
       JOIN public.platform_roles r ON r.id = s.role_id AND r.is_active
       WHERE s.user_id = _user_id AND s.status = 'active'
     ) x), '{}'::text[])
$function$;

-- 2) مرجع/تذكرة للمنح
ALTER TABLE public.platform_permission_grants ADD COLUMN IF NOT EXISTS reference text;

-- 3) توسيع قيود الوصول
ALTER TABLE public.platform_staff_restrictions
  ADD COLUMN IF NOT EXISTS denied_ips text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS blocked_devices text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS effective_from timestamptz,
  ADD COLUMN IF NOT EXISTS effective_to timestamptz;

-- 4) إصلاح أمني: بنود الفاتورة تتبع صلاحية قراءة الفاتورة نفسها
DROP POLICY IF EXISTS "invoice items readable with invoice" ON public.platform_invoice_items;
CREATE POLICY "invoice items follow invoice access"
ON public.platform_invoice_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.platform_invoices i
    WHERE i.id = platform_invoice_items.invoice_id
      AND (
        private.has_platform_permission(auth.uid(), 'billing.read')
        OR (
          i.status <> 'draft'
          AND (
            i.user_id = auth.uid()
            OR private.is_organization_member(i.organization_id, auth.uid())
          )
        )
      )
  )
);
-- ============================================================
-- 20260804184719_9cb386f4-baf5-44b5-9f42-d9ef81817351.sql
-- ============================================================
-- ============================================================
-- Least Privilege: صلاحيات مستقلة لبيانات أطراف القضية
-- ============================================================

CREATE TABLE public.case_party_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  permission text NOT NULL CHECK (permission IN ('case_parties.read','case_parties.create','case_parties.update','case_parties.delete')),
  reason text,
  granted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id, permission)
);

CREATE INDEX case_party_permissions_lookup_idx
  ON public.case_party_permissions (organization_id, user_id, permission)
  WHERE revoked_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.case_party_permissions TO authenticated;
GRANT ALL ON public.case_party_permissions TO service_role;
ALTER TABLE public.case_party_permissions ENABLE ROW LEVEL SECURITY;

-- العضو يرى صلاحياته فقط؛ المالك/المدير يرى ويدير صلاحيات مكتبه.
CREATE POLICY case_party_permissions_select ON public.case_party_permissions
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role])
  );

CREATE POLICY case_party_permissions_insert ON public.case_party_permissions
  FOR INSERT TO authenticated
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

CREATE POLICY case_party_permissions_update ON public.case_party_permissions
  FOR UPDATE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]))
  WITH CHECK (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

CREATE POLICY case_party_permissions_delete ON public.case_party_permissions
  FOR DELETE TO authenticated
  USING (private.has_organization_role(organization_id, auth.uid(), ARRAY['owner'::app_role,'admin'::app_role]));

-- المنح يجب أن يكون لعضو نشط في نفس المكتب فقط.
CREATE OR REPLACE FUNCTION private.case_party_permissions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = NEW.organization_id
      AND m.user_id = NEW.user_id
      AND m.status = 'active'
  ) THEN
    RAISE EXCEPTION 'لا يمكن منح صلاحية لعضو غير نشط في هذا المكتب';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER case_party_permissions_guard_trg
  BEFORE INSERT OR UPDATE ON public.case_party_permissions
  FOR EACH ROW EXECUTE FUNCTION private.case_party_permissions_guard();

-- ============================================================
-- محرك التحقق: صلاحية فعّالة واحدة لكل عملية (read <> write)
-- ============================================================
CREATE OR REPLACE FUNCTION private.has_case_party_permission(
  _organization_id uuid,
  _user_id uuid,
  _permission text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _role app_role;
BEGIN
  IF _user_id IS NULL OR _organization_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT m.role INTO _role
  FROM public.organization_members m
  WHERE m.organization_id = _organization_id
    AND m.user_id = _user_id
    AND m.status = 'active';

  IF _role IS NULL THEN
    RETURN false;
  END IF;

  -- المالك والمدير: مسؤولية إدارية كاملة داخل مكتبهم.
  IF _role IN ('owner','admin') THEN
    RETURN true;
  END IF;

  -- القراءة: متاحة لأعضاء الممارسة القانونية، وللمشاهد فقط بمنح صريح.
  IF _permission = 'case_parties.read' AND _role IN ('lawyer','legal_assistant') THEN
    RETURN true;
  END IF;

  -- أي كتابة (إنشاء/تعديل/حذف): منح صريح ساري فقط.
  RETURN EXISTS (
    SELECT 1
    FROM public.case_party_permissions p
    WHERE p.organization_id = _organization_id
      AND p.user_id = _user_id
      AND p.permission = _permission
      AND p.revoked_at IS NULL
      AND (p.expires_at IS NULL OR p.expires_at > now())
  );
END;
$$;

REVOKE ALL ON FUNCTION private.has_case_party_permission(uuid, uuid, text) FROM PUBLIC;

-- غلاف عام للاستخدام من الخادم/الواجهة (يعمل على المستخدم الموقّع فقط).
CREATE OR REPLACE FUNCTION public.my_case_party_permissions(_organization_id uuid)
RETURNS TABLE(permission text, allowed boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.permission,
         private.has_case_party_permission(_organization_id, auth.uid(), p.permission)
  FROM (VALUES
    ('case_parties.read'),
    ('case_parties.create'),
    ('case_parties.update'),
    ('case_parties.delete')
  ) AS p(permission);
$$;

REVOKE ALL ON FUNCTION public.my_case_party_permissions(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.my_case_party_permissions(uuid) TO authenticated;

-- ============================================================
-- RLS على case_parties: كل عملية بصلاحيتها المستقلة
-- ============================================================
DROP POLICY IF EXISTS parties_select ON public.case_parties;
DROP POLICY IF EXISTS parties_insert ON public.case_parties;
DROP POLICY IF EXISTS parties_update ON public.case_parties;
DROP POLICY IF EXISTS parties_delete ON public.case_parties;

CREATE POLICY case_parties_read ON public.case_parties
  FOR SELECT TO authenticated
  USING (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.read'));

CREATE POLICY case_parties_create ON public.case_parties
  FOR INSERT TO authenticated
  WITH CHECK (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.create'));

CREATE POLICY case_parties_update ON public.case_parties
  FOR UPDATE TO authenticated
  USING (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.update'))
  WITH CHECK (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.update'));

CREATE POLICY case_parties_delete ON public.case_parties
  FOR DELETE TO authenticated
  USING (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.delete'));

-- ============================================================
-- سجل تدقيق أطراف القضية: قبل/بعد، غير قابل للتعديل أو الحذف
-- ============================================================
CREATE TABLE public.case_party_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  case_id uuid,
  party_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','delete')),
  actor_id uuid,
  before_values jsonb,
  after_values jsonb,
  changed_fields text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX case_party_audit_org_idx ON public.case_party_audit_logs (organization_id, created_at DESC);
CREATE INDEX case_party_audit_party_idx ON public.case_party_audit_logs (party_id, created_at DESC);

GRANT SELECT ON public.case_party_audit_logs TO authenticated;
GRANT ALL ON public.case_party_audit_logs TO service_role;
ALTER TABLE public.case_party_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY case_party_audit_select ON public.case_party_audit_logs
  FOR SELECT TO authenticated
  USING (private.has_case_party_permission(organization_id, auth.uid(), 'case_parties.read'));

CREATE TRIGGER case_party_audit_no_update
  BEFORE UPDATE ON public.case_party_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();

CREATE TRIGGER case_party_audit_no_delete
  BEFORE DELETE ON public.case_party_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- التقاط القيم قبل/بعد مع تنقية كاملة لأي حقل حساس مشفّر.
CREATE OR REPLACE FUNCTION private.case_parties_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _before jsonb;
  _after jsonb;
  _changed text[];
  _redact text[] := ARRAY[
    'national_id','national_id_enc','national_id_bidx',
    'commercial_registration','commercial_registration_enc','commercial_registration_bidx'
  ];
BEGIN
  IF TG_OP <> 'INSERT' THEN
    _before := (to_jsonb(OLD) - _redact);
  END IF;
  IF TG_OP <> 'DELETE' THEN
    _after := (to_jsonb(NEW) - _redact);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(key ORDER BY key) INTO _changed
    FROM jsonb_each(_after) a
    WHERE _before -> a.key IS DISTINCT FROM a.value;
  END IF;

  INSERT INTO public.case_party_audit_logs (
    organization_id, case_id, party_id, action, actor_id, before_values, after_values, changed_fields
  ) VALUES (
    COALESCE(NEW.organization_id, OLD.organization_id),
    COALESCE(NEW.case_id, OLD.case_id),
    COALESCE(NEW.id, OLD.id),
    CASE TG_OP WHEN 'INSERT' THEN 'create' WHEN 'UPDATE' THEN 'update' ELSE 'delete' END,
    auth.uid(),
    _before,
    _after,
    _changed
  );

  RETURN NULL;
END;
$$;

CREATE TRIGGER case_parties_audit_trg
  AFTER INSERT OR UPDATE OR DELETE ON public.case_parties
  FOR EACH ROW EXECUTE FUNCTION private.case_parties_audit();
-- ============================================================
-- 20260804185157_84117c58-3e2b-4cc8-9459-56ff2675df03.sql
-- ============================================================
GRANT EXECUTE ON FUNCTION private.has_case_party_permission(uuid, uuid, text) TO authenticated, service_role;
-- ============================================================
-- 20260804185220_57d59666-c166-499f-9b6f-9776bfdb6fea.sql
-- ============================================================
GRANT EXECUTE ON FUNCTION private.has_case_party_permission(uuid, uuid, text) TO sandbox_exec;
-- ============================================================
-- 20260804191518_0e28de3b-85d7-429f-9971-e689823da94b.sql
-- ============================================================
-- 1) دالة SECURITY DEFINER لا يجب أن تكون قابلة للتنفيذ من الزوّار
REVOKE ALL ON FUNCTION public.my_case_party_permissions(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.my_case_party_permissions(uuid) TO authenticated;

-- 2) أطراف القضية: بيانات PII — لا وصول للزوّار إطلاقاً (السياسات كلها authenticated أصلاً)
REVOKE ALL ON TABLE public.case_parties FROM anon;

-- 3) جداول التتبّع العام: إغلاق كامل عبر الـ Data API، الوصول عبر الخادم الموثوق فقط
REVOKE ALL ON TABLE public.case_code_registry FROM anon, authenticated;
REVOKE ALL ON TABLE public.case_lookup_attempts FROM anon, authenticated;
GRANT ALL ON TABLE public.case_code_registry TO service_role;
GRANT ALL ON TABLE public.case_lookup_attempts TO service_role;

ALTER TABLE public.case_code_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_lookup_attempts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.case_code_registry IS
  'سجل رموز متابعة القضايا. مغلق بالكامل عبر الـ Data API (RLS مفعّل بدون سياسات ولا منح للزوّار/الأعضاء)؛ الوصول عبر منطق الخادم الموثوق فقط.';
COMMENT ON TABLE public.case_lookup_attempts IS
  'محاولات البحث العام عن القضايا لأغراض تحديد المعدل. مغلق بالكامل عبر الـ Data API؛ الوصول عبر منطق الخادم الموثوق فقط.';
-- ============================================================
-- 20260804192252_2ee62873-f35d-4e85-afa6-8fba412592f7.sql
-- ============================================================
-- تقييد تنفيذ الدوال ذات SECURITY DEFINER (Least Privilege)
DO $$
DECLARE r record;
BEGIN
  -- 1) تثبيت صلاحية المستخدمين المصادقين صراحةً قبل إلغاء الصلاحية العامة
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;

  -- 2) إلغاء الصلاحية العامة وصلاحية الزوّار عن كل دوال المخطط الخاص
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- 3) دالة غير مستخدمة من الواجهة: تُقصر على service_role فقط
REVOKE ALL ON FUNCTION public.admin_service_usage_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_service_usage_summary() TO service_role;

-- ============================================================
-- 20260804193800_3b068b1e-0d36-4554-9416-999a97c1cfd4.sql
-- ============================================================
REVOKE ALL ON public.design_audit_logs FROM anon, authenticated;
REVOKE ALL ON public.design_drafts FROM anon, authenticated;
REVOKE ALL ON public.design_publish_state FROM anon, authenticated;
REVOKE ALL ON public.design_themes FROM anon, authenticated;
REVOKE ALL ON public.design_versions FROM anon, authenticated;
REVOKE ALL ON public.integration_secrets FROM anon, authenticated;
REVOKE ALL ON public.otp_verifications FROM anon, authenticated;

GRANT ALL ON public.design_audit_logs TO service_role;
GRANT ALL ON public.design_drafts TO service_role;
GRANT ALL ON public.design_publish_state TO service_role;
GRANT ALL ON public.design_themes TO service_role;
GRANT ALL ON public.design_versions TO service_role;
GRANT ALL ON public.integration_secrets TO service_role;
GRANT ALL ON public.otp_verifications TO service_role;
-- ============================================================
-- 20260804194434_9dd81f84-7433-4742-a775-05b5b678ee3c.sql
-- ============================================================
-- =========================================================================
-- Email Workspace — جداول منصة خادمية بالكامل (لا وصول مباشر من العميل)
-- =========================================================================

CREATE TABLE public.email_mailboxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  display_name text NOT NULL,
  type text NOT NULL DEFAULT 'human' CHECK (type IN ('human','system')),
  provider text NOT NULL DEFAULT 'managed',
  department_id uuid REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  is_shared boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  inbound_enabled boolean NOT NULL DEFAULT false,
  signature_html text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.email_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mailbox_id uuid NOT NULL REFERENCES public.email_mailboxes(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT '',
  folder text NOT NULL DEFAULT 'inbox'
    CHECK (folder IN ('inbox','sent','drafts','outbox','archive','spam','trash')),
  is_unread boolean NOT NULL DEFAULT false,
  is_starred boolean NOT NULL DEFAULT false,
  assigned_to uuid,
  assigned_to_email text,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  participants text[] NOT NULL DEFAULT '{}',
  message_count integer NOT NULL DEFAULT 0,
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  previous_folder text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX email_threads_mailbox_folder_idx
  ON public.email_threads (mailbox_id, folder, last_activity_at DESC);
CREATE INDEX email_threads_ticket_idx ON public.email_threads (ticket_id);
CREATE INDEX email_threads_assigned_idx ON public.email_threads (assigned_to);

CREATE TABLE public.email_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  mailbox_id uuid NOT NULL REFERENCES public.email_mailboxes(id) ON DELETE CASCADE,
  message_id text NOT NULL UNIQUE,
  in_reply_to text,
  reference_ids text[] NOT NULL DEFAULT '{}',
  direction text NOT NULL CHECK (direction IN ('inbound','outbound')),
  kind text NOT NULL DEFAULT 'human' CHECK (kind IN ('human','system')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','scheduled','queued','sending','sent','failed','bounced','received')),
  from_address text NOT NULL,
  from_name text,
  to_addresses text[] NOT NULL DEFAULT '{}',
  cc_addresses text[] NOT NULL DEFAULT '{}',
  bcc_addresses text[] NOT NULL DEFAULT '{}',
  subject text NOT NULL DEFAULT '',
  html text,
  body_text text,
  provider text NOT NULL DEFAULT 'managed',
  provider_ref text,
  failure_ref text,
  received_at timestamptz,
  sent_at timestamptz,
  scheduled_at timestamptz,
  assigned_to uuid,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX email_messages_provider_ref_key
  ON public.email_messages (provider, provider_ref) WHERE provider_ref IS NOT NULL;
CREATE INDEX email_messages_thread_idx ON public.email_messages (thread_id, created_at);
CREATE INDEX email_messages_mailbox_status_idx ON public.email_messages (mailbox_id, status);
CREATE INDEX email_messages_search_idx
  ON public.email_messages USING gin (to_tsvector('simple', coalesce(subject,'') || ' ' || coalesce(body_text,'')));

CREATE TABLE public.email_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.email_messages(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_attachments_message_idx ON public.email_attachments (message_id);

CREATE TABLE public.email_labels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'green',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.email_thread_labels (
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  label_id uuid NOT NULL REFERENCES public.email_labels(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, label_id)
);

CREATE TABLE public.email_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.email_threads(id) ON DELETE CASCADE,
  author_id uuid,
  author_email text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_notes_thread_idx ON public.email_notes (thread_id, created_at);

CREATE TABLE public.email_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.email_messages(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('scheduled','queued','sending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  last_error text,
  last_error_code text,
  failure_ref text,
  scheduled_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_outbox_due_idx ON public.email_outbox (status, next_attempt_at);

CREATE TABLE public.email_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text NOT NULL,
  action text NOT NULL,
  mailbox_id uuid,
  thread_id uuid,
  message_id uuid,
  description text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_audit_logs_created_idx ON public.email_audit_logs (created_at DESC);
CREATE INDEX email_audit_logs_thread_idx ON public.email_audit_logs (thread_id);

-- محدّثات الطوابع
CREATE TRIGGER email_mailboxes_updated BEFORE UPDATE ON public.email_mailboxes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_threads_updated BEFORE UPDATE ON public.email_threads
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_messages_updated BEFORE UPDATE ON public.email_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_labels_updated BEFORE UPDATE ON public.email_labels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER email_outbox_updated BEFORE UPDATE ON public.email_outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- سجل التدقيق غير قابل للتعديل أو الحذف
CREATE TRIGGER email_audit_logs_no_update BEFORE UPDATE ON public.email_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();
CREATE TRIGGER email_audit_logs_no_delete BEFORE DELETE ON public.email_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- =========================================================================
-- الصلاحيات: خادمية فقط (مغلق افتراضاً) — لا anon ولا authenticated
-- =========================================================================
GRANT ALL ON public.email_mailboxes TO service_role;
GRANT ALL ON public.email_threads TO service_role;
GRANT ALL ON public.email_messages TO service_role;
GRANT ALL ON public.email_attachments TO service_role;
GRANT ALL ON public.email_labels TO service_role;
GRANT ALL ON public.email_thread_labels TO service_role;
GRANT ALL ON public.email_notes TO service_role;
GRANT ALL ON public.email_outbox TO service_role;
GRANT ALL ON public.email_audit_logs TO service_role;

ALTER TABLE public.email_mailboxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_thread_labels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_audit_logs ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- الصناديق الرسمية
-- =========================================================================
INSERT INTO public.email_mailboxes (address, display_name, type, is_shared, inbound_enabled, sort_order)
VALUES
  ('support@mehlalex.com', 'الدعم الفني',      'human',  true,  false, 1),
  ('sales@mehlalex.com',   'المبيعات',          'human',  true,  false, 2),
  ('billing@mehlalex.com', 'الفوترة',           'human',  true,  false, 3),
  ('legal@mehlalex.com',   'الشؤون القانونية',  'human',  true,  false, 4),
  ('info@mehlalex.com',    'الاستفسارات العامة','human',  true,  false, 5),
  ('noreply@mehlalex.com', 'رسائل النظام',      'system', false, false, 6);

INSERT INTO public.email_labels (name_ar, color) VALUES
  ('عاجل', 'red'),
  ('متابعة', 'amber'),
  ('مكتمل', 'green');
-- ============================================================
-- 20260804200609_082cae69-897c-41fb-8a69-68d81180ef89.sql
-- ============================================================
-- ============ توسيع مرفقات البريد ============
ALTER TABLE public.email_attachments
  ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'outbound',
  ADD COLUMN IF NOT EXISTS original_name text,
  ADD COLUMN IF NOT EXISTS extension text,
  ADD COLUMN IF NOT EXISTS sha256 text,
  ADD COLUMN IF NOT EXISTS scan_status text NOT NULL DEFAULT 'not_scanned',
  ADD COLUMN IF NOT EXISTS scan_detail text,
  ADD COLUMN IF NOT EXISTS is_quarantined boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_inline_safe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uploaded_by uuid,
  ADD COLUMN IF NOT EXISTS uploaded_by_email text,
  ADD COLUMN IF NOT EXISTS download_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_downloaded_at timestamptz;

ALTER TABLE public.email_attachments
  ALTER COLUMN message_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_attachments_direction_chk') THEN
    ALTER TABLE public.email_attachments
      ADD CONSTRAINT email_attachments_direction_chk CHECK (direction IN ('outbound','inbound'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_attachments_scan_chk') THEN
    ALTER TABLE public.email_attachments
      ADD CONSTRAINT email_attachments_scan_chk
      CHECK (scan_status IN ('not_scanned','pending','clean','rejected','quarantined'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_attachments_msg_sha_uidx
  ON public.email_attachments (message_id, sha256)
  WHERE message_id IS NOT NULL AND sha256 IS NOT NULL;

CREATE INDEX IF NOT EXISTS email_attachments_message_idx ON public.email_attachments (message_id);

-- ============ سجل أحداث البريد الوارد ============
CREATE TABLE IF NOT EXISTS public.email_inbound_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'webhook',
  provider_message_id text,
  payload_hash text NOT NULL,
  recipient text,
  sender_hint text,
  signature_mode text NOT NULL DEFAULT 'shared_secret',
  request_ip text,
  outcome text NOT NULL,
  reject_reason text,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  message_row_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  attachments_accepted integer NOT NULL DEFAULT 0,
  attachments_rejected integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'email_inbound_events_outcome_chk') THEN
    ALTER TABLE public.email_inbound_events
      ADD CONSTRAINT email_inbound_events_outcome_chk
      CHECK (outcome IN ('accepted','duplicate','rejected','rate_limited','replayed','unauthorized'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS email_inbound_events_provider_msg_uidx
  ON public.email_inbound_events (provider_message_id)
  WHERE provider_message_id IS NOT NULL AND outcome = 'accepted';

CREATE INDEX IF NOT EXISTS email_inbound_events_created_idx ON public.email_inbound_events (created_at DESC);
CREATE INDEX IF NOT EXISTS email_inbound_events_hash_idx ON public.email_inbound_events (payload_hash, created_at DESC);

-- مغلق تماماً أمام العميل: RLS مُفعّل بلا سياسات، والوصول لـ service_role فقط
ALTER TABLE public.email_inbound_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.email_inbound_events FROM anon, authenticated;
GRANT ALL ON public.email_inbound_events TO service_role;

-- سجل غير قابل للتعديل أو الحذف
DROP TRIGGER IF EXISTS email_inbound_events_no_update ON public.email_inbound_events;
CREATE TRIGGER email_inbound_events_no_update
  BEFORE UPDATE ON public.email_inbound_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS email_inbound_events_no_delete ON public.email_inbound_events;
CREATE TRIGGER email_inbound_events_no_delete
  BEFORE DELETE ON public.email_inbound_events
  FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();
-- ============================================================
-- 20260804211247_a92a4f20-61be-4d2e-ac4a-c0a236e9d4b8.sql
-- ============================================================
-- ============================================================
-- Support Center — Phase 1: schema
-- ============================================================

-- 1) new lifecycle states (values are NOT referenced in this migration)
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'pending_internal';
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'escalated';
ALTER TYPE public.ticket_status ADD VALUE IF NOT EXISTS 'resolved';

-- 2) readable sequential ticket number
CREATE SEQUENCE IF NOT EXISTS public.support_ticket_number_seq START 1000;

-- 3) business calendars & holidays
CREATE TABLE IF NOT EXISTS public.support_business_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  timezone text NOT NULL DEFAULT 'Asia/Riyadh',
  work_days smallint[] NOT NULL DEFAULT '{0,1,2,3,4}',
  start_minute integer NOT NULL DEFAULT 540,
  end_minute integer NOT NULL DEFAULT 1020,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_calendar_window CHECK (start_minute >= 0 AND end_minute > start_minute AND end_minute <= 1440)
);
GRANT ALL ON public.support_business_calendars TO service_role;
ALTER TABLE public.support_business_calendars ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES public.support_business_calendars(id) ON DELETE CASCADE,
  holiday_date date NOT NULL,
  name_ar text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, holiday_date)
);
GRANT ALL ON public.support_holidays TO service_role;
ALTER TABLE public.support_holidays ENABLE ROW LEVEL SECURITY;

-- 4) teams
CREATE TABLE IF NOT EXISTS public.support_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description text,
  department_id uuid REFERENCES public.platform_departments(id) ON DELETE SET NULL,
  mailbox_id uuid REFERENCES public.email_mailboxes(id) ON DELETE SET NULL,
  manager_user_id uuid,
  escalation_team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  is_default boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.support_teams TO service_role;
ALTER TABLE public.support_teams ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.support_teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  is_lead boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
GRANT ALL ON public.support_team_members TO service_role;
ALTER TABLE public.support_team_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_team_members_user_idx ON public.support_team_members (user_id);

-- 5) SLA policies
CREATE TABLE IF NOT EXISTS public.support_sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  calendar_id uuid NOT NULL REFERENCES public.support_business_calendars(id),
  plan_code text,
  priority public.ticket_priority,
  channel text,
  category text,
  first_response_minutes integer NOT NULL DEFAULT 240,
  resolution_minutes integer NOT NULL DEFAULT 1440,
  pause_on_customer_wait boolean NOT NULL DEFAULT true,
  warning_percent smallint NOT NULL DEFAULT 75,
  critical_percent smallint NOT NULL DEFAULT 90,
  specificity integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_sla_minutes CHECK (first_response_minutes > 0 AND resolution_minutes > 0),
  CONSTRAINT support_sla_percent CHECK (warning_percent BETWEEN 1 AND 99 AND critical_percent BETWEEN warning_percent AND 100)
);
GRANT ALL ON public.support_sla_policies TO service_role;
ALTER TABLE public.support_sla_policies ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_sla_policies_match_idx
  ON public.support_sla_policies (is_active, plan_code, priority, channel, category);

-- 6) categories
CREATE TABLE IF NOT EXISTS public.support_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name_ar text NOT NULL,
  description text,
  default_priority public.ticket_priority NOT NULL DEFAULT 'medium',
  default_team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  sla_policy_id uuid REFERENCES public.support_sla_policies(id) ON DELETE SET NULL,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.support_categories TO service_role;
ALTER TABLE public.support_categories ENABLE ROW LEVEL SECURITY;

-- 7) tags
CREATE TABLE IF NOT EXISTS public.support_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL UNIQUE,
  color text NOT NULL DEFAULT 'muted',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.support_tags TO service_role;
ALTER TABLE public.support_tags ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.support_ticket_tags (
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.support_tags(id) ON DELETE CASCADE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ticket_id, tag_id)
);
GRANT ALL ON public.support_ticket_tags TO service_role;
ALTER TABLE public.support_ticket_tags ENABLE ROW LEVEL SECURITY;

-- 8) ticket columns
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS ticket_number text,
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'web_form',
  ADD COLUMN IF NOT EXISTS subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sla_policy_id uuid REFERENCES public.support_sla_policies(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS due_resolution_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_state text NOT NULL DEFAULT 'on_track',
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS paused_total_seconds integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalation_level smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS merged_into_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS split_from_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reopened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_email_thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS requester_email text,
  ADD COLUMN IF NOT EXISTS requester_name text,
  ADD COLUMN IF NOT EXISTS identity_source text,
  ADD COLUMN IF NOT EXISTS needs_identity_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS kb_article_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS csat_requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_customer_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_staff_reply_at timestamptz;

ALTER TABLE public.support_tickets
  ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_channel_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_channel_check
  CHECK (channel IN ('email','web_form','manual','whatsapp','chat'));

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_sla_state_check;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_sla_state_check
  CHECK (sla_state IN ('on_track','paused','warning','critical','breached','met'));

ALTER TABLE public.support_tickets
  DROP CONSTRAINT IF EXISTS support_tickets_no_self_merge;
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_no_self_merge CHECK (merged_into_id IS NULL OR merged_into_id <> id);

-- allow trusted server-side (service role / migration) updates; user-facing rating rules unchanged
CREATE OR REPLACE FUNCTION public.support_tickets_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $guard$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.user_id := coalesce(auth.uid(), NEW.user_id);
    NEW.reference := coalesce(nullif(btrim(NEW.reference), ''),
      'TK-' || to_char(now(), 'YYMMDD') || '-' || lpad((floor(random() * 100000))::int::text, 5, '0'));
    IF auth.uid() IS NOT NULL THEN
      NEW.status := 'new';
      NEW.rating := NULL; NEW.rating_comment := NULL; NEW.rated_at := NULL;
      NEW.rated_staff_id := NULL; NEW.rated_staff_name := NULL;
    END IF;
    NEW.last_reply_at := coalesce(NEW.last_reply_at, now());
    RETURN NEW;
  END IF;

  -- trusted server-side paths (service role or migration owner)
  IF auth.uid() IS NULL
     AND (coalesce(auth.role(), '') = 'service_role' OR session_user IN ('postgres', 'supabase_admin')) THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF private.has_platform_permission(auth.uid(), 'tickets.reply') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  IF OLD.status <> 'closed' THEN
    RAISE EXCEPTION 'TICKET_NOT_CLOSED' USING ERRCODE = 'P0001';
  END IF;
  IF OLD.rated_at IS NOT NULL THEN
    RAISE EXCEPTION 'TICKET_ALREADY_RATED' USING ERRCODE = 'P0001';
  END IF;
  IF NEW.rating IS NULL OR NEW.rating < 1 OR NEW.rating > 5 THEN
    RAISE EXCEPTION 'INVALID_RATING' USING ERRCODE = 'P0001';
  END IF;

  NEW.id := OLD.id;
  NEW.reference := OLD.reference;
  NEW.user_id := OLD.user_id;
  NEW.organization_id := OLD.organization_id;
  NEW.subject := OLD.subject;
  NEW.category := OLD.category;
  NEW.priority := OLD.priority;
  NEW.status := OLD.status;
  NEW.description := OLD.description;
  NEW.assigned_to := OLD.assigned_to;
  NEW.last_reply_at := OLD.last_reply_at;
  NEW.closed_at := OLD.closed_at;
  NEW.created_at := OLD.created_at;
  NEW.rating_comment := nullif(left(btrim(coalesce(NEW.rating_comment, '')), 1000), '');
  NEW.rated_at := now();
  NEW.rated_staff_id := OLD.assigned_to;
  NEW.rated_staff_name := (SELECT ps.full_name FROM public.platform_staff ps WHERE ps.user_id = OLD.assigned_to);
  NEW.updated_at := now();
  RETURN NEW;
END;
$guard$;

-- backfill readable numbers for existing rows
UPDATE public.support_tickets
   SET ticket_number = 'MEH-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0')
 WHERE ticket_number IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_ticket_number_key ON public.support_tickets (ticket_number);
CREATE UNIQUE INDEX IF NOT EXISTS support_tickets_source_thread_key
  ON public.support_tickets (source_email_thread_id) WHERE source_email_thread_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON public.support_tickets (status, last_reply_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_org_idx ON public.support_tickets (organization_id);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx ON public.support_tickets (assigned_to);
CREATE INDEX IF NOT EXISTS support_tickets_team_idx ON public.support_tickets (team_id);
CREATE INDEX IF NOT EXISTS support_tickets_sla_idx ON public.support_tickets (sla_state, due_resolution_at);

CREATE OR REPLACE FUNCTION public.support_tickets_assign_number()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.ticket_number IS NULL THEN
    NEW.ticket_number := 'MEH-' || lpad(nextval('public.support_ticket_number_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS support_tickets_number ON public.support_tickets;
CREATE TRIGGER support_tickets_number BEFORE INSERT ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.support_tickets_assign_number();

-- tickets are never hard-deleted
DROP TRIGGER IF EXISTS support_tickets_no_delete ON public.support_tickets;
CREATE TRIGGER support_tickets_no_delete BEFORE DELETE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 9) unified timeline events (insert-only)
CREATE TABLE IF NOT EXISTS public.support_ticket_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  actor_id uuid,
  actor_name text,
  actor_kind text NOT NULL DEFAULT 'staff',
  value_before jsonb,
  value_after jsonb,
  reason text,
  email_message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  internal_note_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_event_actor_kind CHECK (actor_kind IN ('staff','customer','system'))
);
GRANT ALL ON public.support_ticket_events TO service_role;
ALTER TABLE public.support_ticket_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx ON public.support_ticket_events (ticket_id, created_at);
DROP TRIGGER IF EXISTS support_ticket_events_immutable ON public.support_ticket_events;
CREATE TRIGGER support_ticket_events_immutable BEFORE UPDATE ON public.support_ticket_events
FOR EACH ROW EXECUTE FUNCTION public.deny_update();
DROP TRIGGER IF EXISTS support_ticket_events_no_delete ON public.support_ticket_events;
CREATE TRIGGER support_ticket_events_no_delete BEFORE DELETE ON public.support_ticket_events
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 10) internal notes (never sent to the customer)
CREATE TABLE IF NOT EXISTS public.support_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  author_id uuid,
  author_name text NOT NULL,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_internal_notes_body CHECK (length(btrim(body)) > 0)
);
GRANT ALL ON public.support_internal_notes TO service_role;
ALTER TABLE public.support_internal_notes ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_internal_notes_ticket_idx ON public.support_internal_notes (ticket_id, created_at);
DROP TRIGGER IF EXISTS support_internal_notes_no_delete ON public.support_internal_notes;
CREATE TRIGGER support_internal_notes_no_delete BEFORE DELETE ON public.support_internal_notes
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 11) SLA events (insert-only)
CREATE TABLE IF NOT EXISTS public.support_sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  event_type text NOT NULL,
  metric text NOT NULL DEFAULT 'resolution',
  policy_id uuid REFERENCES public.support_sla_policies(id) ON DELETE SET NULL,
  due_at timestamptz,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  paused_seconds integer,
  reason text NOT NULL DEFAULT '',
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_sla_event_type CHECK (event_type IN ('started','paused','resumed','warning','critical','breached','met','recalculated')),
  CONSTRAINT support_sla_event_metric CHECK (metric IN ('first_response','resolution'))
);
GRANT ALL ON public.support_sla_events TO service_role;
ALTER TABLE public.support_sla_events ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_sla_events_ticket_idx ON public.support_sla_events (ticket_id, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS support_sla_events_once_idx
  ON public.support_sla_events (ticket_id, metric, event_type)
  WHERE event_type IN ('warning','critical','breached','met');
DROP TRIGGER IF EXISTS support_sla_events_immutable ON public.support_sla_events;
CREATE TRIGGER support_sla_events_immutable BEFORE UPDATE ON public.support_sla_events
FOR EACH ROW EXECUTE FUNCTION public.deny_update();
DROP TRIGGER IF EXISTS support_sla_events_no_delete ON public.support_sla_events;
CREATE TRIGGER support_sla_events_no_delete BEFORE DELETE ON public.support_sla_events
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

-- 12) escalation rules
CREATE TABLE IF NOT EXISTS public.support_escalation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ar text NOT NULL,
  trigger_type text NOT NULL,
  priority public.ticket_priority,
  category text,
  channel text,
  from_level smallint NOT NULL DEFAULT 0,
  to_level smallint NOT NULL DEFAULT 1,
  target_team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  target_user_id uuid,
  notify_manager boolean NOT NULL DEFAULT true,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_escalation_trigger CHECK (trigger_type IN ('sla_warning','sla_breach','priority','category','manual')),
  CONSTRAINT support_escalation_levels CHECK (to_level > from_level AND to_level <= 3)
);
GRANT ALL ON public.support_escalation_rules TO service_role;
ALTER TABLE public.support_escalation_rules ENABLE ROW LEVEL SECURITY;

-- 13) CSAT invitations (secure, single-use, expiring)
CREATE TABLE IF NOT EXISTS public.support_csat_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES public.support_tickets(id) ON DELETE RESTRICT,
  token_hash text NOT NULL UNIQUE,
  recipient_email text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  rating smallint,
  comment text,
  staff_id uuid,
  team_id uuid REFERENCES public.support_teams(id) ON DELETE SET NULL,
  category text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_csat_rating CHECK (rating IS NULL OR rating BETWEEN 1 AND 5)
);
GRANT ALL ON public.support_csat_invitations TO service_role;
ALTER TABLE public.support_csat_invitations ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS support_csat_open_per_ticket
  ON public.support_csat_invitations (ticket_id) WHERE used_at IS NULL;

-- 14) inbound ingest ledger (idempotency for email -> ticket)
CREATE TABLE IF NOT EXISTS public.support_ticket_ingest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key text NOT NULL UNIQUE,
  email_message_id uuid REFERENCES public.email_messages(id) ON DELETE SET NULL,
  thread_id uuid REFERENCES public.email_threads(id) ON DELETE SET NULL,
  ticket_id uuid REFERENCES public.support_tickets(id) ON DELETE SET NULL,
  outcome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_ingest_outcome CHECK (outcome IN ('created','appended','skipped'))
);
GRANT ALL ON public.support_ticket_ingest TO service_role;
ALTER TABLE public.support_ticket_ingest ENABLE ROW LEVEL SECURITY;

-- 15) link email messages to tickets (column already exists) — index it
CREATE INDEX IF NOT EXISTS email_messages_ticket_idx ON public.email_messages (ticket_id);
CREATE INDEX IF NOT EXISTS email_threads_ticket_idx ON public.email_threads (ticket_id);

-- 16) updated_at triggers
DROP TRIGGER IF EXISTS support_teams_touch ON public.support_teams;
CREATE TRIGGER support_teams_touch BEFORE UPDATE ON public.support_teams
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS support_categories_touch ON public.support_categories;
CREATE TRIGGER support_categories_touch BEFORE UPDATE ON public.support_categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS support_sla_policies_touch ON public.support_sla_policies;
CREATE TRIGGER support_sla_policies_touch BEFORE UPDATE ON public.support_sla_policies
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS support_escalation_rules_touch ON public.support_escalation_rules;
CREATE TRIGGER support_escalation_rules_touch BEFORE UPDATE ON public.support_escalation_rules
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS support_calendars_touch ON public.support_business_calendars;
CREATE TRIGGER support_calendars_touch BEFORE UPDATE ON public.support_business_calendars
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 17) foundation data
INSERT INTO public.support_business_calendars (code, name_ar, timezone, work_days, start_minute, end_minute)
VALUES ('ksa_default', 'ساعات العمل الرسمية — الرياض', 'Asia/Riyadh', '{0,1,2,3,4}', 480, 1020)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.support_business_calendars (code, name_ar, timezone, work_days, start_minute, end_minute)
VALUES ('ksa_24_7', 'دعم على مدار الساعة', 'Asia/Riyadh', '{0,1,2,3,4,5,6}', 0, 1440)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.support_holidays (calendar_id, holiday_date, name_ar)
SELECT c.id, d.dt, d.nm
  FROM public.support_business_calendars c
  CROSS JOIN (VALUES
    (DATE '2026-09-23', 'اليوم الوطني السعودي'),
    (DATE '2027-02-22', 'يوم التأسيس'),
    (DATE '2027-03-09', 'عيد الفطر'),
    (DATE '2027-03-10', 'عيد الفطر'),
    (DATE '2027-05-16', 'عيد الأضحى'),
    (DATE '2027-05-17', 'عيد الأضحى')
  ) AS d(dt, nm)
 WHERE c.code = 'ksa_default'
ON CONFLICT (calendar_id, holiday_date) DO NOTHING;

INSERT INTO public.support_teams (code, name_ar, description, is_default)
VALUES
  ('frontline', 'الدعم الأول', 'استلام التذاكر والرد الأولي', true),
  ('technical', 'الدعم التقني', 'المشكلات التقنية والأعطال', false),
  ('billing', 'الفوترة والاشتراكات', 'الفواتير والمدفوعات والباقات', false),
  ('escalations', 'وحدة التصعيد', 'الحالات المصعّدة وخروقات المهل', false)
ON CONFLICT (code) DO NOTHING;

UPDATE public.support_teams t
   SET escalation_team_id = (SELECT id FROM public.support_teams WHERE code = 'escalations')
 WHERE t.code IN ('frontline','technical','billing') AND t.escalation_team_id IS NULL;

UPDATE public.support_teams t
   SET mailbox_id = m.id
  FROM public.email_mailboxes m
 WHERE t.mailbox_id IS NULL
   AND ((t.code = 'billing' AND m.address LIKE 'billing@%') OR (t.code <> 'billing' AND m.address LIKE 'support@%'));

INSERT INTO public.support_sla_policies
  (code, name_ar, calendar_id, plan_code, priority, channel, category, first_response_minutes, resolution_minutes, specificity)
SELECT v.code, v.name_ar, c.id, v.plan_code, v.priority::public.ticket_priority, v.channel, v.category, v.frm, v.res, v.spec
  FROM (VALUES
    ('default',        'السياسة الافتراضية',        NULL::text, NULL::text, NULL::text, NULL::text, 240, 1440, 0),
    ('priority_high',  'أولوية عالية',              NULL,       'high',     NULL,       NULL,       120, 720,  2),
    ('priority_urgent','أولوية عاجلة',              NULL,       'urgent',   NULL,       NULL,       30,  240,  2),
    ('channel_email',  'القناة: البريد',            NULL,       NULL,       'email',    NULL,       240, 1440, 1)
  ) AS v(code, name_ar, plan_code, priority, channel, category, frm, res, spec)
  CROSS JOIN public.support_business_calendars c
 WHERE c.code = 'ksa_default'
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.support_categories (code, name_ar, default_priority, sort_order)
VALUES
  ('general', 'استفسار عام', 'medium', 1),
  ('technical', 'مشكلة تقنية', 'high', 2),
  ('billing', 'الفوترة والاشتراك', 'medium', 3),
  ('feature', 'طلب ميزة', 'low', 4),
  ('account', 'الحساب والصلاحيات', 'medium', 5),
  ('data', 'البيانات والمستندات', 'high', 6)
ON CONFLICT (code) DO NOTHING;

UPDATE public.support_categories c SET default_team_id = t.id
  FROM public.support_teams t
 WHERE c.default_team_id IS NULL
   AND ((c.code IN ('technical','data') AND t.code = 'technical')
     OR (c.code = 'billing' AND t.code = 'billing')
     OR (c.code IN ('general','feature','account') AND t.code = 'frontline'));

INSERT INTO public.support_escalation_rules (name_ar, trigger_type, priority, from_level, to_level, target_team_id, sort_order)
SELECT 'تصعيد تلقائي عند خرق مهلة الحل', 'sla_breach', NULL, 0, 1, t.id, 1
  FROM public.support_teams t WHERE t.code = 'escalations'
   AND NOT EXISTS (SELECT 1 FROM public.support_escalation_rules WHERE trigger_type = 'sla_breach' AND from_level = 0);

INSERT INTO public.support_escalation_rules (name_ar, trigger_type, priority, from_level, to_level, target_team_id, sort_order)
SELECT 'تصعيد التذاكر العاجلة', 'priority', 'urgent', 0, 1, t.id, 2
  FROM public.support_teams t WHERE t.code = 'escalations'
   AND NOT EXISTS (SELECT 1 FROM public.support_escalation_rules WHERE trigger_type = 'priority' AND priority = 'urgent');

INSERT INTO public.support_tags (name_ar, color)
VALUES ('عميل مهم', 'gold'), ('عطل مؤكد', 'red'), ('يحتاج متابعة', 'amber'), ('استفسار متكرر', 'blue')
ON CONFLICT (name_ar) DO NOTHING;

-- ============================================================
-- 20260804214231_cfd03e4b-59fb-42d6-96ad-7143c06a785e.sql
-- ============================================================
-- 1) توحيد القنوات مع محرك الدعم
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_channel_check;
UPDATE public.support_tickets SET channel = 'portal' WHERE channel = 'web_form';
UPDATE public.support_tickets SET channel = 'internal' WHERE channel = 'manual';
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_channel_check
  CHECK (channel = ANY (ARRAY['email','portal','phone','internal','whatsapp','chat']));

-- 2) توحيد حالة المهلة
ALTER TABLE public.support_tickets DROP CONSTRAINT IF EXISTS support_tickets_sla_state_check;
UPDATE public.support_tickets SET sla_state = 'ok' WHERE sla_state = 'on_track';
ALTER TABLE public.support_tickets ALTER COLUMN sla_state SET DEFAULT 'ok';
ALTER TABLE public.support_tickets
  ADD CONSTRAINT support_tickets_sla_state_check
  CHECK (sla_state = ANY (ARRAY['ok','paused','warning','critical','breached','met']));

-- 3) فهارس التشغيل
CREATE INDEX IF NOT EXISTS support_tickets_status_updated_idx
  ON public.support_tickets (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS support_tickets_team_status_idx
  ON public.support_tickets (team_id, status);
CREATE INDEX IF NOT EXISTS support_tickets_assigned_status_idx
  ON public.support_tickets (assigned_to, status);
CREATE INDEX IF NOT EXISTS support_tickets_sla_state_idx
  ON public.support_tickets (sla_state) WHERE merged_into_id IS NULL;
CREATE INDEX IF NOT EXISTS support_tickets_org_idx
  ON public.support_tickets (organization_id);
CREATE INDEX IF NOT EXISTS support_tickets_thread_idx
  ON public.support_tickets (source_email_thread_id);
CREATE INDEX IF NOT EXISTS support_ticket_events_ticket_idx
  ON public.support_ticket_events (ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS support_sla_events_ticket_idx
  ON public.support_sla_events (ticket_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS support_csat_invitations_ticket_idx
  ON public.support_csat_invitations (ticket_id);
-- ============================================================
-- 20260804225403_aec40418-af46-473c-9b60-407b4dbe95ac.sql
-- ============================================================
-- ============ 1) إعدادات المزامنة على الصناديق
ALTER TABLE public.email_mailboxes
  ADD COLUMN IF NOT EXISTS sync_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS imap_folders jsonb NOT NULL DEFAULT '["INBOX"]'::jsonb,
  ADD COLUMN IF NOT EXISTS credential_key text,
  ADD COLUMN IF NOT EXISTS reply_to text;

-- ============ 2) بصمة IMAP على الرسائل (منع التكرار)
ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS imap_uid bigint,
  ADD COLUMN IF NOT EXISTS imap_folder text,
  ADD COLUMN IF NOT EXISTS imap_uidvalidity bigint;

CREATE UNIQUE INDEX IF NOT EXISTS email_messages_imap_identity_uq
  ON public.email_messages (mailbox_id, imap_folder, imap_uidvalidity, imap_uid)
  WHERE imap_uid IS NOT NULL;

-- ============ 3) حالة المزامنة لكل (صندوق، مجلد)
CREATE TABLE IF NOT EXISTS public.email_sync_state (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mailbox_id uuid NOT NULL REFERENCES public.email_mailboxes(id) ON DELETE CASCADE,
  folder text NOT NULL,
  local_folder text NOT NULL DEFAULT 'inbox',
  uidvalidity bigint,
  last_uid bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'idle',
  locked_at timestamptz,
  lock_token text,
  last_sync_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  last_error_code text,
  last_error_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  messages_synced integer NOT NULL DEFAULT 0,
  new_messages integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, folder)
);

GRANT ALL ON public.email_sync_state TO service_role;
ALTER TABLE public.email_sync_state ENABLE ROW LEVEL SECURITY;

-- ============ 4) سجل عمليات المزامنة
CREATE TABLE IF NOT EXISTS public.email_sync_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mailbox_id uuid NOT NULL REFERENCES public.email_mailboxes(id) ON DELETE CASCADE,
  folder text NOT NULL,
  trigger_source text NOT NULL DEFAULT 'cron',
  outcome text NOT NULL,
  fetched integer NOT NULL DEFAULT 0,
  ingested integer NOT NULL DEFAULT 0,
  duplicates integer NOT NULL DEFAULT 0,
  rejected integer NOT NULL DEFAULT 0,
  tickets_created integer NOT NULL DEFAULT 0,
  reindexed boolean NOT NULL DEFAULT false,
  error_code text,
  error_message text,
  duration_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_sync_runs_mailbox_idx
  ON public.email_sync_runs (mailbox_id, created_at DESC);

GRANT ALL ON public.email_sync_runs TO service_role;
ALTER TABLE public.email_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER email_sync_state_updated_at
  BEFORE UPDATE ON public.email_sync_state
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ 5) قاعدة قراءة صريحة لمستودع المستندات
CREATE POLICY docs_storage_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'documents'
    AND private.has_organization_role(
      ((storage.foldername(name))[1])::uuid,
      auth.uid(),
      ARRAY['owner'::app_role, 'admin'::app_role, 'lawyer'::app_role, 'legal_assistant'::app_role, 'viewer'::app_role]
    )
  );
-- ============================================================
-- 20260804231507_edd4dc61-3bc2-4ebf-9e49-071fefb8f8d8.sql
-- ============================================================
ALTER TABLE public.email_mailboxes
  ADD COLUMN IF NOT EXISTS agentic_mailbox_id text,
  ADD COLUMN IF NOT EXISTS agentic_link_status text NOT NULL DEFAULT 'unlinked',
  ADD COLUMN IF NOT EXISTS agentic_unread_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS agentic_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS agentic_last_error text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_mailboxes'::regclass AND conname = 'email_mailboxes_agentic_link_status_check'
  ) THEN
    ALTER TABLE public.email_mailboxes
      ADD CONSTRAINT email_mailboxes_agentic_link_status_check
      CHECK (agentic_link_status IN ('unlinked', 'linked', 'missing'));
  END IF;
END $$;

ALTER TABLE public.email_sync_state
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'imap',
  ADD COLUMN IF NOT EXISTS provider_cursor text,
  ADD COLUMN IF NOT EXISTS provider_folder_id text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_sync_state'::regclass AND conname = 'email_sync_state_provider_check'
  ) THEN
    ALTER TABLE public.email_sync_state
      ADD CONSTRAINT email_sync_state_provider_check CHECK (provider IN ('imap', 'agentic_mail'));
  END IF;
END $$;

ALTER TABLE public.email_sync_state DROP CONSTRAINT IF EXISTS email_sync_state_mailbox_id_folder_key;

CREATE UNIQUE INDEX IF NOT EXISTS email_sync_state_mailbox_provider_folder_key
  ON public.email_sync_state (mailbox_id, provider, folder);

ALTER TABLE public.email_sync_runs
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'imap';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.email_sync_runs'::regclass AND conname = 'email_sync_runs_provider_check'
  ) THEN
    ALTER TABLE public.email_sync_runs
      ADD CONSTRAINT email_sync_runs_provider_check CHECK (provider IN ('imap', 'agentic_mail'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS email_mailboxes_agentic_mailbox_id_idx
  ON public.email_mailboxes (agentic_mailbox_id) WHERE agentic_mailbox_id IS NOT NULL;
-- ============================================================
-- 20260805003531_f3968c1b-f6ed-4f80-b2ff-c9b093ed70b2.sql
-- ============================================================
UPDATE public.sms_settings SET code_ttl_minutes = 10, resend_wait_seconds = 60 WHERE code_ttl_minutes <> 10 OR resend_wait_seconds <> 60;
-- ============================================================
-- 20260805003848_b9e281a9-3588-411b-b3ba-61cabaed75f7.sql
-- ============================================================
ALTER TABLE public.email_mailboxes DROP CONSTRAINT email_mailboxes_agentic_link_status_check;
ALTER TABLE public.email_mailboxes ADD CONSTRAINT email_mailboxes_agentic_link_status_check
  CHECK (agentic_link_status = ANY (ARRAY['unlinked','linked','missing','alias']));

UPDATE public.email_mailboxes
   SET agentic_link_status = 'alias', sync_enabled = false
 WHERE type = 'human' AND agentic_mailbox_id IS NULL;

UPDATE public.email_mailboxes
   SET sync_enabled = true
 WHERE type = 'system' AND agentic_mailbox_id IS NOT NULL;
