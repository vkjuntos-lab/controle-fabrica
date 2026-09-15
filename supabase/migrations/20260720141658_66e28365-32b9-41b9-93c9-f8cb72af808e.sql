
CREATE INDEX IF NOT EXISTS sales_store_created_idx ON public.sales (store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_created_range_idx ON public.sales (created_at) WHERE store_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS customers_created_at_idx ON public.customers (created_at DESC);
CREATE INDEX IF NOT EXISTS payment_links_store_status_created_idx ON public.payment_links (store_id, status, created_at DESC);
ANALYZE public.sales;
ANALYZE public.wa_conversations;
ANALYZE public.payment_links;
