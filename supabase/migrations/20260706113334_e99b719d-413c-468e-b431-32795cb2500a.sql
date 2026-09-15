CREATE UNIQUE INDEX IF NOT EXISTS payment_gateways_default_per_store
  ON public.payment_gateways(store_id) WHERE is_default AND active;

ALTER TABLE public.payment_links ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'mercadopago';
ALTER TABLE public.pix_charges   ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'mercadopago';
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'mercadopago';
ALTER TABLE public.boletos       ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'mercadopago';