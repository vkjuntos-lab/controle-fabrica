
-- =========================================
-- Catálogo v2 (per-loja) — schema
-- =========================================

-- Extensão para busca fuzzy
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- --- product_categories ---------------------------------------------
CREATE TABLE public.product_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  slug text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name, parent_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_categories TO authenticated;
GRANT ALL ON public.product_categories TO service_role;
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cat_select" ON public.product_categories FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "cat_ins" ON public.product_categories FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "cat_upd" ON public.product_categories FOR UPDATE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "cat_del" ON public.product_categories FOR DELETE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE TRIGGER trg_product_categories_updated
  BEFORE UPDATE ON public.product_categories
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX product_categories_store_idx ON public.product_categories(store_id);
CREATE INDEX product_categories_parent_idx ON public.product_categories(parent_id);

-- --- products : adicionar colunas -----------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.product_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS cost_price numeric(12,2),
  ADD COLUMN IF NOT EXISTS min_stock integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS volume text,
  ADD COLUMN IF NOT EXISTS color text,
  ADD COLUMN IF NOT EXISTS supplier text,
  ADD COLUMN IF NOT EXISTS ai_generated boolean NOT NULL DEFAULT false;

-- Backfill: atribui todos os produtos existentes à primeira loja ativa
UPDATE public.products p
   SET store_id = (SELECT id FROM public.stores WHERE active ORDER BY created_at LIMIT 1)
 WHERE store_id IS NULL;

ALTER TABLE public.products
  ALTER COLUMN store_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS products_store_idx ON public.products(store_id);
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products(category_id);
CREATE INDEX IF NOT EXISTS products_ean_idx ON public.products(ean);
CREATE INDEX IF NOT EXISTS products_sku_idx ON public.products(sku);
CREATE INDEX IF NOT EXISTS products_name_trgm_idx ON public.products USING gin (name gin_trgm_ops);

-- Rewrite RLS policies para escopo por loja
DROP POLICY IF EXISTS "products_read" ON public.products;
DROP POLICY IF EXISTS "products_write" ON public.products;
DROP POLICY IF EXISTS "prod_select" ON public.products;
DROP POLICY IF EXISTS "prod_ins" ON public.products;
DROP POLICY IF EXISTS "prod_upd" ON public.products;
DROP POLICY IF EXISTS "prod_del" ON public.products;

CREATE POLICY "prod_select" ON public.products FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "prod_ins" ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "prod_upd" ON public.products FOR UPDATE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "prod_del" ON public.products FOR DELETE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));

-- --- product_variants -----------------------------------------------
CREATE TABLE public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  ean text,
  price numeric(12,2) NOT NULL,
  cost_price numeric(12,2),
  attrs jsonb NOT NULL DEFAULT '{}'::jsonb,
  image_url text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT ALL ON public.product_variants TO service_role;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "var_select" ON public.product_variants FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "var_ins" ON public.product_variants FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "var_upd" ON public.product_variants FOR UPDATE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "var_del" ON public.product_variants FOR DELETE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE TRIGGER trg_product_variants_updated
  BEFORE UPDATE ON public.product_variants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX product_variants_product_idx ON public.product_variants(product_id);
CREATE INDEX product_variants_store_idx ON public.product_variants(store_id);
CREATE INDEX product_variants_ean_idx ON public.product_variants(ean);
CREATE INDEX product_variants_sku_idx ON public.product_variants(sku);

-- --- product_lots : variante opcional -------------------------------
ALTER TABLE public.product_lots
  ADD COLUMN IF NOT EXISTS variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS product_lots_variant_idx ON public.product_lots(variant_id);
