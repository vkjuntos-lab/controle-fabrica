
ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS wa_conversation_id uuid REFERENCES public.wa_conversations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fulfillment jsonb,
  ADD COLUMN IF NOT EXISTS items jsonb,
  ADD COLUMN IF NOT EXISTS fulfilled_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_payment_links_wa_conv ON public.payment_links(wa_conversation_id);
