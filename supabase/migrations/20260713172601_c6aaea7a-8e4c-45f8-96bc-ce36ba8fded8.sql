
DO $$
DECLARE r RECORD;
  anon_allowed text[] := ARRAY[
    'list_login_operators','list_login_stores',
    'storefront_available_stock','storefront_cancel_order','storefront_get_category',
    'storefront_get_order','storefront_get_product','storefront_list_categories',
    'storefront_list_products','storefront_reserve_order','storefront_update_order_notes',
    'storefront_validate_cart','storefront_mark_whatsapp','storefront_wa_set_message_id',
    'storefront_expire_reservations','storefront_admin_get_send_payload'
  ];
  sig text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    sig := format('public.%I(%s)', r.proname, r.args);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', sig);
    IF r.proname = ANY(anon_allowed) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', sig);
    END IF;
  END LOOP;
END $$;
