REVOKE EXECUTE ON FUNCTION public.cashflow_by_cost_center(uuid, date, date) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cashflow_projection(uuid, integer) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.cashflow_history_monthly(uuid, integer) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.cashflow_by_cost_center(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cashflow_projection(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cashflow_history_monthly(uuid, integer) TO authenticated, service_role;