
-- 1) Storefront orders
CREATE TABLE IF NOT EXISTS public.storefront_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending',
  channel text NOT NULL DEFAULT 'whatsapp',
  customer_name text,
  customer_phone text,
  customer_email text,
  items jsonb NOT NULL,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  imported_at timestamptz,
  imported_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.storefront_orders TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.storefront_orders TO authenticated;
GRANT ALL ON public.storefront_orders TO service_role;

ALTER TABLE public.storefront_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sf_orders_ins_anon ON public.storefront_orders;
CREATE POLICY sf_orders_ins_anon ON public.storefront_orders FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS sf_orders_ins_auth ON public.storefront_orders;
CREATE POLICY sf_orders_ins_auth ON public.storefront_orders FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS sf_orders_select_store ON public.storefront_orders;
CREATE POLICY sf_orders_select_store ON public.storefront_orders FOR SELECT TO authenticated
  USING (store_id IS NULL OR user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS sf_orders_update_store ON public.storefront_orders;
CREATE POLICY sf_orders_update_store ON public.storefront_orders FOR UPDATE TO authenticated
  USING (store_id IS NULL OR user_has_store(auth.uid(), store_id));

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS storefront_orders_updated ON public.storefront_orders;
CREATE TRIGGER storefront_orders_updated BEFORE UPDATE ON public.storefront_orders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Backfill de slug em categorias
UPDATE public.product_categories
SET slug = lower(regexp_replace(coalesce(name, id::text), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL OR slug = '';

-- 3) RPC de estoque
CREATE OR REPLACE FUNCTION public.storefront_available_stock(_product_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT GREATEST(0,
    COALESCE((SELECT SUM(qty) FROM public.product_lots WHERE product_id = _product_id), 0)
    - COALESCE((SELECT SUM(m.qty) FROM public.stock_movements m
                JOIN public.product_lots l ON l.id = m.lot_id
                WHERE l.product_id = _product_id AND m.kind = 'sale'), 0)
    + COALESCE((SELECT SUM(m.qty) FROM public.stock_movements m
                JOIN public.product_lots l ON l.id = m.lot_id
                WHERE l.product_id = _product_id AND m.kind = 'adjust'), 0)
  )::int;
$$;
GRANT EXECUTE ON FUNCTION public.storefront_available_stock(uuid) TO anon, authenticated;

-- 4) Listar produtos públicos
CREATE OR REPLACE FUNCTION public.storefront_list_products(
  _store_slug text DEFAULT NULL,
  _category_slug text DEFAULT NULL,
  _search text DEFAULT NULL,
  _limit int DEFAULT 200
) RETURNS TABLE(
  id uuid, sku text, slug text, name text, brand text, unit_price numeric,
  image_url text, description text, store_slug text, store_name text,
  category_slug text, category_name text, stock int
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.sku, COALESCE(p.slug, p.id::text), p.name, p.brand, p.unit_price,
         p.image_url, COALESCE(p.description, ''), s.slug, s.name,
         c.slug, c.name,
         public.storefront_available_stock(p.id)
  FROM public.products p
  JOIN public.stores s ON s.id = p.store_id
  LEFT JOIN public.product_categories c ON c.id = p.category_id
  WHERE p.active AND p.storefront_public
    AND s.active AND s.storefront_public
    AND (_store_slug IS NULL OR s.slug = _store_slug)
    AND (_category_slug IS NULL OR c.slug = _category_slug)
    AND (_search IS NULL OR p.name ILIKE '%'||_search||'%' OR p.brand ILIKE '%'||_search||'%' OR p.sku ILIKE '%'||_search||'%')
  ORDER BY p.name
  LIMIT COALESCE(_limit, 200);
$$;
GRANT EXECUTE ON FUNCTION public.storefront_list_products(text, text, text, int) TO anon, authenticated;

-- 5) Produto por slug
CREATE OR REPLACE FUNCTION public.storefront_get_product(_slug text)
RETURNS TABLE(
  id uuid, sku text, slug text, name text, brand text, unit_price numeric,
  image_url text, description text, store_id uuid, store_slug text, store_name text,
  store_whatsapp text, category_slug text, category_name text, stock int
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.sku, COALESCE(p.slug, p.id::text), p.name, p.brand, p.unit_price,
         p.image_url, COALESCE(p.description, ''), s.id, s.slug, s.name,
         s.storefront_whatsapp, c.slug, c.name,
         public.storefront_available_stock(p.id)
  FROM public.products p
  JOIN public.stores s ON s.id = p.store_id
  LEFT JOIN public.product_categories c ON c.id = p.category_id
  WHERE COALESCE(p.slug, p.id::text) = _slug
    AND p.active AND p.storefront_public
    AND s.active AND s.storefront_public
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.storefront_get_product(text) TO anon, authenticated;

-- 6) Categorias públicas
CREATE OR REPLACE FUNCTION public.storefront_list_categories(_store_slug text DEFAULT NULL)
RETURNS TABLE(id uuid, slug text, name text, store_slug text, product_count int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, s.slug, COUNT(p.id)::int
  FROM public.product_categories c
  JOIN public.stores s ON s.id = c.store_id
  JOIN public.products p ON p.category_id = c.id AND p.active AND p.storefront_public
  WHERE c.active AND s.active AND s.storefront_public
    AND (_store_slug IS NULL OR s.slug = _store_slug)
  GROUP BY c.id, c.slug, c.name, s.slug
  ORDER BY c.name;
$$;
GRANT EXECUTE ON FUNCTION public.storefront_list_categories(text) TO anon, authenticated;

-- 7) Categoria por slug
CREATE OR REPLACE FUNCTION public.storefront_get_category(_slug text)
RETURNS TABLE(id uuid, slug text, name text, store_slug text, store_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.slug, c.name, s.slug, s.name
  FROM public.product_categories c
  JOIN public.stores s ON s.id = c.store_id
  WHERE c.active AND c.slug = _slug
    AND s.active AND s.storefront_public
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.storefront_get_category(text) TO anon, authenticated;

-- 8) Pedido por code (usado após criar pra confirmar)
CREATE OR REPLACE FUNCTION public.storefront_get_order(_code text)
RETURNS TABLE(code text, status text, total numeric, items jsonb, channel text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT code, status, total, items, channel, created_at
  FROM public.storefront_orders WHERE code = _code LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.storefront_get_order(text) TO anon, authenticated;
