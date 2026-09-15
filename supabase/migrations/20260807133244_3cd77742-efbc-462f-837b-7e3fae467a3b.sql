-- collection_events: controlled insert/delete + scoped update check
CREATE POLICY "insert collection_events by store" ON public.collection_events
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

CREATE POLICY "delete collection_events admin/manager" ON public.collection_events
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager'::app_role);

DROP POLICY IF EXISTS "update collection_events by store" ON public.collection_events;
CREATE POLICY "update collection_events by store" ON public.collection_events
  FOR UPDATE TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

-- credit_installments: restrict mutations to admin/manager
DROP POLICY IF EXISTS "manage credit_installments by store" ON public.credit_installments;

CREATE POLICY "insert credit_installments by store" ON public.credit_installments
  FOR INSERT TO authenticated
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

CREATE POLICY "update credit_installments admin/manager" ON public.credit_installments
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager'::app_role)
  WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager'::app_role);

CREATE POLICY "delete credit_installments admin/manager" ON public.credit_installments
  FOR DELETE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager'::app_role);

-- credit_sales: add WITH CHECK mirroring USING
DROP POLICY IF EXISTS "update credit_sales admin/manager" ON public.credit_sales;
CREATE POLICY "update credit_sales admin/manager" ON public.credit_sales
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager'::app_role)
  WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager'::app_role);

-- bella_*: drop redundant non-store-scoped has_role admin policies
DROP POLICY IF EXISTS "bella_leads_admin_all" ON public.bella_leads;
DROP POLICY IF EXISTS "bella_knowledge_admin" ON public.bella_knowledge;
DROP POLICY IF EXISTS "bella_prompts_admin" ON public.bella_prompts;
DROP POLICY IF EXISTS "bella_campaign_runs_admin_all" ON public.bella_campaign_runs;
DROP POLICY IF EXISTS "bella_reviews_admin_all" ON public.bella_reviews;