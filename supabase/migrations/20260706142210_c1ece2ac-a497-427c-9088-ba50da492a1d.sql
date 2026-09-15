
-- Onda N Sprint N1: Loyalty / Fidelidade

CREATE TYPE public.loyalty_tier AS ENUM ('bronze','prata','ouro','diamante');
CREATE TYPE public.loyalty_entry_kind AS ENUM ('earn','redeem','expire','adjust');

CREATE TABLE public.loyalty_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  lifetime_points INTEGER NOT NULL DEFAULT 0,
  tier public.loyalty_tier NOT NULL DEFAULT 'bronze',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_accounts TO authenticated;
GRANT ALL ON public.loyalty_accounts TO service_role;
ALTER TABLE public.loyalty_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_accounts_auth_all" ON public.loyalty_accounts
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES public.loyalty_accounts(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  kind public.loyalty_entry_kind NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT,
  sale_id UUID,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_loyalty_ledger_account ON public.loyalty_ledger(account_id, created_at DESC);
CREATE INDEX idx_loyalty_ledger_customer ON public.loyalty_ledger(customer_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_ledger TO authenticated;
GRANT ALL ON public.loyalty_ledger TO service_role;
ALTER TABLE public.loyalty_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_ledger_auth_all" ON public.loyalty_ledger
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.loyalty_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Regra padrão',
  points_per_brl NUMERIC(10,4) NOT NULL DEFAULT 1,
  brl_per_point NUMERIC(10,4) NOT NULL DEFAULT 0.05,
  tier_bronze_threshold INTEGER NOT NULL DEFAULT 0,
  tier_prata_threshold INTEGER NOT NULL DEFAULT 500,
  tier_ouro_threshold INTEGER NOT NULL DEFAULT 2000,
  tier_diamante_threshold INTEGER NOT NULL DEFAULT 5000,
  tier_prata_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.25,
  tier_ouro_multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.5,
  tier_diamante_multiplier NUMERIC(4,2) NOT NULL DEFAULT 2.0,
  expiration_months INTEGER NOT NULL DEFAULT 12,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.loyalty_rules TO authenticated;
GRANT ALL ON public.loyalty_rules TO service_role;
ALTER TABLE public.loyalty_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "loyalty_rules_auth_all" ON public.loyalty_rules
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

INSERT INTO public.loyalty_rules (name) VALUES ('Regra padrão');

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_loyalty_accounts_updated
  BEFORE UPDATE ON public.loyalty_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_loyalty_rules_updated
  BEFORE UPDATE ON public.loyalty_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
