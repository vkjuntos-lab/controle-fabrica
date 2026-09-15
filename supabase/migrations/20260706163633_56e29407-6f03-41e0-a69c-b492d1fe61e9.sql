
-- Extend stores
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS storefront_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS storefront_whatsapp text;

UPDATE public.stores SET slug = lower(regexp_replace(coalesce(code, name), '[^a-zA-Z0-9]+', '-', 'g'))
  WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS stores_slug_key ON public.stores(slug) WHERE slug IS NOT NULL;

-- Extend products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS slug text,
  ADD COLUMN IF NOT EXISTS storefront_public boolean NOT NULL DEFAULT false;

UPDATE public.products SET slug = lower(regexp_replace(sku || '-' || left(name, 40), '[^a-zA-Z0-9]+', '-', 'g'))
  WHERE slug IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_slug_key ON public.products(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_storefront_idx ON public.products(store_id) WHERE storefront_public AND active;

-- Anon read access
GRANT SELECT ON public.stores TO anon;
GRANT SELECT ON public.products TO anon;

DROP POLICY IF EXISTS "Storefront public stores readable by anon" ON public.stores;
CREATE POLICY "Storefront public stores readable by anon"
  ON public.stores FOR SELECT
  TO anon
  USING (active AND storefront_public);

DROP POLICY IF EXISTS "Storefront public products readable by anon" ON public.products;
CREATE POLICY "Storefront public products readable by anon"
  ON public.products FOR SELECT
  TO anon
  USING (
    active AND storefront_public
    AND EXISTS (SELECT 1 FROM public.stores s WHERE s.id = products.store_id AND s.active AND s.storefront_public)
  );
