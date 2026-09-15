DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'batch_status') THEN
        CREATE TYPE public.batch_status AS ENUM ('draft', 'processing', 'completed', 'archived');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.product_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name text NOT NULL,
    status public.batch_status NOT NULL DEFAULT 'draft',
    settings jsonb DEFAULT '{
      "duplicate_rule": "ask",
      "duplicate_fields": ["sku", "ean"],
      "auto_identify": true
    }'::jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    created_by uuid REFERENCES auth.users(id)
);

CREATE TABLE IF NOT EXISTS public.batch_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES public.product_batches(id) ON DELETE CASCADE,
    preview_url text,
    status text NOT NULL DEFAULT 'idle',
    ai_data jsonb,
    error_message text,
    is_duplicate boolean DEFAULT false,
    existing_product_id uuid,
    manual_data jsonb,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.batch_item_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES public.product_batches(id) ON DELETE CASCADE,
    item_id uuid REFERENCES public.batch_items(id) ON DELETE SET NULL,
    event_type text NOT NULL,
    message text NOT NULL,
    details jsonb,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_batches TO authenticated;
GRANT ALL ON public.product_batches TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_items TO authenticated;
GRANT ALL ON public.batch_items TO service_role;
GRANT SELECT, INSERT ON public.batch_item_logs TO authenticated;
GRANT ALL ON public.batch_item_logs TO service_role;

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_item_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their store batches" ON public.product_batches;
CREATE POLICY "Users can manage their store batches" ON public.product_batches
    FOR ALL TO authenticated USING (public.user_has_store(auth.uid(), store_id));

DROP POLICY IF EXISTS "Users can manage their batch items" ON public.batch_items;
CREATE POLICY "Users can manage their batch items" ON public.batch_items
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.product_batches 
            WHERE id = batch_items.batch_id 
            AND public.user_has_store(auth.uid(), store_id)
        )
    );

DROP POLICY IF EXISTS "Users can view logs of their store batches" ON public.batch_item_logs;
CREATE POLICY "Users can view logs of their store batches" ON public.batch_item_logs
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.product_batches 
            WHERE id = batch_item_logs.batch_id 
            AND public.user_has_store(auth.uid(), store_id)
        )
    );

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_product_batches_updated_at ON public.product_batches;
CREATE TRIGGER update_product_batches_updated_at
    BEFORE UPDATE ON public.product_batches
    FOR EACH ROW
    EXECUTE PROCEDURE public.update_updated_at_column();
