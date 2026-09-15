-- gift_cards: store-scoped staff management
DROP POLICY IF EXISTS "Staff manage gift cards" ON public.gift_cards;
CREATE POLICY "Staff manage gift cards" ON public.gift_cards
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role, 'cashier'::app_role)
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role, 'cashier'::app_role)
  );

-- customer_store_credit: store-scoped staff management
DROP POLICY IF EXISTS "Staff modify store credit" ON public.customer_store_credit;
CREATE POLICY "Staff modify store credit" ON public.customer_store_credit
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role, 'cashier'::app_role)
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role, 'cashier'::app_role)
  );

-- payment_split_entries: store-scoped
DROP POLICY IF EXISTS "Admins/managers can manage split entries" ON public.payment_split_entries;
DROP POLICY IF EXISTS "Admins/managers can view split entries" ON public.payment_split_entries;
CREATE POLICY "Admins/managers can view split entries" ON public.payment_split_entries
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.user_has_store(auth.uid(), store_id)
        AND public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role))
  );
CREATE POLICY "Admins/managers can manage split entries" ON public.payment_split_entries
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.user_has_store(auth.uid(), store_id)
        AND public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role))
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (public.user_has_store(auth.uid(), store_id)
        AND public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role))
  );

-- wa_templates: store-scoped
DROP POLICY IF EXISTS "wa_templates_manager_read" ON public.wa_templates;
DROP POLICY IF EXISTS "wa_templates_manager_write" ON public.wa_templates;
CREATE POLICY "wa_templates_manager_read" ON public.wa_templates
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.user_has_store(auth.uid(), store_id)
        AND public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role))
  );
CREATE POLICY "wa_templates_manager_write" ON public.wa_templates
  FOR ALL TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (public.user_has_store(auth.uid(), store_id)
        AND public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role))
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (public.user_has_store(auth.uid(), store_id)
        AND public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role))
  );

-- webhook_events: store-scoped (NULL store_id only visible to global admins)
DROP POLICY IF EXISTS "Admins/managers can view webhook events" ON public.webhook_events;
DROP POLICY IF EXISTS "Admins/managers can update webhook events" ON public.webhook_events;
CREATE POLICY "Admins/managers can view webhook events" ON public.webhook_events
  FOR SELECT TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (store_id IS NOT NULL
        AND public.user_has_store(auth.uid(), store_id)
        AND public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role))
  );
CREATE POLICY "Admins/managers can update webhook events" ON public.webhook_events
  FOR UPDATE TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (store_id IS NOT NULL
        AND public.user_has_store(auth.uid(), store_id)
        AND public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role))
  )
  WITH CHECK (
    public.is_admin(auth.uid())
    OR (store_id IS NOT NULL
        AND public.user_has_store(auth.uid(), store_id)
        AND public.user_role_in_store(auth.uid(), store_id) IN ('admin'::app_role, 'manager'::app_role))
  );

-- loyalty_rules: global config -> admin-only writes, staff keeps read
DROP POLICY IF EXISTS "loyalty_rules_admin_write" ON public.loyalty_rules;
CREATE POLICY "loyalty_rules_admin_write" ON public.loyalty_rules
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- storefront_orders: anon inserts must target an active, public storefront
DROP POLICY IF EXISTS "sf_orders_ins_anon" ON public.storefront_orders;
CREATE POLICY "sf_orders_ins_anon" ON public.storefront_orders
  FOR INSERT TO anon
  WITH CHECK (
    status = 'pending'::text
    AND channel = ANY (ARRAY['whatsapp'::text, 'pdv'::text])
    AND imported_by IS NULL
    AND confirmed_by IS NULL
    AND confirmed_at IS NULL
    AND cancelled_at IS NULL
    AND imported_at IS NULL
    AND reserved_until IS NULL
    AND store_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = storefront_orders.store_id
        AND s.active = true
        AND s.storefront_public = true
    )
  );