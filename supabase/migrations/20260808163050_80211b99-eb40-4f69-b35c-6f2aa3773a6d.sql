DROP POLICY "Staff insert credit movs" ON public.customer_store_credit_movements;
CREATE POLICY "Staff insert credit movs" ON public.customer_store_credit_movements
FOR INSERT TO authenticated
WITH CHECK (user_has_store(auth.uid(), store_id));

DROP POLICY "Staff insert gift card txs" ON public.gift_card_transactions;
CREATE POLICY "Staff insert gift card txs" ON public.gift_card_transactions
FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.gift_cards g WHERE g.id = gift_card_transactions.gift_card_id AND user_has_store(auth.uid(), g.store_id)));

DROP POLICY "Admins manage stores" ON public.stores;
CREATE POLICY "Admins manage stores" ON public.stores
FOR ALL TO authenticated
USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles
FOR ALL TO authenticated
USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

DROP POLICY "Users read own role or admin all" ON public.user_roles;
CREATE POLICY "Users read own role or admin all" ON public.user_roles
FOR SELECT TO authenticated
USING ((user_id = auth.uid()) OR is_admin(auth.uid()));

DROP POLICY "manager_store_pix" ON public.pix_charges;
CREATE POLICY "manager_store_pix" ON public.pix_charges
FOR SELECT TO authenticated
USING (is_admin(auth.uid()) OR user_role_in_store(auth.uid(), store_id) = 'manager'::app_role);