-- Reproduce MEHLA's production cron topology from source without embedding an
-- environment URL or a live secret. The earlier cron-auth migration creates
-- ops.runtime_secrets and the per-environment cron_secret.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION ops.cron_base_url()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, ops, pg_temp
AS $function$
DECLARE
  base_url text;
BEGIN
  SELECT btrim(secret)
  INTO base_url
  FROM ops.runtime_secrets
  WHERE name = 'cron_base_url';

  IF base_url IS NULL OR base_url = '' THEN
    RAISE EXCEPTION 'Required cron configuration "cron_base_url" is missing'
      USING ERRCODE = '22023',
            HINT = 'Set the environment-specific HTTPS origin in ops.runtime_secrets.';
  END IF;

  base_url := rtrim(base_url, '/');
  IF base_url !~ '^https://[A-Za-z0-9][A-Za-z0-9.-]*(:[0-9]{1,5})?$' THEN
    RAISE EXCEPTION 'Cron base URL must be an HTTPS origin without a path, query, or fragment'
      USING ERRCODE = '22023';
  END IF;

  RETURN base_url;
END;
$function$;

CREATE OR REPLACE FUNCTION ops.require_cron_secret()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, ops, pg_temp
AS $function$
DECLARE
  cron_secret text;
BEGIN
  SELECT ops.cron_secret() INTO cron_secret;

  IF cron_secret IS NULL OR btrim(cron_secret) = '' THEN
    RAISE EXCEPTION 'Required cron secret is missing'
      USING ERRCODE = '22023';
  END IF;

  RETURN cron_secret;
END;
$function$;

CREATE OR REPLACE FUNCTION ops.reconcile_mehla_cron_jobs()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, cron, net, ops, pg_temp
AS $function$
DECLARE
  existing_job record;
BEGIN
  -- Serialize reconciliation and remove every canonical-name occurrence before
  -- recreating the desired set. Re-running this function always converges to 4.
  PERFORM pg_advisory_xact_lock(hashtextextended('ops.reconcile_mehla_cron_jobs', 0));

  -- Validate all runtime dependencies before touching working schedules. A
  -- missing or invalid value aborts the transaction and preserves prior jobs.
  PERFORM ops.cron_base_url();
  PERFORM ops.require_cron_secret();

  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname = ANY (ARRAY[
      'mehla-cleanup-secure-artifacts',
      'mehla-email-dispatch',
      'mehla-mail-sync',
      'mehla-notifications-dispatch'
    ]::text[])
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'mehla-cleanup-secure-artifacts',
    '17 * * * *',
    $cron$
      SELECT net.http_post(
        url := ops.cron_base_url() || '/api/public/hooks/cleanup-secure-artifacts',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-mehla-cron-secret', ops.require_cron_secret()
        ),
        body := '{}'::jsonb
      );
    $cron$
  );

  PERFORM cron.schedule(
    'mehla-email-dispatch',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := ops.cron_base_url() || '/api/public/hooks/email-dispatch',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-mehla-cron-secret', ops.require_cron_secret()
        ),
        body := '{}'::jsonb
      );
    $cron$
  );

  PERFORM cron.schedule(
    'mehla-mail-sync',
    '*/5 * * * *',
    $cron$
      SELECT net.http_post(
        url := ops.cron_base_url() || '/api/public/hooks/mail-sync',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-mehla-cron-secret', ops.require_cron_secret()
        ),
        body := '{}'::jsonb
      );
    $cron$
  );

  PERFORM cron.schedule(
    'mehla-notifications-dispatch',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := ops.cron_base_url() || '/api/public/hooks/notifications-dispatch',
        headers := jsonb_build_object(
          'content-type', 'application/json',
          'x-mehla-cron-secret', ops.require_cron_secret()
        ),
        body := '{}'::jsonb
      );
    $cron$
  );
END;
$function$;

REVOKE ALL ON FUNCTION ops.cron_base_url() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION ops.require_cron_secret() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION ops.reconcile_mehla_cron_jobs() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION ops.cron_base_url() IS
  'Returns the required environment-specific HTTPS origin for MEHLA cron hooks; fails closed when absent or invalid.';
COMMENT ON FUNCTION ops.reconcile_mehla_cron_jobs() IS
  'Idempotently reconciles the four canonical MEHLA pg_cron jobs.';

SELECT ops.reconcile_mehla_cron_jobs();
