DO $$
DECLARE rid bigint;
BEGIN
  SELECT net.http_post(
    url := 'https://mehlalex.com/api/public/hooks/resend-system-test',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-mehla-cron-secret', ops.cron_secret()
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  ) INTO rid;
  RAISE NOTICE 'request_id=%', rid;
END $$;