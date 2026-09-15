
-- History table
CREATE TABLE public.marketing_photo_generations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  preset text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  image_path text,
  source_image_path text,
  error text,
  watermark jsonb,
  is_current boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX marketing_photo_gen_store_idx ON public.marketing_photo_generations(store_id);
CREATE INDEX marketing_photo_gen_product_idx ON public.marketing_photo_generations(product_id);
CREATE INDEX marketing_photo_gen_created_idx ON public.marketing_photo_generations(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_photo_generations TO authenticated;
GRANT ALL ON public.marketing_photo_generations TO service_role;

ALTER TABLE public.marketing_photo_generations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mpg_select" ON public.marketing_photo_generations
  FOR SELECT TO authenticated
  USING (user_has_store(auth.uid(), store_id));

CREATE POLICY "mpg_insert" ON public.marketing_photo_generations
  FOR INSERT TO authenticated
  WITH CHECK (user_has_store(auth.uid(), store_id));

CREATE POLICY "mpg_update" ON public.marketing_photo_generations
  FOR UPDATE TO authenticated
  USING (user_has_store(auth.uid(), store_id))
  WITH CHECK (user_has_store(auth.uid(), store_id));

CREATE POLICY "mpg_delete" ON public.marketing_photo_generations
  FOR DELETE TO authenticated
  USING (user_has_store(auth.uid(), store_id));

CREATE TRIGGER trg_mpg_updated
  BEFORE UPDATE ON public.marketing_photo_generations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage policies: marketing-photos bucket, path convention: <store_id>/<...>
CREATE POLICY "marketing_photos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'marketing-photos'
    AND user_has_store(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "marketing_photos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'marketing-photos'
    AND user_has_store(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "marketing_photos_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'marketing-photos'
    AND user_has_store(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

CREATE POLICY "marketing_photos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'marketing-photos'
    AND user_has_store(auth.uid(), (split_part(name, '/', 1))::uuid)
  );
