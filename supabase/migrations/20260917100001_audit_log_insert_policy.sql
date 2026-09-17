-- Corrige a escrita de auditoria: as server functions registram em `audit_log`
-- via client autenticado (com RLS como o usuário), mas o schema de fundação só
-- concedia SELECT. Sem GRANT INSERT e sem policy de INSERT, criar organização,
-- adicionar/remover membro, alterar papel etc. falhariam ao tentar registrar a
-- ação. Qualquer membro da organização pode registrar a própria ação logada;
-- a leitura continua restrita a admin/gestor.
GRANT INSERT ON public.audit_log TO authenticated;

CREATE POLICY "members insert audit rows" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NULL OR public.is_org_member(organization_id)
  );