DROP FUNCTION IF EXISTS public.resolve_payment_link(TEXT);

CREATE OR REPLACE FUNCTION public.resolve_payment_link(_code TEXT)
RETURNS TABLE(
  id UUID, code TEXT, description TEXT, amount NUMERIC,
  methods JSONB, max_installments INTEGER,
  status public.payment_link_status, expires_at TIMESTAMPTZ,
  customer_name TEXT, store_name TEXT,
  mp_init_point TEXT, provider TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pl.id, pl.code, pl.description, pl.amount,
         pl.methods, pl.max_installments,
         pl.status, pl.expires_at,
         c.name, s.name, pl.mp_init_point,
         COALESCE(pl.provider, 'mercadopago')
  FROM public.payment_links pl
  LEFT JOIN public.customers c ON c.id = pl.customer_id
  JOIN public.stores s ON s.id = pl.store_id
  WHERE pl.code = _code
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_payment_link(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_payment_link(TEXT) TO anon, authenticated;