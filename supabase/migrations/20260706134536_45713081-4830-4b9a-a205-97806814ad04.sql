CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.fraud_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  rule_type text NOT NULL CHECK (rule_type IN ('blocklist','velocity','high_value','new_customer_high_value','ip_reputation')),
  threshold numeric,
  window_minutes integer,
  action text NOT NULL CHECK (action IN ('block','flag','notify')) DEFAULT 'flag',
  weight integer NOT NULL DEFAULT 50,
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fraud_rules TO authenticated;
GRANT ALL ON public.fraud_rules TO service_role;
ALTER TABLE public.fraud_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read fraud_rules" ON public.fraud_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write fraud_rules" ON public.fraud_rules FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.fraud_blocklist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cpf','email','phone','ip')),
  value text NOT NULL,
  reason text,
  added_by uuid,
  auto_added boolean NOT NULL DEFAULT false,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, value, store_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fraud_blocklist TO authenticated;
GRANT ALL ON public.fraud_blocklist TO service_role;
ALTER TABLE public.fraud_blocklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read fraud_blocklist" ON public.fraud_blocklist FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write fraud_blocklist" ON public.fraud_blocklist FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_fraud_blocklist_lookup ON public.fraud_blocklist(kind, value);

CREATE TABLE public.fraud_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text,
  cpf text,
  email text,
  phone text,
  ip text,
  amount numeric,
  score integer NOT NULL DEFAULT 0,
  action_taken text NOT NULL CHECK (action_taken IN ('allow','flag','block','pending_review')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_at timestamptz,
  reviewed_by uuid,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fraud_events TO authenticated;
GRANT ALL ON public.fraud_events TO service_role;
ALTER TABLE public.fraud_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read fraud_events" ON public.fraud_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth write fraud_events" ON public.fraud_events FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE INDEX idx_fraud_events_created ON public.fraud_events(created_at DESC);
CREATE INDEX idx_fraud_events_cpf ON public.fraud_events(cpf) WHERE cpf IS NOT NULL;
CREATE INDEX idx_fraud_events_action ON public.fraud_events(action_taken);

CREATE TRIGGER trg_fraud_rules_updated
BEFORE UPDATE ON public.fraud_rules
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.fraud_rules (name, rule_type, threshold, window_minutes, action, weight, enabled, config) VALUES
  ('Blocklist CPF/email/phone/IP', 'blocklist', NULL, NULL, 'block', 100, true, '{}'::jsonb),
  ('Velocidade — 5 cobranças em 10min', 'velocity', 5, 10, 'flag', 40, true, '{}'::jsonb),
  ('Valor alto (> R$ 5.000)', 'high_value', 5000, NULL, 'flag', 30, true, '{}'::jsonb),
  ('Cliente novo + valor alto (>R$ 1.000 / <7 dias)', 'new_customer_high_value', 1000, NULL, 'flag', 50, true, '{"max_customer_age_days": 7}'::jsonb);
