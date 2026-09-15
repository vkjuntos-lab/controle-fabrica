-- 1) Fix mutable search_path on project functions
ALTER FUNCTION public.cancel_product_batch(uuid, text) SET search_path = public;
ALTER FUNCTION public.notify_batch_status_change() SET search_path = public;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public;

-- 2) Store-scoped ownership check for fiscal certificate objects
CREATE OR REPLACE FUNCTION public.fiscal_cert_path_allowed(_user_id uuid, _settings_txt text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _settings uuid;
  _store uuid;
BEGIN
  IF _user_id IS NULL OR _settings_txt IS NULL OR _settings_txt !~ '^[0-9a-fA-F-]{36}$' THEN
    RETURN false;
  END IF;
  _settings := _settings_txt::uuid;

  SELECT fs.store_id INTO _store FROM public.fiscal_settings fs WHERE fs.id = _settings;
  IF _store IS NULL THEN
    RETURN false;
  END IF;

  IF NOT (public.is_admin(_user_id) OR public.has_role(_user_id, 'manager'::app_role)) THEN
    RETURN false;
  END IF;

  RETURN public.user_has_store(_user_id, _store);
END;
$$;

DROP POLICY IF EXISTS "Admin/gerente leem certs fiscais" ON storage.objects;
DROP POLICY IF EXISTS "Admin/gerente sobe certs fiscais" ON storage.objects;
DROP POLICY IF EXISTS "Admin/gerente atualiza certs fiscais" ON storage.objects;
DROP POLICY IF EXISTS "Admin/gerente remove certs fiscais" ON storage.objects;

CREATE POLICY "fiscal_certs_select" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'fiscal-certs' AND public.fiscal_cert_path_allowed(auth.uid(), (storage.foldername(name))[1]));

CREATE POLICY "fiscal_certs_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'fiscal-certs' AND public.fiscal_cert_path_allowed(auth.uid(), (storage.foldername(name))[1]));

CREATE POLICY "fiscal_certs_update" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'fiscal-certs' AND public.fiscal_cert_path_allowed(auth.uid(), (storage.foldername(name))[1]))
WITH CHECK (bucket_id = 'fiscal-certs' AND public.fiscal_cert_path_allowed(auth.uid(), (storage.foldername(name))[1]));

CREATE POLICY "fiscal_certs_delete" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'fiscal-certs' AND public.fiscal_cert_path_allowed(auth.uid(), (storage.foldername(name))[1]));