-- 1) Storage ownership helper -------------------------------------------------
CREATE OR REPLACE FUNCTION public.storage_media_path_allowed(
  _user_id uuid,
  _store_txt text,
  _product_txt text
) RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _store uuid;
  _product uuid;
BEGIN
  IF _store_txt IS NULL OR _store_txt !~ '^[0-9a-fA-F-]{36}$' THEN
    RETURN false;
  END IF;
  _store := _store_txt::uuid;

  IF NOT public.user_has_store(_user_id, _store) THEN
    RETURN false;
  END IF;

  -- Files not tied to a product are allowed only under the "unassigned" folder
  IF _product_txt IS NULL OR _product_txt = 'unassigned' THEN
    RETURN true;
  END IF;

  IF _product_txt !~ '^[0-9a-fA-F-]{36}$' THEN
    RETURN false;
  END IF;
  _product := _product_txt::uuid;

  RETURN EXISTS (
    SELECT 1 FROM public.products p
    WHERE p.id = _product AND p.store_id = _store
  );
END;
$$;

REVOKE ALL ON FUNCTION public.storage_media_path_allowed(uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.storage_media_path_allowed(uuid, text, text) TO authenticated, service_role;

-- 2) product-images policies ---------------------------------------------------
DROP POLICY IF EXISTS product_images_read ON storage.objects;
DROP POLICY IF EXISTS product_images_insert ON storage.objects;
DROP POLICY IF EXISTS product_images_update ON storage.objects;
DROP POLICY IF EXISTS product_images_delete ON storage.objects;

CREATE POLICY product_images_read ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'product-images' AND public.storage_media_path_allowed(auth.uid(), (storage.foldername(name))[1], (storage.foldername(name))[2]));

CREATE POLICY product_images_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'product-images' AND public.storage_media_path_allowed(auth.uid(), (storage.foldername(name))[1], (storage.foldername(name))[2]));

CREATE POLICY product_images_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'product-images' AND public.storage_media_path_allowed(auth.uid(), (storage.foldername(name))[1], (storage.foldername(name))[2]))
WITH CHECK (bucket_id = 'product-images' AND public.storage_media_path_allowed(auth.uid(), (storage.foldername(name))[1], (storage.foldername(name))[2]));

CREATE POLICY product_images_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'product-images' AND public.storage_media_path_allowed(auth.uid(), (storage.foldername(name))[1], (storage.foldername(name))[2]));

-- 3) marketing-photos policies -------------------------------------------------
DROP POLICY IF EXISTS marketing_photos_select ON storage.objects;
DROP POLICY IF EXISTS marketing_photos_insert ON storage.objects;
DROP POLICY IF EXISTS marketing_photos_update ON storage.objects;
DROP POLICY IF EXISTS marketing_photos_delete ON storage.objects;

CREATE POLICY marketing_photos_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'marketing-photos' AND public.storage_media_path_allowed(auth.uid(), (storage.foldername(name))[1], (storage.foldername(name))[2]));

CREATE POLICY marketing_photos_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'marketing-photos' AND public.storage_media_path_allowed(auth.uid(), (storage.foldername(name))[1], (storage.foldername(name))[2]));

CREATE POLICY marketing_photos_update ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'marketing-photos' AND public.storage_media_path_allowed(auth.uid(), (storage.foldername(name))[1], (storage.foldername(name))[2]))
WITH CHECK (bucket_id = 'marketing-photos' AND public.storage_media_path_allowed(auth.uid(), (storage.foldername(name))[1], (storage.foldername(name))[2]));

CREATE POLICY marketing_photos_delete ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'marketing-photos' AND public.storage_media_path_allowed(auth.uid(), (storage.foldername(name))[1], (storage.foldername(name))[2]));

-- 4) Standardize store-scoped role checks -------------------------------------
-- ig_webhook_logs
DROP POLICY IF EXISTS "ig_logs manage manager" ON public.ig_webhook_logs;
DROP POLICY IF EXISTS "ig_logs view store" ON public.ig_webhook_logs;
DROP POLICY IF EXISTS ig_logs_read_by_store_manager ON public.ig_webhook_logs;

CREATE POLICY ig_logs_read ON public.ig_webhook_logs FOR SELECT TO authenticated
USING (store_id IS NOT NULL AND public.user_has_store(auth.uid(), store_id));

