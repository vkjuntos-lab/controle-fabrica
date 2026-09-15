CREATE TABLE IF NOT EXISTS public.webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
  provider_payment_id TEXT,
  external_ref TEXT,
  parsed_status TEXT,
  amount NUMERIC,
  method TEXT,
  raw_headers JSONB,
  raw_body TEXT,
  parsed JSONB,
  apply_status TEXT NOT NULL DEFAULT 'pending',
  apply_error TEXT,
  applied_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins/managers can view webhook events"
  ON public.webhook_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE POLICY "Admins/managers can update webhook events"
  ON public.webhook_events FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE INDEX IF NOT EXISTS webhook_events_provider_idx ON public.webhook_events(provider, received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_status_idx ON public.webhook_events(apply_status, received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_events_ref_idx ON public.webhook_events(external_ref);
CREATE INDEX IF NOT EXISTS webhook_events_provider_payment_idx ON public.webhook_events(provider_payment_id);

CREATE TRIGGER update_webhook_events_updated_at
  BEFORE UPDATE ON public.webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();