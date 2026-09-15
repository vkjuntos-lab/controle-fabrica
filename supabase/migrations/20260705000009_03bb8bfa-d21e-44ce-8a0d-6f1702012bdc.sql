
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS birthday date,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS customers_birthday_month_idx
  ON public.customers ((EXTRACT(MONTH FROM birthday)));

CREATE INDEX IF NOT EXISTS customers_tags_idx ON public.customers USING gin(tags);

CREATE OR REPLACE FUNCTION public.list_customers_with_stats(_store_id uuid)
RETURNS TABLE(
  id uuid, name text, cpf text, phone text, email text, tier text,
  cashback numeric, birthday date, tags text[], created_at timestamptz,
  sales_count bigint, total_spent numeric, last_purchase_at timestamptz,
  avg_ticket numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
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
      AND (_store_id IS NULL OR s.store_id = _store_id)
  ) agg ON true
  WHERE public.is_admin(auth.uid())
     OR _store_id IS NULL
     OR public.user_has_store(auth.uid(), _store_id)
  ORDER BY c.name;
$$;

GRANT EXECUTE ON FUNCTION public.list_customers_with_stats(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.customer_360(_customer_id uuid, _store_id uuid DEFAULT NULL)
RETURNS TABLE(
  event_kind text, event_at timestamptz, description text,
  amount numeric, extra jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT 'sale'::text, s.created_at, 'Venda ' || s.code, s.total,
    jsonb_build_object('sale_id', s.id, 'items', jsonb_array_length(COALESCE(s.lines,'[]'::jsonb)))
  FROM public.sales s
  WHERE s.customer_id = _customer_id
    AND (_store_id IS NULL OR s.store_id = _store_id)
  UNION ALL
  SELECT 'pix', p.created_at, 'PIX ' || p.sale_code || ' (' || p.status || ')', p.amount,
    jsonb_build_object('status', p.status)
  FROM public.pix_charges p
  WHERE p.customer_id = _customer_id
    AND (_store_id IS NULL OR p.store_id = _store_id)
  UNION ALL
  SELECT 'receivable', r.created_at, r.description || ' (' || r.status || ')', r.amount,
    jsonb_build_object('status', r.status, 'due_date', r.due_date)
  FROM public.accounts_receivable r
  WHERE r.customer_id = _customer_id
    AND (_store_id IS NULL OR r.store_id = _store_id)
  ORDER BY 2 DESC;
$$;

GRANT EXECUTE ON FUNCTION public.customer_360(uuid, uuid) TO authenticated;
