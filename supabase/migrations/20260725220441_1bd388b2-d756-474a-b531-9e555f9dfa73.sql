
ALTER TABLE public.wa_settings
  ADD COLUMN IF NOT EXISTS ig_app_id text,
  ADD COLUMN IF NOT EXISTS ig_token_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS public.ig_webhook_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NULL,
  direction text NOT NULL DEFAULT 'inbound',
  status text NOT NULL DEFAULT 'ok',
  http_status integer NULL,
  signature_valid boolean NULL,
  event_type text NULL,
  sender_id text NULL,
  recipient_id text NULL,
  error text NULL,
  request jsonb NULL,
  response jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ig_logs_created ON public.ig_webhook_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ig_logs_store ON public.ig_webhook_logs (store_id, created_at DESC);
GRANT SELECT ON public.ig_webhook_logs TO authenticated;
GRANT ALL ON public.ig_webhook_logs TO service_role;
ALTER TABLE public.ig_webhook_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ig_logs_read_by_store_manager" ON public.ig_webhook_logs;
CREATE POLICY "ig_logs_read_by_store_manager"
ON public.ig_webhook_logs
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR (store_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.store_id = ig_webhook_logs.store_id
  ))
);

CREATE TABLE IF NOT EXISTS public.ig_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  name text NOT NULL,
  body text NOT NULL,
  variables jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ig_templates TO authenticated;
GRANT ALL ON public.ig_templates TO service_role;
ALTER TABLE public.ig_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ig_templates_manage_by_store" ON public.ig_templates;
CREATE POLICY "ig_templates_manage_by_store"
ON public.ig_templates
FOR ALL TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.store_id = ig_templates.store_id
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.store_id = ig_templates.store_id
  )
);
