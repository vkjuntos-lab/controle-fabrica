
ALTER TABLE public.payment_links
  ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tracking_code TEXT,
  ADD COLUMN IF NOT EXISTS carrier TEXT,
  ADD COLUMN IF NOT EXISTS return_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_reason TEXT;

CREATE INDEX IF NOT EXISTS payment_links_wa_store_idx
  ON public.payment_links (store_id, created_at DESC)
  WHERE wa_conversation_id IS NOT NULL;
