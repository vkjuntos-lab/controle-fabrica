CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove agendamento anterior (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('bella-campaigns-tick');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'bella-campaigns-tick',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--2bff89e1-7464-48ef-a026-6814e05c6ee1.lovable.app/api/public/bella-campaigns-tick',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_pceiPlIn7rMxLmECzGTkyA_XAZfgSO9"}'::jsonb,
    body := '{"source": "pg_cron"}'::jsonb
  ) AS request_id;
  $$
);
