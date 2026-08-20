DO $$ BEGIN
  CREATE TYPE public.document_security_state_kind AS ENUM (
    'uploaded','quarantined','scanning','clean','malicious','unscannable','failed','released'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.document_security_state (
  document_id uuid PRIMARY KEY REFERENCES public.documents(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  state public.document_security_state_kind NOT NULL DEFAULT 'uploaded',
  sha256 text,
  bytes bigint,
  declared_mime text,
  detected_mime text,
  decision_id uuid,
  decided_at timestamptz,
  reason text,
  correlation_id uuid,
  scan_attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_security_state_org_idx
  ON public.document_security_state (organization_id, state);

GRANT SELECT ON public.document_security_state TO authenticated;
GRANT ALL ON public.document_security_state TO service_role;
ALTER TABLE public.document_security_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read document security state" ON public.document_security_state;
CREATE POLICY "org members read document security state"
ON public.document_security_state FOR SELECT TO authenticated
USING (private.is_organization_member(organization_id, auth.uid()));

CREATE TABLE IF NOT EXISTS public.document_security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid,
  organization_id uuid,
  actor_id uuid,
  action text NOT NULL,
  purpose text,
  result text NOT NULL,
  reason text,
  from_state public.document_security_state_kind,
  to_state public.document_security_state_kind,
  sha256 text,
  correlation_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS document_security_events_doc_idx
  ON public.document_security_events (document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS document_security_events_org_idx
  ON public.document_security_events (organization_id, created_at DESC);

GRANT SELECT ON public.document_security_events TO authenticated;
GRANT ALL ON public.document_security_events TO service_role;
ALTER TABLE public.document_security_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org members read document security events" ON public.document_security_events;
CREATE POLICY "org members read document security events"
ON public.document_security_events FOR SELECT TO authenticated
USING (organization_id IS NOT NULL AND private.is_organization_member(organization_id, auth.uid()));

DROP TRIGGER IF EXISTS document_security_events_no_update ON public.document_security_events;
CREATE TRIGGER document_security_events_no_update
BEFORE UPDATE ON public.document_security_events
FOR EACH ROW EXECUTE FUNCTION public.deny_update();

DROP TRIGGER IF EXISTS document_security_events_no_delete ON public.document_security_events;
CREATE TRIGGER document_security_events_no_delete
BEFORE DELETE ON public.document_security_events
FOR EACH ROW EXECUTE FUNCTION public.deny_hard_delete();

CREATE OR REPLACE FUNCTION public.document_security_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  IF NEW.state = OLD.state THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  allowed := CASE OLD.state
    WHEN 'uploaded'    THEN NEW.state IN ('quarantined','failed')
    WHEN 'quarantined' THEN NEW.state IN ('scanning','failed','malicious','unscannable')
    WHEN 'scanning'    THEN NEW.state IN ('clean','malicious','unscannable','failed','quarantined')
    WHEN 'clean'       THEN NEW.state IN ('released','quarantined','malicious')
    WHEN 'released'    THEN NEW.state IN ('quarantined','malicious')
    WHEN 'unscannable' THEN NEW.state IN ('quarantined','scanning','malicious')
    WHEN 'failed'      THEN NEW.state IN ('quarantined','scanning')
    WHEN 'malicious'   THEN false
    ELSE false
  END;

  IF NOT allowed THEN
    RAISE EXCEPTION 'forbidden document security transition: % -> %', OLD.state, NEW.state
      USING ERRCODE = '42501';
  END IF;

  IF NEW.state = 'released' AND (NEW.sha256 IS NULL OR NEW.decision_id IS NULL) THEN
    RAISE EXCEPTION 'release requires content hash and decision id'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'document security state cannot change organization'
      USING ERRCODE = '42501';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS document_security_state_guard ON public.document_security_state;
CREATE TRIGGER document_security_state_guard
BEFORE UPDATE ON public.document_security_state
FOR EACH ROW EXECUTE FUNCTION public.document_security_transition_guard();

CREATE OR REPLACE FUNCTION private.transition_document_security_state(
  _document_id uuid,
  _organization_id uuid,
  _next_state public.document_security_state_kind,
  _sha256 text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _correlation_id uuid DEFAULT NULL,
  _actor_id uuid DEFAULT NULL
)
RETURNS public.document_security_state_kind
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, pg_temp
AS $$
DECLARE
  current_row public.document_security_state;
  new_decision uuid;
BEGIN
  SELECT * INTO current_row
  FROM public.document_security_state
  WHERE document_id = _document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'document security state not found' USING ERRCODE = '42501';
  END IF;

  IF current_row.organization_id <> _organization_id THEN
    INSERT INTO public.document_security_events
      (document_id, organization_id, actor_id, action, result, reason, correlation_id)
    VALUES (_document_id, current_row.organization_id, _actor_id,
            'transition', 'denied', 'cross_tenant_attempt', _correlation_id);
    RAISE EXCEPTION 'organization mismatch' USING ERRCODE = '42501';
  END IF;

  new_decision := CASE WHEN _next_state = 'released' THEN gen_random_uuid() ELSE current_row.decision_id END;

  UPDATE public.document_security_state
  SET state = _next_state,
      sha256 = COALESCE(_sha256, sha256),
      reason = _reason,
      correlation_id = COALESCE(_correlation_id, correlation_id),
      decision_id = new_decision,
      decided_at = CASE WHEN _next_state IN ('released','malicious','clean','unscannable') THEN now() ELSE decided_at END,
      scan_attempts = CASE WHEN _next_state = 'scanning' THEN scan_attempts + 1 ELSE scan_attempts END
  WHERE document_id = _document_id;

  INSERT INTO public.document_security_events
    (document_id, organization_id, actor_id, action, result, reason,
     from_state, to_state, sha256, correlation_id)
  VALUES (_document_id, _organization_id, _actor_id, 'transition', 'allowed', _reason,
          current_row.state, _next_state, COALESCE(_sha256, current_row.sha256), _correlation_id);

  RETURN _next_state;
END;
$$;

REVOKE ALL ON FUNCTION private.transition_document_security_state(uuid, uuid, public.document_security_state_kind, text, text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.transition_document_security_state(uuid, uuid, public.document_security_state_kind, text, text, uuid, uuid) TO service_role;

INSERT INTO public.document_security_state
  (document_id, organization_id, state, bytes, declared_mime, decision_id, decided_at, reason)
SELECT d.id, d.organization_id,
       CASE WHEN d.file_status = 'AVAILABLE' THEN 'released'::public.document_security_state_kind
            ELSE 'quarantined'::public.document_security_state_kind END,
       d.file_size, d.file_type,
       CASE WHEN d.file_status = 'AVAILABLE' THEN gen_random_uuid() ELSE NULL END,
       CASE WHEN d.file_status = 'AVAILABLE' THEN now() ELSE NULL END,
       CASE WHEN d.file_status = 'AVAILABLE' THEN 'legacy_grandfathered' ELSE 'legacy_unchecked' END
FROM public.documents d
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_security_state s WHERE s.document_id = d.id
);

INSERT INTO public.document_security_events
  (document_id, organization_id, action, result, reason, to_state, metadata)
SELECT s.document_id, s.organization_id, 'backfill', 'allowed', s.reason, s.state,
       jsonb_build_object('source','migration')
FROM public.document_security_state s
WHERE s.reason IN ('legacy_grandfathered','legacy_unchecked');