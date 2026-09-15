CREATE TYPE public.batch_status AS ENUM ('draft', 'processing', 'completed', 'archived');

CREATE TABLE public.product_batches (
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

CREATE TABLE public.batch_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id uuid NOT NULL REFERENCES public.product_batches(id) ON DELETE CASCADE,
    preview_url text, -- Storage path or original blob reference
    status text NOT NULL DEFAULT 'idle', -- idle, processing, completed, error
    ai_data jsonb, -- The identification result
    error_message text,
    is_duplicate boolean DEFAULT false,
    existing_product_id uuid,
    manual_data jsonb, -- User overrides
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_batches TO authenticated;
GRANT ALL ON public.product_batches TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.batch_items TO authenticated;
GRANT ALL ON public.batch_items TO service_role;

ALTER TABLE public.product_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their store batches" ON public.product_batches
    FOR ALL TO authenticated USING (public.user_has_store(auth.uid(), store_id));

CREATE POLICY "Users can manage their batch items" ON public.batch_items
    FOR ALL TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.product_batches 
            WHERE id = batch_items.batch_id 
            AND public.user_has_store(auth.uid(), store_id)
        )
    );
