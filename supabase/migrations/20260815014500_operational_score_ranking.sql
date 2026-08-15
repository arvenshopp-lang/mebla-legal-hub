-- ============================================================================
-- مؤشر الإنجاز التشغيلي — B3B (إعدادات ظهور المكتب) + B4 (لقطات النتيجة).
-- المصدر فقط: لا يُطبَّق قبل فتح RECOVERY GATE.
-- خصوصية افتراضية: لا مكتب يظهر عاماً إلا بموافقة صريحة (public_opt_in = false).
-- ============================================================================

-- ============ B3B: organization_ranking_settings ============
CREATE TABLE public.organization_ranking_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  public_opt_in boolean NOT NULL DEFAULT false,
  opted_in_at timestamptz,
  opted_in_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  platform_excluded boolean NOT NULL DEFAULT false,
  exclusion_reason text,
  excluded_at timestamptz,
  excluded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.organization_ranking_settings TO authenticated;
GRANT ALL ON public.organization_ranking_settings TO service_role;
ALTER TABLE public.organization_ranking_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "office members read ranking settings"
  ON public.organization_ranking_settings FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_ranking_settings.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
    )
    OR private.is_platform_staff(auth.uid())
  );

CREATE POLICY "office managers create ranking settings"
  ON public.organization_ranking_settings FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_ranking_settings.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('owner','admin')
    )
    OR private.has_platform_permission(auth.uid(), 'organizations.update')
  );

CREATE POLICY "office managers update ranking settings"
  ON public.organization_ranking_settings FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_ranking_settings.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('owner','admin')
    )
    OR private.has_platform_permission(auth.uid(), 'organizations.update')
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = organization_ranking_settings.organization_id
        AND om.user_id = auth.uid() AND om.status = 'active'
        AND om.role IN ('owner','admin')
    )
    OR private.has_platform_permission(auth.uid(), 'organizations.update')
  );

-- حقول الاستثناء platform-only: لا يستطيع المكتب لمسها مهما كان دوره.
CREATE OR REPLACE FUNCTION private.ranking_settings_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.platform_excluded IS DISTINCT FROM OLD.platform_excluded
        OR NEW.exclusion_reason IS DISTINCT FROM OLD.exclusion_reason
        OR NEW.excluded_at IS DISTINCT FROM OLD.excluded_at
        OR NEW.excluded_by IS DISTINCT FROM OLD.excluded_by)
       AND v_uid IS NOT NULL
       AND NOT private.is_platform_staff(v_uid) THEN
      RAISE EXCEPTION 'استثناء الظهور العام من صلاحيات منصة مِهلة فقط.';
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.platform_excluded IS TRUE AND v_uid IS NOT NULL
       AND NOT private.is_platform_staff(v_uid) THEN
      RAISE EXCEPTION 'استثناء الظهور العام من صلاحيات منصة مِهلة فقط.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER organization_ranking_settings_guard
  BEFORE INSERT OR UPDATE ON public.organization_ranking_settings
  FOR EACH ROW EXECUTE FUNCTION private.ranking_settings_guard();

CREATE TRIGGER organization_ranking_settings_updated_at
  BEFORE UPDATE ON public.organization_ranking_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ B4: operational_score_snapshots ============
CREATE TABLE public.operational_score_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  window_kind text NOT NULL DEFAULT 'rolling_90',
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  score integer,
  eligible boolean NOT NULL,
  ineligibility_reason text,
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb,
  sample_items integer NOT NULL DEFAULT 0,
  integrity_factor numeric(4,2) NOT NULL DEFAULT 1,
  formula_version text NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT score_snapshots_window_kind_check CHECK (window_kind IN ('rolling_90')),
  CONSTRAINT score_snapshots_score_range_check CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  CONSTRAINT score_snapshots_period_check CHECK (period_end > period_start),
  CONSTRAINT score_snapshots_eligibility_check CHECK (eligible OR score IS NULL)
);

CREATE INDEX operational_score_snapshots_org_computed_idx
  ON public.operational_score_snapshots (organization_id, computed_at DESC);
CREATE INDEX operational_score_snapshots_window_computed_idx
  ON public.operational_score_snapshots (window_kind, computed_at DESC);

-- لا وصول مباشر للزوار ولا للمكتب: القراءة الخاصة والترتيب العام عبر دوال الخادم فقط.
GRANT SELECT ON public.operational_score_snapshots TO authenticated;
GRANT ALL ON public.operational_score_snapshots TO service_role;
ALTER TABLE public.operational_score_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform staff read score snapshots"
  ON public.operational_score_snapshots FOR SELECT TO authenticated
  USING (private.is_platform_staff(auth.uid()));

-- اللقطة سجل غير قابل للتعديل: لا تحرير يدوي للنتيجة بأي دور.
CREATE TRIGGER operational_score_snapshots_no_update
  BEFORE UPDATE ON public.operational_score_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.deny_update();
