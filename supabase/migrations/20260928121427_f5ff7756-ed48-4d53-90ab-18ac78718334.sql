-- Registro de eventos de webhook recebidos (idempotência + trilha de auditoria).
CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  event_id text NOT NULL DEFAULT '',
  signature_ok boolean NOT NULL DEFAULT false,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed boolean NOT NULL DEFAULT false,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (provider, event_id)
);
CREATE INDEX webhook_events_received_idx ON public.webhook_events (received_at DESC);
GRANT SELECT ON public.webhook_events TO authenticated;
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role manage webhook events" ON public.webhook_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

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

GRANT INSERT ON public.audit_log TO authenticated;

CREATE POLICY "members insert audit rows" ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id IS NULL OR public.is_org_member(organization_id)
  );

INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','permissions.manage')
ON CONFLICT (role, permission) DO NOTHING;