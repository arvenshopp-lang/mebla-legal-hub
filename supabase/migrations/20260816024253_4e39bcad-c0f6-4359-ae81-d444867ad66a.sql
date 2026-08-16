CREATE TABLE public.email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL,
  normalized_address text NOT NULL,
  reason text NOT NULL,
  source text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  lifted_by uuid,
  note text,
  CONSTRAINT email_suppressions_reason_check
    CHECK (reason IN ('bounce_hard', 'complaint', 'manual', 'unsubscribe')),
  CONSTRAINT email_suppressions_address_check
    CHECK (position('@' IN normalized_address) > 1),
  CONSTRAINT email_suppressions_normalized_check
    CHECK (normalized_address = lower(btrim(normalized_address))),
  CONSTRAINT email_suppressions_lift_check
    CHECK ((lifted_at IS NOT NULL) OR (lifted_by IS NULL))
);

REVOKE ALL ON public.email_suppressions FROM PUBLIC;
REVOKE ALL ON public.email_suppressions FROM anon;
REVOKE ALL ON public.email_suppressions FROM authenticated;
GRANT ALL ON public.email_suppressions TO service_role;

ALTER TABLE public.email_suppressions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_suppressions_service_only"
  ON public.email_suppressions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE UNIQUE INDEX email_suppressions_active_unique
  ON public.email_suppressions (normalized_address, reason)
  WHERE lifted_at IS NULL;

CREATE INDEX email_suppressions_active_lookup_idx
  ON public.email_suppressions (normalized_address)
  WHERE lifted_at IS NULL;

CREATE INDEX email_suppressions_created_idx
  ON public.email_suppressions (created_at DESC);

CREATE TRIGGER trg_email_suppressions_updated
  BEFORE UPDATE ON public.email_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.email_suppressions_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'سجل حجب البريد سجل تدقيقي: الحذف ممنوع.';
  END IF;

  IF NEW.id <> OLD.id
     OR NEW.normalized_address <> OLD.normalized_address
     OR NEW.address <> OLD.address
     OR NEW.reason <> OLD.reason
     OR NEW.source <> OLD.source
     OR NEW.created_at <> OLD.created_at
     OR COALESCE(NEW.created_by::text, '') <> COALESCE(OLD.created_by::text, '') THEN
    RAISE EXCEPTION 'لا يمكن تعديل بيانات حدث الحجب الأصلي.';
  END IF;

  IF OLD.lifted_at IS NOT NULL AND NEW.lifted_at IS NULL THEN
    RAISE EXCEPTION 'لا يمكن إلغاء رفع حجب مُسجَّل؛ أنشئ حجباً جديداً.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_email_suppressions_guard
  BEFORE UPDATE OR DELETE ON public.email_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.email_suppressions_guard();

COMMENT ON TABLE public.email_suppressions IS
  'حالة حجب المستلمين المملوكة لمِهلة (Hostinger): سجل تدقيقي بلا حذف، والرفع بضبط lifted_at.';