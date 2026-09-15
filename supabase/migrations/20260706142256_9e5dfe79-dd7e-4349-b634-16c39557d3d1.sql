
-- Onda N — Sprints N3 (Campanhas) e N4 (Cupons)

CREATE TYPE public.campaign_channel AS ENUM ('wa','email','inapp');
CREATE TYPE public.campaign_status AS ENUM ('draft','scheduled','running','done','failed');
CREATE TYPE public.campaign_trigger AS ENUM ('manual','birthday','inactive60','tier_upgrade');
CREATE TYPE public.coupon_kind AS ENUM ('percent','fixed','shipping');

CREATE TABLE public.campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  segment_key TEXT NOT NULL DEFAULT 'all',
  channel public.campaign_channel NOT NULL DEFAULT 'wa',
  trigger public.campaign_trigger NOT NULL DEFAULT 'manual',
  template TEXT NOT NULL DEFAULT '',
  scheduled_at TIMESTAMPTZ,
  status public.campaign_status NOT NULL DEFAULT 'draft',
  sent_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaigns TO authenticated;
GRANT ALL ON public.campaigns TO service_role;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaigns_auth_all" ON public.campaigns
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.campaign_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  channel public.campaign_channel NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  sent_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_campaign_deliveries_campaign ON public.campaign_deliveries(campaign_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_deliveries TO authenticated;
GRANT ALL ON public.campaign_deliveries TO service_role;
ALTER TABLE public.campaign_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "campaign_deliveries_auth_all" ON public.campaign_deliveries
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.coupons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  kind public.coupon_kind NOT NULL DEFAULT 'percent',
  value NUMERIC(12,2) NOT NULL DEFAULT 0,
  min_ticket NUMERIC(12,2) NOT NULL DEFAULT 0,
  segment_key TEXT,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  max_uses INTEGER NOT NULL DEFAULT 1,
  used_count INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;
GRANT ALL ON public.coupons TO service_role;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupons_auth_all" ON public.coupons
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  sale_id UUID,
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coupon_redemptions_coupon ON public.coupon_redemptions(coupon_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupon_redemptions TO authenticated;
GRANT ALL ON public.coupon_redemptions TO service_role;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coupon_redemptions_auth_all" ON public.coupon_redemptions
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TRIGGER trg_campaigns_updated
  BEFORE UPDATE ON public.campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_coupons_updated
  BEFORE UPDATE ON public.coupons
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
