DO $$
DECLARE rid bigint; n int;
BEGIN
  UPDATE public.notification_email_queue
  SET status = 'queued', attempts = 0, last_error_code = null, last_error_message = null, updated_at = now()
  WHERE status = 'failed';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'rows_requeued=%', n;

  SELECT net.http_post(
    url := 'https://mehlalex.com/api/public/hooks/notification-emails',
    headers := jsonb_build_object('Content-Type','application/json','x-mehla-cron-secret', ops.cron_secret()),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) INTO rid;
  RAISE NOTICE 'worker_request_id=%', rid;
END $$;