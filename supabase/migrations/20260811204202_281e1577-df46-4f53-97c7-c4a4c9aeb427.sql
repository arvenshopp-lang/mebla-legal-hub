CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS ops;

REVOKE ALL ON SCHEMA ops FROM PUBLIC;
REVOKE ALL ON SCHEMA ops FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS ops.runtime_secrets (
  name text PRIMARY KEY,
  secret text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ops.runtime_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE ops.runtime_secrets FROM PUBLIC;
REVOKE ALL ON TABLE ops.runtime_secrets FROM anon, authenticated, service_role;

INSERT INTO ops.runtime_secrets (name, secret)
VALUES ('cron_secret', encode(gen_random_bytes(48), 'hex'))
ON CONFLICT (name) DO NOTHING;

-- Returns the raw secret. Callable only by the database owner / pg_cron jobs.
CREATE OR REPLACE FUNCTION ops.cron_secret()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ops, pg_temp
AS $$
  SELECT secret FROM ops.runtime_secrets WHERE name = 'cron_secret'
$$;

REVOKE ALL ON FUNCTION ops.cron_secret() FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.cron_secret() FROM anon, authenticated, service_role;

-- Timing-safe verification exposed to the Data API for service_role only.
CREATE OR REPLACE FUNCTION public.verify_cron_secret(candidate text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, ops, extensions, pg_temp
AS $$
DECLARE
  stored text;
BEGIN
  IF candidate IS NULL OR length(candidate) = 0 THEN
    RETURN false;
  END IF;
  SELECT secret INTO stored FROM ops.runtime_secrets WHERE name = 'cron_secret';
  IF stored IS NULL THEN
    RETURN false;
  END IF;
  -- compare fixed-length digests so the comparison cost is independent of input
  RETURN digest(stored, 'sha256') = digest(candidate, 'sha256');
END;
$$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;