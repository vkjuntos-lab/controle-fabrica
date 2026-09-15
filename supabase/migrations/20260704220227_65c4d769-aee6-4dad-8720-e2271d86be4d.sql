
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS cnpj text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS phone text;

CREATE OR REPLACE FUNCTION public.list_stores_with_stats()
RETURNS TABLE(
  id uuid, name text, code text, cnpj text, address text, phone text, active boolean,
  operators_count bigint, products_count bigint, month_revenue numeric, month_sales bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    s.id, s.name, s.code, s.cnpj, s.address, s.phone, s.active,
    (SELECT count(*) FROM public.user_roles ur WHERE ur.store_id = s.id AND ur.active),
    (SELECT count(DISTINCT pl.product_id) FROM public.product_lots pl WHERE pl.store_id = s.id),
    COALESCE((SELECT sum(sa.total) FROM public.sales sa
      WHERE sa.store_id = s.id AND sa.created_at >= date_trunc('month', now())), 0),
    (SELECT count(*) FROM public.sales sa
      WHERE sa.store_id = s.id AND sa.created_at >= date_trunc('month', now()))
  FROM public.stores s
  WHERE public.is_admin(auth.uid())
  ORDER BY s.active DESC, s.name;
$$;

CREATE OR REPLACE FUNCTION public.my_stores()
RETURNS TABLE(id uuid, name text, code text, role app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT s.id, s.name, s.code, ur.role
  FROM public.user_roles ur
  JOIN public.stores s ON s.id = ur.store_id
  WHERE ur.user_id = auth.uid() AND ur.active AND s.active
  ORDER BY
    CASE ur.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 WHEN 'cashier' THEN 3 ELSE 4 END,
    s.name;
$$;

CREATE OR REPLACE FUNCTION public.consolidated_by_store(_from timestamptz, _to timestamptz)
RETURNS TABLE(
  store_id uuid, store_name text, revenue numeric, sales_count bigint, avg_ticket numeric,
  open_sessions bigint, pending_pix bigint, expiring_lots bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    s.id, s.name,
    COALESCE(sum(sa.total), 0),
    count(sa.id),
    CASE WHEN count(sa.id) > 0 THEN sum(sa.total)/count(sa.id) ELSE 0 END,
    (SELECT count(*) FROM public.cashier_sessions cs WHERE cs.store_id = s.id AND cs.closed_at IS NULL),
    (SELECT count(*) FROM public.pix_charges pc WHERE pc.store_id = s.id AND pc.status IN ('pending','reminded','regenerated')),
    (SELECT count(*) FROM public.product_lots pl
       WHERE pl.store_id = s.id
         AND to_date('01/' || pl.validity, 'DD/MM/YYYY') < (now() + interval '60 days'))
  FROM public.stores s
  LEFT JOIN public.sales sa ON sa.store_id = s.id AND sa.created_at BETWEEN _from AND _to
  WHERE public.is_admin(auth.uid()) AND s.active
  GROUP BY s.id, s.name
  ORDER BY 3 DESC;
$$;
