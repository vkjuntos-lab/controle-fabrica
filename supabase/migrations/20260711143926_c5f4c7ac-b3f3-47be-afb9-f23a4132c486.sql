
ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS confirmation_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmation_last_error TEXT,
  ADD COLUMN IF NOT EXISTS order_confirmed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_links_wa_conv
  ON public.payment_links(wa_conversation_id)
  WHERE wa_conversation_id IS NOT NULL;
