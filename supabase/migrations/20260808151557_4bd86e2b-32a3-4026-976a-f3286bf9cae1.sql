
-- Add cancelation fields to product_batches
ALTER TABLE public.product_batches 
ADD COLUMN IF NOT EXISTS cancel_reason text,
ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Policy update for role restriction (if needed) is assumed handled by existing store isolation

-- Create server function for cancellation
CREATE OR REPLACE FUNCTION public.cancel_product_batch(p_batch_id uuid, p_reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.product_batches
  SET 
    status = 'cancelled',
    cancel_reason = p_reason,
    cancelled_at = now(),
    updated_at = now()
  WHERE id = p_batch_id AND status IN ('processing', 'pending', 'error');
  
  -- Update idle items to cancelled
  UPDATE public.batch_items
  SET status = 'cancelled', updated_at = now()
  WHERE batch_id = p_batch_id AND status = 'idle';
END;
$$;
