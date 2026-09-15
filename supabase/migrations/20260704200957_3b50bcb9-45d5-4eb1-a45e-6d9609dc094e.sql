-- =========================================================
-- PRODUCTS
-- =========================================================
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sku TEXT NOT NULL UNIQUE,
  ean TEXT,
  name TEXT NOT NULL,
  unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.products TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products readable by everyone"
  ON public.products FOR SELECT
  USING (true);

CREATE POLICY "products writable by authenticated admin"
  ON public.products FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "products updatable by authenticated admin"
  ON public.products FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "products deletable by authenticated admin"
  ON public.products FOR DELETE TO authenticated USING (true);

-- =========================================================
-- PRODUCT LOTS
-- =========================================================
CREATE TABLE public.product_lots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  lot_code TEXT NOT NULL,
  validity DATE NOT NULL,
  qty INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, lot_code)
);

CREATE INDEX product_lots_product_id_idx ON public.product_lots(product_id);
CREATE INDEX product_lots_validity_idx ON public.product_lots(validity);

GRANT SELECT ON public.product_lots TO anon;
-- operadores (anon) precisam poder abater estoque na venda:
GRANT UPDATE ON public.product_lots TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_lots TO authenticated;
GRANT ALL ON public.product_lots TO service_role;

ALTER TABLE public.product_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lots readable by everyone"
  ON public.product_lots FOR SELECT USING (true);

CREATE POLICY "lots insertable by authenticated admin"
  ON public.product_lots FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "lots deletable by authenticated admin"
  ON public.product_lots FOR DELETE TO authenticated USING (true);

-- UPDATE: admin pode tudo; caixa (anon) só pode alterar qty (baixa)
CREATE POLICY "lots updatable by authenticated admin"
  ON public.product_lots FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "lots qty decrement by anyone"
  ON public.product_lots FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- =========================================================
-- STOCK MOVEMENTS
-- =========================================================
CREATE TYPE public.stock_movement_kind AS ENUM ('entry', 'sale', 'adjust');

CREATE TABLE public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lot_id UUID NOT NULL REFERENCES public.product_lots(id) ON DELETE CASCADE,
  kind public.stock_movement_kind NOT NULL,
  qty INTEGER NOT NULL CHECK (qty <> 0),
  note TEXT,
  operator TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX stock_movements_lot_id_idx ON public.stock_movements(lot_id);
CREATE INDEX stock_movements_created_at_idx ON public.stock_movements(created_at DESC);

GRANT SELECT ON public.stock_movements TO anon;
GRANT INSERT ON public.stock_movements TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_movements TO authenticated;
GRANT ALL ON public.stock_movements TO service_role;

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movements readable by everyone"
  ON public.stock_movements FOR SELECT USING (true);

CREATE POLICY "movements insertable by anyone"
  ON public.stock_movements FOR INSERT WITH CHECK (true);

CREATE POLICY "movements updatable by authenticated admin"
  ON public.stock_movements FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "movements deletable by authenticated admin"
  ON public.stock_movements FOR DELETE TO authenticated USING (true);

-- =========================================================
-- Trigger: mantém qty do lote ao registrar movimento
-- =========================================================
CREATE OR REPLACE FUNCTION public.apply_stock_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta INTEGER;
BEGIN
  -- entrada e ajuste positivo somam; venda subtrai
  IF NEW.kind = 'sale' THEN
    delta := -abs(NEW.qty);
  ELSIF NEW.kind = 'entry' THEN
    delta := abs(NEW.qty);
  ELSE
    delta := NEW.qty; -- ajuste pode ser + ou -
  END IF;

  UPDATE public.product_lots
    SET qty = GREATEST(0, qty + delta),
        updated_at = now()
    WHERE id = NEW.lot_id;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_stock_movement
AFTER INSERT ON public.stock_movements
FOR EACH ROW EXECUTE FUNCTION public.apply_stock_movement();

-- =========================================================
-- updated_at helper
-- =========================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_product_lots_updated_at
BEFORE UPDATE ON public.product_lots
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================
-- View: lotes vencendo em breve (próximos 90 dias)
-- =========================================================
CREATE OR REPLACE VIEW public.lots_expiring_soon
WITH (security_invoker = on) AS
SELECT
  l.id            AS lot_id,
  l.lot_code,
  l.validity,
  l.qty,
  (l.validity - CURRENT_DATE) AS days_left,
  p.id            AS product_id,
  p.sku,
  p.name          AS product_name
FROM public.product_lots l
JOIN public.products p ON p.id = l.product_id
WHERE l.qty > 0
  AND l.validity <= CURRENT_DATE + INTERVAL '90 days'
ORDER BY l.validity ASC;

GRANT SELECT ON public.lots_expiring_soon TO anon, authenticated;

-- =========================================================
-- Seed inicial: mesmo catálogo que estava hardcoded no front
-- =========================================================
INSERT INTO public.products (sku, ean, name, unit_price) VALUES
  ('MLB-042-05', '7891000000015', 'Base Líquida Matte 30ml · Cor 05', 89.90),
  ('BAT-LIQ-12', '7891000000022', 'Batom Líquido Long-Wear · Rouge', 49.90),
  ('PRIMER-01',  '7891000000039', 'Primer Hidratante 25ml',           74.00),
  ('FIX-100',    '7891000000046', 'Fixador de Maquiagem 100ml',       59.90)
ON CONFLICT (sku) DO NOTHING;

INSERT INTO public.product_lots (product_id, lot_code, validity, qty)
SELECT p.id, v.lot_code, v.validity::date, v.qty
FROM (VALUES
  ('MLB-042-05', 'L2503', '2027-03-01',  4),
  ('MLB-042-05', 'L2508', '2027-08-01', 10),
  ('BAT-LIQ-12', 'L2601', '2027-11-01', 20),
  ('PRIMER-01',  'L2503', '2027-03-01',  6),
  ('PRIMER-01',  'L2511', '2027-11-01', 12),
  ('FIX-100',    'L2602', '2028-02-01', 15)
) AS v(sku, lot_code, validity, qty)
JOIN public.products p ON p.sku = v.sku
ON CONFLICT (product_id, lot_code) DO NOTHING;