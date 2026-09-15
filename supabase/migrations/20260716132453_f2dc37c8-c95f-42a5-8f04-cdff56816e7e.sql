
DROP POLICY IF EXISTS sf_orders_ins_anon ON public.storefront_orders;
DROP POLICY IF EXISTS sf_orders_ins_auth ON public.storefront_orders;

CREATE POLICY sf_orders_ins_anon ON public.storefront_orders
  FOR INSERT TO anon
  WITH CHECK (
    status = 'pending'
    AND channel IN ('whatsapp','pdv')
    AND imported_by IS NULL
    AND confirmed_by IS NULL
    AND confirmed_at IS NULL
    AND cancelled_at IS NULL
    AND imported_at IS NULL
    AND reserved_until IS NULL
  );

CREATE POLICY sf_orders_ins_auth ON public.storefront_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'pending'
    AND channel IN ('whatsapp','pdv')
    AND imported_by IS NULL
    AND confirmed_by IS NULL
    AND confirmed_at IS NULL
    AND cancelled_at IS NULL
    AND imported_at IS NULL
    AND reserved_until IS NULL
  );
