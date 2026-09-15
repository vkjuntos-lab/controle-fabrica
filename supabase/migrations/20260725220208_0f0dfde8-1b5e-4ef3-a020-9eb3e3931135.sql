
-- Logs do webhook do Instagram
CREATE TABLE IF NOT EXISTS public.ig_webhook_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NULL REFERENCES public.stores(id) ON DELETE SET NULL,
  direction TEXT NOT NULL DEFAULT 'inbound',
  status TEXT NOT NULL DEFAULT 'ok',
  http_status INTEGER NULL,
  signature_valid BOOLEAN NULL,
  event_type TEXT NULL,
  sender_id TEXT NULL,
  recipient_id TEXT NULL,
  error TEXT NULL,
  request JSONB NULL,
  response JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_webhook_logs TO authenticated;
GRANT ALL ON public.ig_webhook_logs TO service_role;
ALTER TABLE public.ig_webhook_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ig_logs view store" ON public.ig_webhook_logs FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR (store_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=ig_webhook_logs.store_id
  ))
);
CREATE POLICY "ig_logs manage manager" ON public.ig_webhook_logs FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR (store_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=ig_webhook_logs.store_id AND ur.role IN ('manager')
  ))
)
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR (store_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=ig_webhook_logs.store_id AND ur.role IN ('manager')
  ))
);

CREATE INDEX IF NOT EXISTS ig_webhook_logs_created_idx ON public.ig_webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS ig_webhook_logs_store_idx ON public.ig_webhook_logs (store_id, created_at DESC);

-- Templates de DM para Instagram
CREATE TABLE IF NOT EXISTS public.ig_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_templates TO authenticated;
GRANT ALL ON public.ig_templates TO service_role;
ALTER TABLE public.ig_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ig_templates view store" ON public.ig_templates FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=ig_templates.store_id)
);
CREATE POLICY "ig_templates manage manager" ON public.ig_templates FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=ig_templates.store_id AND ur.role IN ('manager'))
)
WITH CHECK (
  public.has_role(auth.uid(),'admin')
  OR EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.store_id=ig_templates.store_id AND ur.role IN ('manager'))
);

CREATE INDEX IF NOT EXISTS ig_templates_store_idx ON public.ig_templates (store_id);

-- Suporte a renovação de token do Instagram
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS ig_token_expires_at TIMESTAMPTZ NULL;
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS ig_app_id TEXT NULL;
