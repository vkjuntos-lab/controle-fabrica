-- Helper de updated_at (idempotente)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Recebedores (reaproveita customers)
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS is_recipient BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asaas_wallet_id TEXT,
  ADD COLUMN IF NOT EXISTS mp_collector_id TEXT;

CREATE INDEX IF NOT EXISTS customers_is_recipient_idx
  ON public.customers(is_recipient) WHERE is_recipient = true;

-- Regras de split por cobrança
ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS splits JSONB;
ALTER TABLE public.pix_charges
  ADD COLUMN IF NOT EXISTS splits JSONB;

-- Entradas de repasse (auditoria pós-pagamento)
CREATE TABLE IF NOT EXISTS public.payment_split_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_type TEXT NOT NULL CHECK (source_type IN ('payment_link','pix_charge')),
  source_id UUID NOT NULL,
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  recipient_customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  recipient_name TEXT,
  provider TEXT NOT NULL,
  provider_ref TEXT,
  amount NUMERIC(12,2) NOT NULL,
  percentage NUMERIC(6,3),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','applied','error','manual')),
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_split_entries TO authenticated;
GRANT ALL ON public.payment_split_entries TO service_role;

ALTER TABLE public.payment_split_entries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins/managers can view split entries" ON public.payment_split_entries;
CREATE POLICY "Admins/managers can view split entries"
  ON public.payment_split_entries FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

DROP POLICY IF EXISTS "Admins/managers can manage split entries" ON public.payment_split_entries;
CREATE POLICY "Admins/managers can manage split entries"
  ON public.payment_split_entries FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

CREATE INDEX IF NOT EXISTS split_entries_source_idx
  ON public.payment_split_entries(source_type, source_id);
CREATE INDEX IF NOT EXISTS split_entries_store_idx
  ON public.payment_split_entries(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS split_entries_recipient_idx
  ON public.payment_split_entries(recipient_customer_id, created_at DESC);

DROP TRIGGER IF EXISTS split_entries_updated_at ON public.payment_split_entries;
CREATE TRIGGER split_entries_updated_at
  BEFORE UPDATE ON public.payment_split_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();