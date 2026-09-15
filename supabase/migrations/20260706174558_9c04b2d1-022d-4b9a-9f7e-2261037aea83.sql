
-- Novos campos para rastreio WhatsApp e confirmação no PDV
ALTER TABLE public.storefront_orders
  ADD COLUMN IF NOT EXISTS wa_message_id text,
  ADD COLUMN IF NOT EXISTS wa_status text,
  ADD COLUMN IF NOT EXISTS wa_delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_read_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS wa_error text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS confirmed_by uuid;

CREATE INDEX IF NOT EXISTS storefront_orders_wa_msg_idx
  ON public.storefront_orders(wa_message_id) WHERE wa_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS storefront_orders_status_idx
  ON public.storefront_orders(status, created_at DESC);

-- Vincula um message_id externo (Meta Cloud / Z-API) ao pedido
CREATE OR REPLACE FUNCTION public.storefront_wa_set_message_id(_code text, _message_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.storefront_orders
    SET wa_message_id = _message_id,
        wa_status = COALESCE(wa_status, 'sent'),
        status = CASE WHEN status = 'pending' THEN 'whatsapp_sent' ELSE status END,
        whatsapp_clicked_at = COALESCE(whatsapp_clicked_at, now()),
        updated_at = now()
    WHERE code = _code;
  RETURN FOUND;
END; $$;
GRANT EXECUTE ON FUNCTION public.storefront_wa_set_message_id(text, text) TO anon, authenticated, service_role;

-- Atualiza status de entrega/leitura vindo do webhook (Meta: sent/delivered/read/failed)
CREATE OR REPLACE FUNCTION public.storefront_wa_update_status(_message_id text, _status text, _error text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _updated int;
BEGIN
  UPDATE public.storefront_orders
    SET wa_status = _status,
        wa_delivered_at = CASE WHEN _status IN ('delivered','read') AND wa_delivered_at IS NULL THEN now() ELSE wa_delivered_at END,
        wa_read_at      = CASE WHEN _status = 'read' AND wa_read_at IS NULL THEN now() ELSE wa_read_at END,
        wa_failed_at    = CASE WHEN _status = 'failed' AND wa_failed_at IS NULL THEN now() ELSE wa_failed_at END,
        wa_error        = CASE WHEN _status = 'failed' THEN _error ELSE wa_error END,
        whatsapp_confirmed_at = CASE
          WHEN _status IN ('delivered','read') AND whatsapp_confirmed_at IS NULL THEN now()
          ELSE whatsapp_confirmed_at END,
        status = CASE
          WHEN _status IN ('delivered','read') AND status IN ('pending','whatsapp_sent') THEN 'whatsapp_delivered'
          WHEN _status = 'failed' AND status IN ('pending','whatsapp_sent') THEN 'whatsapp_failed'
          ELSE status END,
        updated_at = now()
    WHERE wa_message_id = _message_id;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated > 0;
END; $$;
GRANT EXECUTE ON FUNCTION public.storefront_wa_update_status(text, text, text) TO anon, authenticated, service_role;

-- Expira reservas: libera estoque e cancela pedidos cuja reserva venceu
CREATE OR REPLACE FUNCTION public.storefront_expire_reservations()
RETURNS TABLE(code text, cancelled int) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _released int := 0;
  _cancelled int := 0;
BEGIN
  -- 1) libera reservas cujo TTL passou
  UPDATE public.storefront_stock_reservations
     SET released_at = now()
   WHERE released_at IS NULL AND consumed_at IS NULL AND expires_at <= now();
  GET DIAGNOSTICS _released = ROW_COUNT;

  -- 2) marca como cancelado todo pedido 'reserved' cuja reserva expirou
  FOR code IN
    UPDATE public.storefront_orders o
       SET status = 'cancelled',
           cancelled_at = now(),
           reserved_until = NULL,
           notes = COALESCE(o.notes,'') || CASE WHEN COALESCE(o.notes,'') = '' THEN '' ELSE E'\n' END
                   || '[sistema] Reserva expirada em ' || to_char(now(), 'DD/MM/YYYY HH24:MI'),
           updated_at = now()
     WHERE o.status IN ('reserved','pending','whatsapp_sent','whatsapp_delivered')
       AND o.reserved_until IS NOT NULL
       AND o.reserved_until <= now()
    RETURNING o.code
  LOOP
    _cancelled := _cancelled + 1;
    cancelled := _cancelled;
    RETURN NEXT;
  END LOOP;
