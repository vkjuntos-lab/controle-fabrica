
-- Colunas de credenciais
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS cloud_token TEXT;
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS cloud_phone_id TEXT;
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS cloud_template_name TEXT;
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS cloud_template_lang TEXT DEFAULT 'pt_BR';
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS zapi_instance_id TEXT;
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS zapi_token TEXT;
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS zapi_client_token TEXT;
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS last_test_error TEXT;
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS last_test_at TIMESTAMPTZ;

-- Restringe SELECT ao gerente/admin (protege tokens)
DROP POLICY IF EXISTS "wa_settings view store" ON public.wa_settings;
DROP POLICY IF EXISTS "wa_settings view manager" ON public.wa_settings;
CREATE POLICY "wa_settings view manager" ON public.wa_settings FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = auth.uid() AND ur.store_id = wa_settings.store_id
      AND ur.role IN ('manager')
  )
);

-- Drop e recria com novas assinaturas
DROP FUNCTION IF EXISTS public.get_wa_settings(uuid);
DROP FUNCTION IF EXISTS public.upsert_wa_settings(uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION public.get_wa_settings(_store UUID)
RETURNS TABLE(
  store_id UUID, provider TEXT, from_number TEXT, active BOOLEAN,
  cloud_token TEXT, cloud_phone_id TEXT, cloud_template_name TEXT, cloud_template_lang TEXT,
  zapi_instance_id TEXT, zapi_token TEXT, zapi_client_token TEXT,
  verified_at TIMESTAMPTZ, last_test_error TEXT, last_test_at TIMESTAMPTZ
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT s.store_id, s.provider, s.from_number, s.active,
         s.cloud_token, s.cloud_phone_id, s.cloud_template_name, s.cloud_template_lang,
         s.zapi_instance_id, s.zapi_token, s.zapi_client_token,
         s.verified_at, s.last_test_error, s.last_test_at
    FROM public.wa_settings s
   WHERE s.store_id = _store
     AND (public.has_role(auth.uid(),'admin') OR EXISTS (
       SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id=auth.uid() AND ur.store_id=_store AND ur.role IN ('manager')
     ));
$$;

CREATE OR REPLACE FUNCTION public.upsert_wa_settings(
  _store UUID, _provider TEXT, _from TEXT, _active BOOLEAN,
  _cloud_token TEXT DEFAULT NULL, _cloud_phone_id TEXT DEFAULT NULL,
  _cloud_template_name TEXT DEFAULT NULL, _cloud_template_lang TEXT DEFAULT 'pt_BR',
  _zapi_instance TEXT DEFAULT NULL, _zapi_token TEXT DEFAULT NULL, _zapi_client_token TEXT DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=auth.uid() AND ur.store_id=_store AND ur.role IN ('manager')
  )) THEN RAISE EXCEPTION 'forbidden'; END IF;

  INSERT INTO public.wa_settings(
    store_id, provider, from_number, active,
    cloud_token, cloud_phone_id, cloud_template_name, cloud_template_lang,
    zapi_instance_id, zapi_token, zapi_client_token
  ) VALUES (
    _store, _provider, _from, COALESCE(_active,TRUE),
    _cloud_token, _cloud_phone_id, _cloud_template_name, COALESCE(_cloud_template_lang,'pt_BR'),
    _zapi_instance, _zapi_token, _zapi_client_token
  )
  ON CONFLICT (store_id) DO UPDATE SET
    provider = EXCLUDED.provider,
    from_number = EXCLUDED.from_number,
    active = EXCLUDED.active,
    cloud_token = COALESCE(EXCLUDED.cloud_token, wa_settings.cloud_token),
    cloud_phone_id = COALESCE(EXCLUDED.cloud_phone_id, wa_settings.cloud_phone_id),
    cloud_template_name = EXCLUDED.cloud_template_name,
    cloud_template_lang = COALESCE(EXCLUDED.cloud_template_lang, wa_settings.cloud_template_lang, 'pt_BR'),
    zapi_instance_id = COALESCE(EXCLUDED.zapi_instance_id, wa_settings.zapi_instance_id),
    zapi_token = COALESCE(EXCLUDED.zapi_token, wa_settings.zapi_token),
    zapi_client_token = COALESCE(EXCLUDED.zapi_client_token, wa_settings.zapi_client_token),
    updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.record_wa_test_result(_store UUID, _ok BOOLEAN, _error TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(),'admin') OR EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id=auth.uid() AND ur.store_id=_store AND ur.role IN ('manager')
  )) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.wa_settings
     SET last_test_at = now(),
         last_test_error = _error,
         verified_at = CASE WHEN _ok THEN now() ELSE verified_at END
   WHERE store_id = _store;
END; $$;

-- Credenciais para uso do serviço server-side (chamado só via supabaseAdmin)
CREATE OR REPLACE FUNCTION public.get_wa_credentials_for_send(_store UUID)
RETURNS TABLE(
  provider TEXT, active BOOLEAN,
  cloud_token TEXT, cloud_phone_id TEXT, cloud_template_name TEXT, cloud_template_lang TEXT,
  zapi_instance_id TEXT, zapi_token TEXT, zapi_client_token TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT provider, active,
         cloud_token, cloud_phone_id, cloud_template_name, cloud_template_lang,
         zapi_instance_id, zapi_token, zapi_client_token
    FROM public.wa_settings WHERE store_id = _store;
$$;
