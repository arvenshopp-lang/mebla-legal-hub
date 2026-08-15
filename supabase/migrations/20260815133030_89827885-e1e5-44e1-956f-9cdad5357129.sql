-- ============================================================================
-- مؤشر الإنجاز التشغيلي — B3C: حماية توثيق الموافقة + حقول دعوة التأهل.
-- Follow-up migration (لا تُعدَّل الهجرة السابقة 20260815014500).
-- المصدر فقط: لا يُطبَّق قبل فتح البوابة.
-- ============================================================================

-- ============ حقول الدعوة (أقل ما يلزم — لا حالة جديدة للموافقة) ============
ALTER TABLE public.organization_ranking_settings
  ADD COLUMN IF NOT EXISTS opt_in_prompted_at timestamptz,
  ADD COLUMN IF NOT EXISTS opt_in_snoozed_until timestamptz;

COMMENT ON COLUMN public.organization_ranking_settings.opt_in_prompted_at IS
  'أول لحظة عُرضت فيها دعوة الظهور العام لمستخدم مخوّل — لا تُكتب مع كل تحميل.';
COMMENT ON COLUMN public.organization_ranking_settings.opt_in_snoozed_until IS
  'نهاية تأجيل الدعوة (30 يوماً) عند «ليس الآن» أو الإغلاق بلا اختيار.';

-- ============ حارس محدَّث: القاعدة وحدها تحدد توثيق الموافقة ============
-- المكتب يتحكم في public_opt_in فقط. أي قيمة opted_in_at/opted_in_by يرسلها
-- العميل تُستبدل بقيم موثوقة من القاعدة (now() / auth.uid()) أو تُفرَّغ.
CREATE OR REPLACE FUNCTION private.ranking_settings_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- حقول الاستثناء platform-only: لا يستطيع المكتب لمسها مهما كان دوره.
    IF (NEW.platform_excluded IS DISTINCT FROM OLD.platform_excluded
        OR NEW.exclusion_reason IS DISTINCT FROM OLD.exclusion_reason
        OR NEW.excluded_at IS DISTINCT FROM OLD.excluded_at
        OR NEW.excluded_by IS DISTINCT FROM OLD.excluded_by)
       AND v_uid IS NOT NULL
       AND NOT private.is_platform_staff(v_uid) THEN
      RAISE EXCEPTION 'استثناء الظهور العام من صلاحيات منصة مِهلة فقط.';
    END IF;

    IF NEW.public_opt_in IS TRUE AND OLD.public_opt_in IS NOT TRUE THEN
      -- false → true: توثيق موثوق من القاعدة فقط.
      NEW.opted_in_at := now();
      NEW.opted_in_by := v_uid;
    ELSIF NEW.public_opt_in IS TRUE AND OLD.public_opt_in IS TRUE THEN
      -- true → true: الحفاظ على التوثيق الأصلي بلا أي تعديل من العميل.
      NEW.opted_in_at := OLD.opted_in_at;
      NEW.opted_in_by := OLD.opted_in_by;
    ELSE
      -- بلا موافقة حالية: الحقول تمثل الموافقة الحالية، والسجل التاريخي في سجلات التدقيق.
      NEW.opted_in_at := NULL;
      NEW.opted_in_by := NULL;
    END IF;

  ELSIF TG_OP = 'INSERT' THEN
    IF NEW.platform_excluded IS TRUE AND v_uid IS NOT NULL
       AND NOT private.is_platform_staff(v_uid) THEN
      RAISE EXCEPTION 'استثناء الظهور العام من صلاحيات منصة مِهلة فقط.';
    END IF;

    IF NEW.public_opt_in IS TRUE THEN
      NEW.opted_in_at := now();
      NEW.opted_in_by := v_uid;
    ELSE
      NEW.opted_in_at := NULL;
      NEW.opted_in_by := NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;