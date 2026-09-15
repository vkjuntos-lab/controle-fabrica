
-- Helper: any active staff (used for globally-shared tables like customers/coupons/loyalty)
CREATE OR REPLACE FUNCTION public.is_active_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND active)
     OR public.is_admin(_user_id);
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_staff(uuid) TO authenticated, service_role;

-- ============ customers (no store_id: restrict to active staff) ============
DROP POLICY IF EXISTS "customers readable by authenticated" ON public.customers;
CREATE POLICY "customers readable by staff" ON public.customers
  FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));

-- ============ products: drop redundant permissive select ============
DROP POLICY IF EXISTS "products readable by authenticated" ON public.products;

-- ============ coupons / campaigns / campaign_deliveries / coupon_redemptions ============
DROP POLICY IF EXISTS coupons_auth_all ON public.coupons;
CREATE POLICY coupons_staff_select ON public.coupons FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));
CREATE POLICY coupons_manager_write ON public.coupons FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS campaigns_auth_all ON public.campaigns;
CREATE POLICY campaigns_staff_select ON public.campaigns FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));
CREATE POLICY campaigns_manager_write ON public.campaigns FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS campaign_deliveries_auth_all ON public.campaign_deliveries;
CREATE POLICY campaign_deliveries_staff_select ON public.campaign_deliveries FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));
CREATE POLICY campaign_deliveries_manager_write ON public.campaign_deliveries FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'));

DROP POLICY IF EXISTS coupon_redemptions_auth_all ON public.coupon_redemptions;
CREATE POLICY coupon_redemptions_staff_select ON public.coupon_redemptions FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));
CREATE POLICY coupon_redemptions_staff_insert ON public.coupon_redemptions FOR INSERT TO authenticated
  WITH CHECK (public.is_active_staff(auth.uid()));

-- ============ customer_store_credit / movements (has store_id) ============
DROP POLICY IF EXISTS "Staff read store credit" ON public.customer_store_credit;
CREATE POLICY "Staff read store credit" ON public.customer_store_credit
  FOR SELECT TO authenticated USING (public.user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "Staff read credit movs" ON public.customer_store_credit_movements;
CREATE POLICY "Staff read credit movs" ON public.customer_store_credit_movements
  FOR SELECT TO authenticated USING (public.user_has_store(auth.uid(), store_id));

-- ============ fiscal tables (store_id where present) ============
DROP POLICY IF EXISTS "fiscal_documents authenticated all" ON public.fiscal_documents;
CREATE POLICY fiscal_documents_store_scoped ON public.fiscal_documents FOR ALL TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "fiscal_settings authenticated all" ON public.fiscal_settings;
CREATE POLICY fiscal_settings_store_scoped ON public.fiscal_settings FOR ALL TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

-- fiscal_tax_profiles: global, restrict to staff read, manager write
DROP POLICY IF EXISTS "fiscal_tax_profiles authenticated all" ON public.fiscal_tax_profiles;
CREATE POLICY fiscal_tax_profiles_staff_select ON public.fiscal_tax_profiles FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));
CREATE POLICY fiscal_tax_profiles_admin_write ON public.fiscal_tax_profiles FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'));

-- fiscal_queue: linked via document_id -> fiscal_documents.store_id
DROP POLICY IF EXISTS "fiscal_queue authenticated all" ON public.fiscal_queue;
CREATE POLICY fiscal_queue_store_scoped ON public.fiscal_queue FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.fiscal_documents d
    WHERE d.id = fiscal_queue.document_id
      AND public.user_has_store(auth.uid(), d.store_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.fiscal_documents d
    WHERE d.id = fiscal_queue.document_id
      AND public.user_has_store(auth.uid(), d.store_id)
  ));

-- ============ fraud tables (store_id) ============
DROP POLICY IF EXISTS "auth read fraud_events" ON public.fraud_events;
DROP POLICY IF EXISTS "auth write fraud_events" ON public.fraud_events;
CREATE POLICY fraud_events_store_scoped ON public.fraud_events FOR ALL TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "auth read fraud_rules" ON public.fraud_rules;
DROP POLICY IF EXISTS "auth write fraud_rules" ON public.fraud_rules;
CREATE POLICY fraud_rules_store_scoped ON public.fraud_rules FOR ALL TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "auth read fraud_blocklist" ON public.fraud_blocklist;
DROP POLICY IF EXISTS "auth write fraud_blocklist" ON public.fraud_blocklist;
CREATE POLICY fraud_blocklist_store_scoped ON public.fraud_blocklist FOR ALL TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

