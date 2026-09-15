-- Reset: remove legacy schema objects (all tables were empty)
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON SCHEMA public TO postgres;

-- ============ ENUMS ============
CREATE TYPE public.app_role AS ENUM ('admin','gestor','financeiro','estoque','producao','comercial','marketplace');

-- ============ TIMESTAMP HELPER ============
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ============ ORGANIZATIONS ============
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  document text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  full_name text,
  email text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ MEMBERSHIPS ============
CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.app_role NOT NULL DEFAULT 'comercial',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
CREATE INDEX organization_members_user_idx ON public.organization_members (user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT ALL ON public.organization_members TO service_role;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ============ ROLE PERMISSIONS ============
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role public.app_role NOT NULL,
  permission text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (role, permission)
);
GRANT SELECT ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id uuid,
  action text NOT NULL,
  resource text NOT NULL,
  resource_id text,
  result text NOT NULL DEFAULT 'success',
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_log_org_created_idx ON public.audit_log (organization_id, created_at DESC);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ============ SECURITY DEFINER HELPERS ============
CREATE OR REPLACE FUNCTION public.is_org_member(_organization_id uuid, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _organization_id AND m.user_id = _user_id AND m.is_active
  );
$$;

CREATE OR REPLACE FUNCTION public.has_org_role(_organization_id uuid, _roles public.app_role[], _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = _organization_id AND m.user_id = _user_id AND m.is_active
      AND m.role = ANY(_roles)
  );
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_organization_id uuid, _permission text, _user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members m
    JOIN public.role_permissions rp ON rp.role = m.role
    WHERE m.organization_id = _organization_id AND m.user_id = _user_id AND m.is_active
      AND rp.permission = _permission
  );
$$;

CREATE OR REPLACE FUNCTION public.my_organizations()
RETURNS TABLE (organization_id uuid, name text, slug text, role public.app_role)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT o.id, o.name, o.slug, m.role
  FROM public.organizations o
  JOIN public.organization_members m ON m.organization_id = o.id
  WHERE m.user_id = auth.uid() AND m.is_active
  ORDER BY o.name;
$$;

-- ============ POLICIES ============
CREATE POLICY "members read their organizations" ON public.organizations
  FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY "authenticated create organizations" ON public.organizations
  FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "admins update their organization" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.has_org_role(id, ARRAY['admin','gestor']::public.app_role[]))
  WITH CHECK (public.has_org_role(id, ARRAY['admin','gestor']::public.app_role[]));

CREATE POLICY "read own profile" ON public.profiles
  FOR SELECT TO authenticated USING (
    id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.organization_members me
      JOIN public.organization_members other ON other.organization_id = me.organization_id
      WHERE me.user_id = auth.uid() AND me.is_active AND other.user_id = profiles.id
    )
  );
CREATE POLICY "insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY "update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "members read memberships" ON public.organization_members
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_org_member(organization_id));
CREATE POLICY "managers add members" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (public.has_org_role(organization_id, ARRAY['admin','gestor']::public.app_role[]));
CREATE POLICY "managers update members" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['admin','gestor']::public.app_role[]))
  WITH CHECK (public.has_org_role(organization_id, ARRAY['admin','gestor']::public.app_role[]));
CREATE POLICY "admins remove members" ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.has_org_role(organization_id, ARRAY['admin']::public.app_role[]));

CREATE POLICY "authenticated read role permissions" ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "managers read audit log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (organization_id IS NOT NULL AND public.has_org_role(organization_id, ARRAY['admin','gestor']::public.app_role[]));

-- ============ TRIGGERS ============
CREATE TRIGGER organizations_updated_at BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER organization_members_updated_at BEFORE UPDATE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NULLIF(NEW.raw_user_meta_data->>'full_name',''), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_new_organization()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (NEW.id, COALESCE(NEW.created_by, auth.uid()), 'admin')
  ON CONFLICT (organization_id, user_id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_organization_created AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_organization();

-- ============ INITIAL PERMISSION MATRIX ============
INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','organization.read'),('admin','organization.manage'),
  ('admin','users.read'),('admin','users.manage'),
  ('admin','permissions.read'),('admin','audit.read'),
  ('gestor','organization.read'),('gestor','organization.manage'),
  ('gestor','users.read'),('gestor','users.manage'),
  ('gestor','permissions.read'),('gestor','audit.read'),
  ('financeiro','organization.read'),('financeiro','users.read'),
  ('estoque','organization.read'),
  ('producao','organization.read'),
  ('comercial','organization.read'),
  ('marketplace','organization.read');