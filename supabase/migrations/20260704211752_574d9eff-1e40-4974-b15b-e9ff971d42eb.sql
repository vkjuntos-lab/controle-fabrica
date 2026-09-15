-- Fase 2: audit_log + papel 'stockist'

-- 1) Adiciona papel stockist ao enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'stockist';

-- 2) Tabela de auditoria
CREATE TABLE IF NOT EXISTS public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name text,
  actor_role text,
  store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx ON public.audit_log (actor_user_id);
CREATE INDEX IF NOT EXISTS audit_log_store_idx ON public.audit_log (store_id);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON public.audit_log (action);

GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Qualquer autenticado pode inserir sua própria linha (actor_user_id = auth.uid())
CREATE POLICY "Users insert own audit rows"
  ON public.audit_log FOR INSERT
  TO authenticated
  WITH CHECK (actor_user_id = auth.uid() OR actor_user_id IS NULL);

-- Admin lê tudo; gerente lê da sua loja; caixa/estoquista lê só as próprias ações
CREATE POLICY "Read audit by scope"
  ON public.audit_log FOR SELECT
  TO authenticated
  USING (
    public.is_admin(auth.uid())
    OR (store_id IS NOT NULL AND public.user_role_in_store(auth.uid(), store_id) = 'manager')
    OR actor_user_id = auth.uid()
  );

-- 3) RPC helper que registra evento server-side lendo cargo/loja atuais
CREATE OR REPLACE FUNCTION public.log_audit(
  _action text,
  _entity text DEFAULT NULL,
  _entity_id text DEFAULT NULL,
  _store_id uuid DEFAULT NULL,
  _details jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _name text;
  _role text;
  _id uuid;
BEGIN
  IF _uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT display_name, role::text
    INTO _name, _role
  FROM public.user_roles
  WHERE user_id = _uid AND active
  ORDER BY CASE role
    WHEN 'admin' THEN 1
    WHEN 'manager' THEN 2
    WHEN 'cashier' THEN 3
    WHEN 'stockist' THEN 4
    ELSE 5 END
  LIMIT 1;

  INSERT INTO public.audit_log (
    actor_user_id, actor_name, actor_role, store_id, action, entity, entity_id, details
  ) VALUES (
    _uid, _name, _role, _store_id, _action, _entity, _entity_id, COALESCE(_details, '{}'::jsonb)
  )
  RETURNING id INTO _id;

  RETURN _id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_audit(text, text, text, uuid, jsonb) TO authenticated;