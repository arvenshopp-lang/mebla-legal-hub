CREATE OR REPLACE FUNCTION public.verify_cron_secret(candidate text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, ops, extensions, pg_temp
AS $$
DECLARE
  stored text;
  stored_digest bytea;
  candidate_digest bytea;
  diff integer := 0;
  i integer;
BEGIN
  IF candidate IS NULL OR length(candidate) = 0 THEN
    RETURN false;
  END IF;

  SELECT secret INTO stored FROM ops.runtime_secrets WHERE name = 'cron_secret';
  IF stored IS NULL THEN
    RETURN false;
  END IF;

  -- fixed-length sha256 digests: 32 bytes each, so the loop below always runs
  -- exactly 32 iterations regardless of the candidate value or length.
  stored_digest := digest(stored, 'sha256');
  candidate_digest := digest(candidate, 'sha256');

  FOR i IN 0..31 LOOP
    diff := diff | (get_byte(stored_digest, i) # get_byte(candidate_digest, i));
  END LOOP;

  RETURN diff = 0;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;