-- ============ gift cards (store_id) ============
DROP POLICY IF EXISTS "Staff read gift cards" ON public.gift_cards;
CREATE POLICY "Staff read gift cards" ON public.gift_cards
  FOR SELECT TO authenticated USING (public.user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "Staff read gift card txs" ON public.gift_card_transactions;
CREATE POLICY "Staff read gift card txs" ON public.gift_card_transactions
  FOR SELECT TO authenticated USING (EXISTS (
    SELECT 1 FROM public.gift_cards g
    WHERE g.id = gift_card_transactions.gift_card_id
      AND public.user_has_store(auth.uid(), g.store_id)
  ));

-- ============ loyalty (global: staff read, manager write) ============
DROP POLICY IF EXISTS loyalty_accounts_auth_all ON public.loyalty_accounts;
CREATE POLICY loyalty_accounts_staff_select ON public.loyalty_accounts FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));
CREATE POLICY loyalty_accounts_staff_write ON public.loyalty_accounts FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid()))
  WITH CHECK (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS loyalty_ledger_auth_all ON public.loyalty_ledger;
CREATE POLICY loyalty_ledger_staff_select ON public.loyalty_ledger FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));
CREATE POLICY loyalty_ledger_staff_write ON public.loyalty_ledger FOR ALL TO authenticated
  USING (public.is_active_staff(auth.uid()))
  WITH CHECK (public.is_active_staff(auth.uid()));

DROP POLICY IF EXISTS loyalty_rules_auth_all ON public.loyalty_rules;
CREATE POLICY loyalty_rules_staff_select ON public.loyalty_rules FOR SELECT TO authenticated
  USING (public.is_active_staff(auth.uid()));
CREATE POLICY loyalty_rules_admin_write ON public.loyalty_rules FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager'));

-- ============ storefront_stock_reservations ============
DROP POLICY IF EXISTS sf_res_select_all ON public.storefront_stock_reservations;
CREATE POLICY sf_res_staff_select ON public.storefront_stock_reservations FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = storefront_stock_reservations.product_id
      AND public.user_has_store(auth.uid(), p.store_id)
  ));

-- ============ bella tables: replace has_role manager with store-scoped ============
DROP POLICY IF EXISTS bella_campaign_runs_manager ON public.bella_campaign_runs;
CREATE POLICY bella_campaign_runs_manager ON public.bella_campaign_runs FOR ALL TO authenticated
  USING (public.user_role_in_store(auth.uid(), store_id) IN ('manager','admin')
         OR public.is_admin(auth.uid()))
  WITH CHECK (public.user_role_in_store(auth.uid(), store_id) IN ('manager','admin')
              OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS bella_leads_manager ON public.bella_leads;
CREATE POLICY bella_leads_manager ON public.bella_leads FOR ALL TO authenticated
  USING (public.user_role_in_store(auth.uid(), store_id) IN ('manager','admin')
         OR public.is_admin(auth.uid()))
  WITH CHECK (public.user_role_in_store(auth.uid(), store_id) IN ('manager','admin')
              OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS bella_knowledge_manager ON public.bella_knowledge;
CREATE POLICY bella_knowledge_manager ON public.bella_knowledge FOR ALL TO authenticated
  USING (public.user_role_in_store(auth.uid(), store_id) IN ('manager','admin')
         OR public.is_admin(auth.uid()))
  WITH CHECK (public.user_role_in_store(auth.uid(), store_id) IN ('manager','admin')
              OR public.is_admin(auth.uid()));

DROP POLICY IF EXISTS bella_prompts_manager ON public.bella_prompts;
CREATE POLICY bella_prompts_manager ON public.bella_prompts FOR ALL TO authenticated
  USING (public.user_role_in_store(auth.uid(), store_id) IN ('manager','admin')
         OR public.is_admin(auth.uid()))
  WITH CHECK (public.user_role_in_store(auth.uid(), store_id) IN ('manager','admin')
              OR public.is_admin(auth.uid()));

-- ============ fiscal certs storage: restrict to admin/manager ============
DROP POLICY IF EXISTS "Autenticados leem certs fiscais" ON storage.objects;
CREATE POLICY "Admin/gerente leem certs fiscais" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'fiscal-certs'
         AND (public.is_admin(auth.uid()) OR public.has_role(auth.uid(),'manager')));
