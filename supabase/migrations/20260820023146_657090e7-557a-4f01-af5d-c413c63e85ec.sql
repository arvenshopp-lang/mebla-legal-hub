ALTER TABLE public.document_security_state
  ADD COLUMN IF NOT EXISTS safe_path text,
  ADD COLUMN IF NOT EXISTS safe_sha256 text,
  ADD COLUMN IF NOT EXISTS safe_mime text,
  ADD COLUMN IF NOT EXISTS scan_findings jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS scan_engine_version text;

UPDATE public.document_security_state
SET scan_engine_version = 'legacy-structural-1'
WHERE scan_engine_version IS NULL;

CREATE OR REPLACE FUNCTION public.document_security_transition_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  IF NEW.organization_id <> OLD.organization_id THEN
    RAISE EXCEPTION 'document security row cannot change organization';
  END IF;

  IF NEW.state = OLD.state THEN
    RETURN NEW;
  END IF;

  allowed := CASE OLD.state
    WHEN 'uploaded' THEN NEW.state IN ('quarantined', 'failed')
    WHEN 'quarantined' THEN NEW.state IN ('scanning', 'malicious', 'unscannable', 'failed')
    WHEN 'scanning' THEN NEW.state IN ('clean', 'malicious', 'unscannable', 'failed', 'quarantined')
    WHEN 'clean' THEN NEW.state IN ('released', 'quarantined', 'malicious', 'failed')
    WHEN 'released' THEN NEW.state IN ('quarantined', 'malicious')
    WHEN 'failed' THEN NEW.state IN ('quarantined', 'scanning')
    WHEN 'unscannable' THEN NEW.state IN ('quarantined', 'scanning', 'malicious')
    WHEN 'malicious' THEN false
    ELSE false
  END;

  IF NOT allowed THEN
    RAISE EXCEPTION 'forbidden document security transition: % -> %', OLD.state, NEW.state;
  END IF;

  IF NEW.state = 'released' THEN
    IF NEW.sha256 IS NULL OR NEW.decision_id IS NULL THEN
      RAISE EXCEPTION 'release requires content hash and decision id';
    END IF;
    IF NEW.scan_engine_version IS NULL THEN
      RAISE EXCEPTION 'release requires a recorded content scan result';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;