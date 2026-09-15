
-- Políticas RLS para bucket fiscal-certs (certificados A1)
CREATE POLICY "Autenticados leem certs fiscais"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'fiscal-certs');

CREATE POLICY "Admin/gerente sobe certs fiscais"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'fiscal-certs' AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  ));

CREATE POLICY "Admin/gerente atualiza certs fiscais"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'fiscal-certs' AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  ));

CREATE POLICY "Admin/gerente remove certs fiscais"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'fiscal-certs' AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager')
  ));
