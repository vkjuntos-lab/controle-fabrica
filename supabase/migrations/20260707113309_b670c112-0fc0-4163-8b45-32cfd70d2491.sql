ALTER FUNCTION public.credit_tier_from_score(integer) SET search_path = public;
ALTER FUNCTION public.fiscal_touch_updated_at() SET search_path = public;

DO $$
DECLARE
  r record;
  keep_anon text[] := ARRAY[
    'storefront_available_stock','storefront_get_category','storefront_get_order',
    'storefront_get_product','storefront_list_categories','storefront_list_products',
    'storefront_reserve_order','storefront_validate_cart','storefront_update_order_notes',
    'storefront_cancel_order','list_login_stores','list_login_operators'
  ];
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.prosecdef=true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
    IF r.proname = ANY(keep_anon) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO anon;', r.proname, r.args);
    END IF;
  END LOOP;
END $$;