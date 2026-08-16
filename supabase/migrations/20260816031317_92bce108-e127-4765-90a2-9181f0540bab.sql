SELECT cron.schedule(
  'mehla-operational-reminders',
  '0 * * * *',
  $cron$
  SELECT net.http_post(
    url := 'https://project--0ac4f813-8ba3-4f48-9bc7-432613df3dae.lovable.app/api/public/hooks/operational-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-mehla-cron-secret', ops.cron_secret()),
    body := '{}'::jsonb
  ) AS request_id;
  $cron$
)
WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mehla-operational-reminders');