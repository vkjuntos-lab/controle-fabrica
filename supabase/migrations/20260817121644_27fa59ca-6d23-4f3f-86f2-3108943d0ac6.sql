-- payment_gateways: drop redundant policy without active-role check
DROP POLICY IF EXISTS "Users can manage their store gateways" ON public.payment_gateways;

-- pix_charges: add WITH CHECK to prevent cross-store row migration
DROP POLICY IF EXISTS manager_update_pix ON public.pix_charges;
CREATE POLICY manager_update_pix ON public.pix_charges
FOR UPDATE TO authenticated
USING (is_admin(auth.uid()) OR user_role_in_store(auth.uid(), store_id) = 'manager'::app_role)
WITH CHECK (is_admin(auth.uid()) OR user_role_in_store(auth.uid(), store_id) = 'manager'::app_role);

-- tags / scheduled_messages / auto_responses: replace client-editable JWT metadata checks
DROP POLICY IF EXISTS "Store specific access for tags" ON public.tags;
CREATE POLICY tags_store_access ON public.tags
FOR ALL TO authenticated
USING (is_admin(auth.uid()) OR user_has_store(auth.uid(), store_id))
WITH CHECK (is_admin(auth.uid()) OR user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "Store specific access for scheduled_messages" ON public.scheduled_messages;
CREATE POLICY scheduled_messages_store_access ON public.scheduled_messages
FOR ALL TO authenticated
USING (is_admin(auth.uid()) OR user_has_store(auth.uid(), store_id))
WITH CHECK (is_admin(auth.uid()) OR user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "Store specific access for auto_responses" ON public.auto_responses;
CREATE POLICY auto_responses_store_access ON public.auto_responses
FOR ALL TO authenticated
USING (is_admin(auth.uid()) OR user_has_store(auth.uid(), store_id))
WITH CHECK (is_admin(auth.uid()) OR user_has_store(auth.uid(), store_id));