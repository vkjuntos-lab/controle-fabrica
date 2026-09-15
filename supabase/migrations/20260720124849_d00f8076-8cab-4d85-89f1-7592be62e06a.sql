ALTER TABLE public.loyalty_accounts
  ADD COLUMN IF NOT EXISTS last_expiry_notice_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_tier_notice_tier TEXT;

-- pg_cron para varrer expiração de pontos e enviar avisos a cada 6h
DO $$
DECLARE
  base_url TEXT := 'https://project--2bff89e1-7464-48ef-a026-6814e05c6ee1.lovable.app';
  secret TEXT;
BEGIN
  SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'CRON_SECRET' LIMIT 1;
  IF secret IS NULL THEN
    SELECT decrypted_secret INTO secret FROM vault.decrypted_secrets WHERE name = 'MP_WEBHOOK_SECRET' LIMIT 1;
  END IF;
  IF secret IS NULL THEN RETURN; END IF;

  PERFORM cron.unschedule('bella-loyalty-tick') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'bella-loyalty-tick');
  PERFORM cron.schedule(
    'bella-loyalty-tick', '17 */6 * * *',
    format($cmd$SELECT net.http_post(url:=%L, headers:=jsonb_build_object('content-type','application/json','x-cron-secret',%L), body:='{}'::jsonb) as request_id;$cmd$,
           base_url || '/api/public/bella-loyalty-tick', secret)
  );
END $$;