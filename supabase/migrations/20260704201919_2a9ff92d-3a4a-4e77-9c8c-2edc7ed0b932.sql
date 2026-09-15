
-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  tier TEXT NOT NULL DEFAULT 'Bronze',
  cashback NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customers TO anon;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers readable by everyone" ON public.customers FOR SELECT USING (true);
CREATE POLICY "customers insertable by anyone" ON public.customers FOR INSERT WITH CHECK (true);
CREATE POLICY "customers updatable by anyone" ON public.customers FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "customers deletable by authenticated" ON public.customers FOR DELETE TO authenticated USING (true);
CREATE TRIGGER customers_set_updated_at BEFORE UPDATE ON public.customers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Sales (history)
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  operator TEXT,
  total NUMERIC NOT NULL DEFAULT 0,
  cashback_used NUMERIC NOT NULL DEFAULT 0,
  lines JSONB NOT NULL DEFAULT '[]'::jsonb,
  payments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.sales TO authenticated;
GRANT SELECT, INSERT ON public.sales TO anon;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales readable by everyone" ON public.sales FOR SELECT USING (true);
CREATE POLICY "sales insertable by anyone" ON public.sales FOR INSERT WITH CHECK (true);
CREATE INDEX sales_customer_id_idx ON public.sales(customer_id);
CREATE INDEX sales_created_at_idx ON public.sales(created_at DESC);
