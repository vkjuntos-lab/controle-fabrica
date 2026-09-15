CREATE TABLE IF NOT EXISTS public.bella_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','instagram')),
  contact TEXT NOT NULL,
  name TEXT,
  interest TEXT,
  stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','qualified','negotiating','won','lost','handoff')),
  reason TEXT,
  last_interaction_at TIMESTAMPTZ,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bella_leads TO authenticated;
GRANT ALL ON public.bella_leads TO service_role;
ALTER TABLE public.bella_leads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bella_leads_admin_all" ON public.bella_leads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "bella_leads_manager" ON public.bella_leads
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE INDEX IF NOT EXISTS bella_leads_store_stage_idx ON public.bella_leads(store_id, stage);
CREATE INDEX IF NOT EXISTS bella_leads_contact_idx ON public.bella_leads(store_id, contact);

CREATE TRIGGER bella_leads_updated_at
  BEFORE UPDATE ON public.bella_leads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.bella_campaign_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  campaign_type TEXT NOT NULL CHECK (campaign_type IN ('cart_recovery','birthday','inactive','launch','replenishment')),
  channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp','instagram')),
  stage INT,
  coupon_code TEXT,
  message_text TEXT,
  send_ok BOOLEAN NOT NULL DEFAULT false,
  send_error TEXT,
  meta JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bella_campaign_runs TO authenticated;
GRANT ALL ON public.bella_campaign_runs TO service_role;
ALTER TABLE public.bella_campaign_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bella_campaign_runs_admin_all" ON public.bella_campaign_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "bella_campaign_runs_manager" ON public.bella_campaign_runs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'manager'));

CREATE INDEX IF NOT EXISTS bella_campaign_runs_store_type_idx
  ON public.bella_campaign_runs(store_id, campaign_type, created_at DESC);

ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS cart_recovery_stage INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cart_recovery_last_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS wa_conversations_recovery_idx
  ON public.wa_conversations(store_id, cart_recovery_stage, last_inbound_at);
