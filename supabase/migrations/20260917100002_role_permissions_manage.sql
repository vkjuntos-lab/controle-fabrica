-- Concede a edição da matriz de permissões ao papel admin.
-- A edição acontece server-side (service role, validada por `has_permission`
-- com `permissions.manage`); a interface apenas chama a server function.
INSERT INTO public.role_permissions (role, permission) VALUES
  ('admin','permissions.manage')
ON CONFLICT (role, permission) DO NOTHING;