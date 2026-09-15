CREATE OR REPLACE FUNCTION public.__setup_exec(sql text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ BEGIN EXECUTE sql; END; $fn$;
REVOKE ALL ON FUNCTION public.__setup_exec(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.__setup_exec(text) TO service_role;
NOTIFY pgrst, 'reload schema';