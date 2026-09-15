
-- product-images: policies por store_id (primeiro segmento do path)
CREATE POLICY "product_images_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.user_has_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "product_images_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND public.user_has_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "product_images_update" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.user_has_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "product_images_delete" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND public.user_has_store(auth.uid(), ((storage.foldername(name))[1])::uuid)
);
