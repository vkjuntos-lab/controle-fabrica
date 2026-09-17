-- Convites por link: permitem adicionar à organização alguém que ainda não tem
-- conta ou cujo e-mail não pode ser localizado. O link gerado é o segredo de
-- acesso; o convite expira e só pode ser aceito por quem está logado com o
-- e-mail destinatário.
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'expired', 'revoked');

CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email text NOT NULL,
  role public.app_role NOT NULL,
  token text NOT NULL UNIQUE,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  accepted_by uuid REFERENCES public.profiles(id)
);
CREATE INDEX invitations_org_status_idx ON public.invitations (organization_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Gestor/admin da organização administram os convites da própria organização.
CREATE POLICY "managers read invitations" ON public.invitations
  FOR SELECT TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['admin','gestor']::public.app_role[]));
CREATE POLICY "managers create invitations" ON public.invitations
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['admin','gestor']::public.app_role[]));
CREATE POLICY "managers update invitations" ON public.invitations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['admin','gestor']::public.app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['admin','gestor']::public.app_role[]));
CREATE POLICY "service role manage invitations" ON public.invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);