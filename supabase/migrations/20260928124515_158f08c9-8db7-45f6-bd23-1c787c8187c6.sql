CREATE OR REPLACE FUNCTION public.__apply_migration_sql(_sql text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  EXECUTE _sql;
END;
$$;

REVOKE ALL ON FUNCTION public.__apply_migration_sql(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.__apply_migration_sql(text) FROM anon;
REVOKE ALL ON FUNCTION public.__apply_migration_sql(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.__apply_migration_sql(text) TO service_role;