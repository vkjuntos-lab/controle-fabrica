CREATE OR REPLACE FUNCTION public.storefront_admin_get_send_payload(_code text)
RETURNS TABLE(
  code text,
  status text,
  channel text,
  total numeric,
  items jsonb,
  customer_name text,
  customer_phone text,
  store_name text,
  store_slug text,
  store_whatsapp text,
  wa_message_id text
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.code, o.status, o.channel, o.total, o.items,
         o.customer_name, o.customer_phone,
         s.name, s.slug, s.storefront_whatsapp, o.wa_message_id
    FROM public.storefront_orders o
    LEFT JOIN public.stores s ON s.id = o.store_id
   WHERE o.code = _code
   LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.storefront_admin_get_send_payload(text) TO authenticated, service_role;