CREATE POLICY ig_logs_manage ON public.ig_webhook_logs FOR ALL TO authenticated
USING (store_id IS NOT NULL AND (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager'))
WITH CHECK (store_id IS NOT NULL AND (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager'));

-- fb_webhook_logs
DROP POLICY IF EXISTS "fb_logs manage manager" ON public.fb_webhook_logs;

CREATE POLICY fb_logs_read ON public.fb_webhook_logs FOR SELECT TO authenticated
USING (store_id IS NOT NULL AND public.user_has_store(auth.uid(), store_id));

CREATE POLICY fb_logs_manage ON public.fb_webhook_logs FOR ALL TO authenticated
USING (store_id IS NOT NULL AND (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager'))
WITH CHECK (store_id IS NOT NULL AND (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager'));

-- wa_settings
DROP POLICY IF EXISTS "wa_settings manage manager" ON public.wa_settings;
DROP POLICY IF EXISTS "wa_settings view manager" ON public.wa_settings;

CREATE POLICY wa_settings_read ON public.wa_settings FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');

CREATE POLICY wa_settings_manage ON public.wa_settings FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');

-- ig_templates
DROP POLICY IF EXISTS "ig_templates manage manager" ON public.ig_templates;
DROP POLICY IF EXISTS "ig_templates view store" ON public.ig_templates;
DROP POLICY IF EXISTS ig_templates_manage_by_store ON public.ig_templates;

CREATE POLICY ig_templates_read ON public.ig_templates FOR SELECT TO authenticated
USING (public.user_has_store(auth.uid(), store_id));

CREATE POLICY ig_templates_manage ON public.ig_templates FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');

-- subscriptions
DROP POLICY IF EXISTS "subs manage manager" ON public.subscriptions;
DROP POLICY IF EXISTS "subs view store" ON public.subscriptions;

CREATE POLICY subs_read ON public.subscriptions FOR SELECT TO authenticated
USING (public.user_has_store(auth.uid(), store_id));

CREATE POLICY subs_manage ON public.subscriptions FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');

-- subscription_charges
DROP POLICY IF EXISTS "sub-charges view store" ON public.subscription_charges;

CREATE POLICY sub_charges_read ON public.subscription_charges FOR SELECT TO authenticated
USING (public.user_has_store(auth.uid(), store_id));

-- payment_schedules
DROP POLICY IF EXISTS "psched manage manager" ON public.payment_schedules;
DROP POLICY IF EXISTS "psched view store" ON public.payment_schedules;

CREATE POLICY psched_read ON public.payment_schedules FOR SELECT TO authenticated
USING (public.user_has_store(auth.uid(), store_id));

CREATE POLICY psched_manage ON public.payment_schedules FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');

-- payment_reminders
DROP POLICY IF EXISTS "preminders update manager" ON public.payment_reminders;
DROP POLICY IF EXISTS "preminders view store" ON public.payment_reminders;

CREATE POLICY preminders_read ON public.payment_reminders FOR SELECT TO authenticated
USING (public.user_has_store(auth.uid(), store_id));

CREATE POLICY preminders_update ON public.payment_reminders FOR UPDATE TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');

-- boletos
DROP POLICY IF EXISTS "boletos manage manager" ON public.boletos;
DROP POLICY IF EXISTS "boletos view store" ON public.boletos;

CREATE POLICY boletos_read ON public.boletos FOR SELECT TO authenticated
USING (public.user_has_store(auth.uid(), store_id));

CREATE POLICY boletos_manage ON public.boletos FOR ALL TO authenticated
USING (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager')
WITH CHECK (public.is_admin(auth.uid()) OR public.user_role_in_store(auth.uid(), store_id) = 'manager');

-- notifications
DROP POLICY IF EXISTS "notif view store" ON public.notifications;
DROP POLICY IF EXISTS "notif update store" ON public.notifications;

CREATE POLICY notif_read ON public.notifications FOR SELECT TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (public.user_has_store(auth.uid(), store_id)
      AND (public.user_role_in_store(auth.uid(), store_id))::text = ANY (target_roles))
);

CREATE POLICY notif_update ON public.notifications FOR UPDATE TO authenticated
USING (
  public.is_admin(auth.uid())
  OR (public.user_has_store(auth.uid(), store_id)
      AND (public.user_role_in_store(auth.uid(), store_id))::text = ANY (target_roles))
)
WITH CHECK (
  public.is_admin(auth.uid())
  OR (public.user_has_store(auth.uid(), store_id)
      AND (public.user_role_in_store(auth.uid(), store_id))::text = ANY (target_roles))
);