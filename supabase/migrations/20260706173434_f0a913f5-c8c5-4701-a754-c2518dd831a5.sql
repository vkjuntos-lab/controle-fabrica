
ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS whatsapp_clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reserved_until timestamptz,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE TABLE IF NOT EXISTS public.storefront_stock_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.storefront_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL,
  qty int NOT NULL CHECK (qty > 0),
  expires_at timestamptz NOT NULL,
  released_at timestamptz,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.storefront_stock_reservations TO anon;
GRANT SELECT, INSERT, UPDATE ON public.storefront_stock_reservations TO authenticated;
GRANT ALL ON public.storefront_stock_reservations TO service_role;

ALTER TABLE public.storefront_stock_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sf_res_select_all ON public.storefront_stock_reservations;
CREATE POLICY sf_res_select_all ON public.storefront_stock_reservations FOR SELECT TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS sf_res_active_idx
  ON public.storefront_stock_reservations(product_id)
  WHERE released_at IS NULL AND consumed_at IS NULL;

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
    - COALESCE((SELECT SUM(qty) FROM public.storefront_stock_reservations
                WHERE product_id = _product_id
                  AND released_at IS NULL AND consumed_at IS NULL
                  AND expires_at > now()), 0)
  )::int;
$$;

CREATE OR REPLACE FUNCTION public.storefront_validate_cart(_items jsonb)
RETURNS TABLE(product_id uuid, requested int, available int, ok boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE it jsonb;
BEGIN
  FOR it IN SELECT * FROM jsonb_array_elements(_items) LOOP
    product_id := (it->>'product_id')::uuid;
    requested := (it->>'qty')::int;
    available := public.storefront_available_stock(product_id);
    ok := available >= requested;
    RETURN NEXT;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.storefront_validate_cart(jsonb) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.storefront_reserve_order(_code text, _minutes int DEFAULT 30)
RETURNS TABLE(ok boolean, error text, reserved_until timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  o public.storefront_orders;
  it jsonb;
  pid uuid; q int; avail int;
  until timestamptz;
BEGIN
  SELECT * INTO o FROM public.storefront_orders WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Pedido não encontrado', NULL::timestamptz; RETURN; END IF;
  IF o.status NOT IN ('pending','reserved') THEN
    RETURN QUERY SELECT false, 'Pedido não pode ser reservado (status: '||o.status||')', NULL::timestamptz; RETURN;
  END IF;

  UPDATE public.storefront_stock_reservations
    SET released_at = now()
    WHERE order_id = o.id AND released_at IS NULL AND consumed_at IS NULL;

  FOR it IN SELECT * FROM jsonb_array_elements(o.items) LOOP
    pid := (it->>'product_id')::uuid;
    q := (it->>'qty')::int;
    avail := public.storefront_available_stock(pid);
    IF avail < q THEN
      RAISE EXCEPTION 'Estoque insuficiente para %: %/%', (it->>'name'), avail, q;
    END IF;
  END LOOP;

  until := now() + make_interval(mins => GREATEST(5, _minutes));
  FOR it IN SELECT * FROM jsonb_array_elements(o.items) LOOP
    INSERT INTO public.storefront_stock_reservations(order_id, product_id, qty, expires_at)
    VALUES (o.id, (it->>'product_id')::uuid, (it->>'qty')::int, until);
  END LOOP;

  UPDATE public.storefront_orders
    SET status='reserved', reserved_until = until, updated_at = now()
    WHERE id = o.id;

  RETURN QUERY SELECT true, NULL::text, until;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM, NULL::timestamptz;
END; $$;
GRANT EXECUTE ON FUNCTION public.storefront_reserve_order(text, int) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.storefront_mark_whatsapp(_code text, _confirmed boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.storefront_orders
    SET whatsapp_clicked_at = COALESCE(whatsapp_clicked_at, now()),
        whatsapp_confirmed_at = CASE WHEN _confirmed THEN now() ELSE whatsapp_confirmed_at END,
        status = CASE WHEN _confirmed AND status = 'pending' THEN 'whatsapp_sent' ELSE status END,
        updated_at = now()
    WHERE code = _code;
  RETURN FOUND;
END; $$;
GRANT EXECUTE ON FUNCTION public.storefront_mark_whatsapp(text, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.storefront_update_order_notes(_code text, _notes text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _updated int;
BEGIN
  UPDATE public.storefront_orders
    SET notes = _notes, updated_at = now()
    WHERE code = _code AND status IN ('pending','reserved','whatsapp_sent');
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated > 0;
END; $$;
GRANT EXECUTE ON FUNCTION public.storefront_update_order_notes(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.storefront_cancel_order(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oid uuid; st text;
BEGIN
  SELECT id, status INTO oid, st FROM public.storefront_orders WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF st IN ('confirmed','cancelled') THEN RETURN false; END IF;
  UPDATE public.storefront_stock_reservations
    SET released_at = now()
    WHERE order_id = oid AND released_at IS NULL AND consumed_at IS NULL;
  UPDATE public.storefront_orders
    SET status='cancelled', cancelled_at=now(), reserved_until=NULL, updated_at=now()
    WHERE id = oid;
  RETURN true;
END; $$;
GRANT EXECUTE ON FUNCTION public.storefront_cancel_order(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.storefront_get_order(text);
CREATE FUNCTION public.storefront_get_order(_code text)
RETURNS TABLE(
  code text, status text, total numeric, items jsonb, channel text,
  notes text, customer_name text, customer_phone text,
  whatsapp_clicked_at timestamptz, whatsapp_confirmed_at timestamptz,
  reserved_until timestamptz, cancelled_at timestamptz,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT code, status, total, items, channel, notes, customer_name, customer_phone,
         whatsapp_clicked_at, whatsapp_confirmed_at, reserved_until, cancelled_at, created_at
  FROM public.storefront_orders WHERE code = _code LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.storefront_get_order(text) TO anon, authenticated;