END; $$;
GRANT EXECUTE ON FUNCTION public.storefront_expire_reservations() TO anon, authenticated, service_role;

-- Admin: lista pedidos da vitrine (para atendente confirmar/cancelar)
CREATE OR REPLACE FUNCTION public.storefront_admin_list_orders(
  _store_id uuid DEFAULT NULL,
  _status text DEFAULT NULL,
  _limit int DEFAULT 100
) RETURNS TABLE(
  code text, status text, channel text, total numeric,
  customer_name text, customer_phone text,
  items jsonb, notes text,
  wa_status text, wa_message_id text,
  reserved_until timestamptz, cancelled_at timestamptz,
  confirmed_at timestamptz, created_at timestamptz,
  store_id uuid, store_name text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.code, o.status, o.channel, o.total,
         o.customer_name, o.customer_phone, o.items, o.notes,
         o.wa_status, o.wa_message_id, o.reserved_until, o.cancelled_at,
         o.confirmed_at, o.created_at, o.store_id, s.name
    FROM public.storefront_orders o
    LEFT JOIN public.stores s ON s.id = o.store_id
   WHERE (_store_id IS NULL OR o.store_id = _store_id)
     AND (_status IS NULL OR o.status = _status)
   ORDER BY o.created_at DESC
   LIMIT GREATEST(1, LEAST(500, _limit));
$$;
GRANT EXECUTE ON FUNCTION public.storefront_admin_list_orders(uuid, text, int) TO authenticated, service_role;

-- Admin: confirma pedido (consome reservas, marca confirmado)
CREATE OR REPLACE FUNCTION public.storefront_admin_confirm_order(_code text, _user_id uuid)
RETURNS TABLE(ok boolean, error text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE oid uuid; st text;
BEGIN
  SELECT id, status INTO oid, st FROM public.storefront_orders WHERE code = _code FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'Pedido não encontrado'; RETURN; END IF;
  IF st = 'confirmed' THEN RETURN QUERY SELECT true, NULL::text; RETURN; END IF;
  IF st = 'cancelled' THEN RETURN QUERY SELECT false, 'Pedido cancelado'; RETURN; END IF;

  UPDATE public.storefront_stock_reservations
     SET consumed_at = now()
   WHERE order_id = oid AND released_at IS NULL AND consumed_at IS NULL;

  UPDATE public.storefront_orders
     SET status = 'confirmed',
         confirmed_at = now(),
         confirmed_by = _user_id,
         updated_at = now()
   WHERE id = oid;
  RETURN QUERY SELECT true, NULL::text;
EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, SQLERRM;
END; $$;
GRANT EXECUTE ON FUNCTION public.storefront_admin_confirm_order(text, uuid) TO authenticated, service_role;

-- Estende storefront_get_order para expor os novos campos
DROP FUNCTION IF EXISTS public.storefront_get_order(text);
CREATE FUNCTION public.storefront_get_order(_code text)
RETURNS TABLE(
  code text, status text, total numeric, items jsonb, channel text,
  notes text, customer_name text, customer_phone text,
  whatsapp_clicked_at timestamptz, whatsapp_confirmed_at timestamptz,
  reserved_until timestamptz, cancelled_at timestamptz,
  wa_status text, wa_delivered_at timestamptz, wa_read_at timestamptz,
  wa_failed_at timestamptz, wa_error text, confirmed_at timestamptz,
  created_at timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT code, status, total, items, channel, notes, customer_name, customer_phone,
         whatsapp_clicked_at, whatsapp_confirmed_at, reserved_until, cancelled_at,
         wa_status, wa_delivered_at, wa_read_at, wa_failed_at, wa_error,
         confirmed_at, created_at
    FROM public.storefront_orders WHERE code = _code LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.storefront_get_order(text) TO anon, authenticated;
