-- ============ CRM ============
CREATE TYPE public.crm_lead_status AS ENUM ('new','contacted','qualified','unqualified','converted','lost');
CREATE TYPE public.crm_deal_status AS ENUM ('open','won','lost','abandoned');
CREATE TYPE public.crm_activity_kind AS ENUM ('meeting','call','note','task','followup','email');
CREATE TYPE public.crm_entity_kind AS ENUM ('lead','company','contact','deal');

CREATE TABLE public.crm_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  legal_name text,
  sector text,
  city text,
  website text,
  phone text,
  email text,
  size_bracket text,
  source text,
  status text NOT NULL DEFAULT 'active',
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  owner_staff_id uuid REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_companies_name_len CHECK (char_length(btrim(name)) BETWEEN 2 AND 200),
  CONSTRAINT crm_companies_status_chk CHECK (status IN ('active','inactive','blacklisted'))
);
CREATE UNIQUE INDEX crm_companies_name_key ON public.crm_companies (lower(btrim(name)));
CREATE UNIQUE INDEX crm_companies_email_key ON public.crm_companies (lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE TABLE public.crm_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  job_title text,
  email text,
  phone text,
  is_primary boolean NOT NULL DEFAULT false,
  city text,
  notes text,
  owner_staff_id uuid REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_contacts_name_len CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 160)
);
CREATE UNIQUE INDEX crm_contacts_email_key ON public.crm_contacts (lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email) <> '';
CREATE INDEX crm_contacts_company_idx ON public.crm_contacts (company_id);

CREATE TABLE public.crm_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  company_name text,
  email text,
  phone text,
  city text,
  source text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.crm_lead_status NOT NULL DEFAULT 'new',
  score integer NOT NULL DEFAULT 0,
  owner_staff_id uuid REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  notes text,
  disqualify_reason text,
  converted_company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  converted_contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  converted_deal_id uuid,
  converted_at timestamptz,
  last_activity_at timestamptz,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_leads_name_len CHECK (char_length(btrim(full_name)) BETWEEN 2 AND 160),
  CONSTRAINT crm_leads_score_chk CHECK (score BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX crm_leads_email_key ON public.crm_leads (lower(btrim(email))) WHERE email IS NOT NULL AND btrim(email) <> '';
CREATE UNIQUE INDEX crm_leads_phone_key ON public.crm_leads (public.normalize_ar(phone)) WHERE phone IS NOT NULL AND btrim(phone) <> '';
CREATE INDEX crm_leads_status_idx ON public.crm_leads (status, created_at DESC);

CREATE TABLE public.crm_pipeline_stages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  probability integer NOT NULL DEFAULT 0,
  is_won boolean NOT NULL DEFAULT false,
  is_lost boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_stage_prob_chk CHECK (probability BETWEEN 0 AND 100)
);
CREATE UNIQUE INDEX crm_pipeline_stages_name_key ON public.crm_pipeline_stages (lower(btrim(name)));

CREATE TABLE public.crm_deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE SET NULL,
  stage_id uuid REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  status public.crm_deal_status NOT NULL DEFAULT 'open',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'SAR',
  probability integer NOT NULL DEFAULT 0,
  expected_close_date date,
  closed_at timestamptz,
  lost_reason text,
  source text,
  utm jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_staff_id uuid REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  notes text,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_deals_title_len CHECK (char_length(btrim(title)) BETWEEN 2 AND 200),
  CONSTRAINT crm_deals_amount_chk CHECK (amount >= 0),
  CONSTRAINT crm_deals_prob_chk CHECK (probability BETWEEN 0 AND 100)
);
CREATE INDEX crm_deals_stage_idx ON public.crm_deals (stage_id, status);
CREATE INDEX crm_deals_company_idx ON public.crm_deals (company_id);

ALTER TABLE public.crm_leads
  ADD CONSTRAINT crm_leads_converted_deal_fk FOREIGN KEY (converted_deal_id)
  REFERENCES public.crm_deals(id) ON DELETE SET NULL;

CREATE TABLE public.crm_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.crm_activity_kind NOT NULL,
  subject text NOT NULL,
  body text,
  entity_kind public.crm_entity_kind NOT NULL,
  lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.crm_companies(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.crm_contacts(id) ON DELETE CASCADE,
  deal_id uuid REFERENCES public.crm_deals(id) ON DELETE CASCADE,
  due_at timestamptz,
  completed_at timestamptz,
  outcome text,
  owner_staff_id uuid REFERENCES public.platform_staff(id) ON DELETE SET NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_activities_subject_len CHECK (char_length(btrim(subject)) BETWEEN 2 AND 200),
  CONSTRAINT crm_activities_target_chk CHECK (
    (entity_kind = 'lead' AND lead_id IS NOT NULL)
    OR (entity_kind = 'company' AND company_id IS NOT NULL)
    OR (entity_kind = 'contact' AND contact_id IS NOT NULL)
    OR (entity_kind = 'deal' AND deal_id IS NOT NULL)
  )
);
CREATE INDEX crm_activities_due_idx ON public.crm_activities (due_at) WHERE completed_at IS NULL;
CREATE INDEX crm_activities_lead_idx ON public.crm_activities (lead_id);
CREATE INDEX crm_activities_deal_idx ON public.crm_activities (deal_id);

-- الصلاحيات على مستوى القاعدة
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_companies TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_pipeline_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_deals TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_activities TO authenticated;
GRANT ALL ON public.crm_companies, public.crm_contacts, public.crm_leads,
  public.crm_pipeline_stages, public.crm_deals, public.crm_activities TO service_role;

ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.crm_activities ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_companies','crm_contacts','crm_leads','crm_pipeline_stages','crm_deals','crm_activities']
  LOOP
    EXECUTE format($f$
      CREATE POLICY %1$s_staff_read ON public.%1$I FOR SELECT TO authenticated
        USING (private.has_platform_permission(auth.uid(), 'crm.read'));
      CREATE POLICY %1$s_staff_insert ON public.%1$I FOR INSERT TO authenticated
        WITH CHECK (private.has_platform_permission(auth.uid(), 'crm.create'));
      CREATE POLICY %1$s_staff_update ON public.%1$I FOR UPDATE TO authenticated
        USING (private.has_platform_permission(auth.uid(), 'crm.update'))
        WITH CHECK (private.has_platform_permission(auth.uid(), 'crm.update'));
      CREATE POLICY %1$s_staff_delete ON public.%1$I FOR DELETE TO authenticated
        USING (private.has_platform_permission(auth.uid(), 'crm.delete'));
    $f$, t);
  END LOOP;
END $$;

CREATE TRIGGER crm_companies_updated BEFORE UPDATE ON public.crm_companies FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER crm_contacts_updated BEFORE UPDATE ON public.crm_contacts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER crm_leads_updated BEFORE UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER crm_stages_updated BEFORE UPDATE ON public.crm_pipeline_stages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER crm_deals_updated BEFORE UPDATE ON public.crm_deals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER crm_activities_updated BEFORE UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.crm_pipeline_stages (name, sort_order, probability, is_won, is_lost) VALUES
  ('تواصل أولي', 1, 10, false, false),
  ('تأهيل الاحتياج', 2, 25, false, false),
  ('عرض تجريبي', 3, 45, false, false),
  ('عرض سعر مُرسل', 4, 65, false, false),
  ('تفاوض وتعاقد', 5, 85, false, false),
  ('مكسوبة', 6, 100, true, false),
  ('مفقودة', 7, 0, false, true);