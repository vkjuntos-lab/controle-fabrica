CREATE OR REPLACE FUNCTION public.my_stores()
 RETURNS TABLE(id uuid, name text, code text, role app_role)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id, s.name, s.code, 'admin'::app_role AS role
  FROM public.stores s
  WHERE s.active AND public.is_admin(auth.uid())
  UNION
  SELECT s.id, s.name, s.code, ur.role
  FROM public.user_roles ur
  JOIN public.stores s ON s.id = ur.store_id
  WHERE ur.user_id = auth.uid()
    AND ur.active
    AND s.active
    AND NOT public.is_admin(auth.uid())
  ORDER BY 2;
$function$;