ALTER TABLE public.wa_settings
  ADD COLUMN IF NOT EXISTS fb_page_id text,
  ADD COLUMN IF NOT EXISTS fb_token text,
  ADD COLUMN IF NOT EXISTS fb_app_id text,
  ADD COLUMN IF NOT EXISTS fb_token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS fb_active boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wa_settings_fb_page_id
  ON public.wa_settings (fb_page_id) WHERE fb_page_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fb_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  direction text NOT NULL DEFAULT 'inbound',
  status text NOT NULL DEFAULT 'ok',
  http_status integer,
  signature_valid boolean,
  event_type text,
  sender_id text,
  recipient_id text,
  error text,
  request jsonb,
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fb_logs_created ON public.fb_webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fb_logs_store ON public.fb_webhook_logs (store_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fb_webhook_logs TO authenticated;
GRANT ALL ON public.fb_webhook_logs TO service_role;

ALTER TABLE public.fb_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fb_logs manage manager" ON public.fb_webhook_logs
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.store_id = fb_webhook_logs.store_id
        AND ur.role = 'manager'::app_role
    ))
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR (store_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.store_id = fb_webhook_logs.store_id
        AND ur.role = 'manager'::app_role
    ))
  );