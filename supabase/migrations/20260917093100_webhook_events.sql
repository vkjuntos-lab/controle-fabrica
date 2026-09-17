-- Registro de eventos de webhook recebidos (idempotência + trilha de auditoria).
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL DEFAULT '',
  signature_ok boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider, event_id)
);
CREATE INDEX webhook_events_received_idx ON public.webhook_events (received_at DESC);
GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Somente o service role escreve; leitura fica para auditoria futura.
CREATE POLICY "service_role manage webhook events" ON public.webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);