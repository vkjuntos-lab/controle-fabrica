
-- customers: restrict update/insert to active staff
DROP POLICY IF EXISTS "customers updatable by authenticated" ON public.customers;
CREATE POLICY "customers updatable by staff"
  ON public.customers FOR UPDATE
  USING (public.is_active_staff(auth.uid()))
  WITH CHECK (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS "customers insertable by authenticated" ON public.customers;
CREATE POLICY "customers insertable by staff"
  ON public.customers FOR INSERT
  WITH CHECK (public.is_active_staff(auth.uid()));

-- stores: remove public read, restrict to staff/admin; anon uses storefront_public policy
DROP POLICY IF EXISTS "Stores visible to all" ON public.stores;
CREATE POLICY "Stores visible to staff"
  ON public.stores FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_has_store(auth.uid(), id));

-- gift_card_transactions: scope insert to gift card's store
DROP POLICY IF EXISTS "Auth insert gift card txs" ON public.gift_card_transactions;
CREATE POLICY "Staff insert gift card txs"
  ON public.gift_card_transactions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.gift_cards g
      WHERE g.id = gift_card_transactions.gift_card_id
        AND public.user_has_store(auth.uid(), g.store_id)
    )
  );

-- customer_store_credit_movements: scope insert to user's store
DROP POLICY IF EXISTS "Auth insert credit movs" ON public.customer_store_credit_movements;
CREATE POLICY "Staff insert credit movs"
  ON public.customer_store_credit_movements FOR INSERT
  WITH CHECK (public.user_has_store(auth.uid(), store_id));
