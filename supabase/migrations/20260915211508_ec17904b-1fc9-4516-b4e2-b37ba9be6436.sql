REVOKE EXECUTE ON FUNCTION public.is_org_member(_organization_id uuid, _user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_org_role(_organization_id uuid, _roles public.app_role[], _user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(_organization_id uuid, _permission text, _user_id uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.my_organizations() FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_organization() FROM anon, authenticated, public;

GRANT EXECUTE ON FUNCTION public.is_org_member(_organization_id uuid, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_org_role(_organization_id uuid, _roles public.app_role[], _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(_organization_id uuid, _permission text, _user_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_organizations() TO authenticated;