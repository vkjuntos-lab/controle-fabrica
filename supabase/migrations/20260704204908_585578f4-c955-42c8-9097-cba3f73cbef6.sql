
-- Remove execução por anon nas funções de permissão internas
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_has_store(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.user_role_in_store(uuid, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_read_store_row(uuid, uuid) FROM anon, public;

-- Garante execução para autenticados (usado pelas server functions)
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_has_store(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_role_in_store(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_store_row(uuid, uuid) TO authenticated;

-- Restringe políticas permissivas de customers a autenticados
DROP POLICY IF EXISTS "customers insertable by authenticated" ON public.customers;
DROP POLICY IF EXISTS "customers updatable by authenticated" ON public.customers;
CREATE POLICY "customers insertable by authenticated"
  ON public.customers FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "customers updatable by authenticated"
  ON public.customers FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
