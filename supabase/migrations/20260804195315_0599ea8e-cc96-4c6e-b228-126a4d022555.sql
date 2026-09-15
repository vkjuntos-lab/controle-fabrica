-- ============ 1) customers: escopo por loja ============
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

CREATE OR REPLACE FUNCTION public.customers_default_store()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.store_id IS NULL THEN
    SELECT ur.store_id INTO NEW.store_id
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.active
      AND ur.store_id IS NOT NULL
    ORDER BY ur.store_id
    LIMIT 1;
  END IF;
  IF NEW.store_id IS NULL THEN
    RAISE EXCEPTION 'store_id obrigatorio para cadastro de cliente';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customers_default_store_trg ON public.customers;
CREATE TRIGGER customers_default_store_trg
  BEFORE INSERT ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.customers_default_store();

ALTER TABLE public.customers ALTER COLUMN store_id SET NOT NULL;

ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_cpf_key;
CREATE UNIQUE INDEX IF NOT EXISTS customers_store_cpf_key ON public.customers (store_id, cpf);
CREATE INDEX IF NOT EXISTS customers_store_idx ON public.customers (store_id);

DROP POLICY IF EXISTS "customers readable by staff" ON public.customers;
DROP POLICY IF EXISTS "customers insertable by staff" ON public.customers;
DROP POLICY IF EXISTS "customers updatable by staff" ON public.customers;

CREATE POLICY "customers readable in store" ON public.customers
  FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));

CREATE POLICY "customers insertable in store" ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

CREATE POLICY "customers updatable in store" ON public.customers
  FOR UPDATE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

-- listagem com estatisticas: escopo real por loja
CREATE OR REPLACE FUNCTION public.list_customers_with_stats(_store_id uuid)
 RETURNS TABLE(id uuid, name text, cpf text, phone text, email text, tier text, cashback numeric, birthday date, tags text[], created_at timestamp with time zone, sales_count bigint, total_spent numeric, last_purchase_at timestamp with time zone, avg_ticket numeric)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    c.id, c.name, c.cpf, c.phone, c.email, c.tier,
    c.cashback, c.birthday, c.tags, c.created_at,
    COALESCE(agg.sales_count, 0),
    COALESCE(agg.total_spent, 0),
    agg.last_purchase_at,
    CASE WHEN COALESCE(agg.sales_count,0) > 0
         THEN agg.total_spent / agg.sales_count
         ELSE 0 END
  FROM public.customers c
  LEFT JOIN LATERAL (
    SELECT count(*) AS sales_count,
           sum(s.total) AS total_spent,
           max(s.created_at) AS last_purchase_at
    FROM public.sales s
    WHERE s.customer_id = c.id
      AND s.store_id = c.store_id
  ) agg ON true
  WHERE public.user_has_store(auth.uid(), c.store_id)
    AND (_store_id IS NULL OR c.store_id = _store_id)
  ORDER BY c.name;
$function$;

-- ============ 2) fim do bypass de store_id nulo ============
ALTER TABLE public.storefront_orders ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE public.credit_score_events ALTER COLUMN store_id SET NOT NULL;

DROP POLICY IF EXISTS "sf_orders_select_store" ON public.storefront_orders;
CREATE POLICY "sf_orders_select_store" ON public.storefront_orders
  FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "sf_orders_update_store" ON public.storefront_orders;
CREATE POLICY "sf_orders_update_store" ON public.storefront_orders
  FOR UPDATE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "read score events" ON public.credit_score_events;
CREATE POLICY "read score events" ON public.credit_score_events
  FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "insert score events" ON public.credit_score_events;
CREATE POLICY "insert score events" ON public.credit_score_events
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store(auth.uid(), store_id));