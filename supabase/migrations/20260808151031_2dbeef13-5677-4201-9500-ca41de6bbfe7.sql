
-- Trigger to notify on batch completion or failure
CREATE OR REPLACE FUNCTION public.notify_batch_status_change()
RETURNS TRIGGER AS $$
DECLARE
  v_completed_count int;
  v_total_count int;
  v_error_count int;
BEGIN
  -- Get counts
  SELECT count(*), count(*) FILTER (WHERE status = 'completed'), count(*) FILTER (WHERE status = 'error')
  INTO v_total_count, v_completed_count, v_error_count
  FROM public.batch_items
  WHERE batch_id = NEW.batch_id;

  -- Update status if all items are processed
  IF v_total_count > 0 AND (v_completed_count + v_error_count) = v_total_count THEN
    IF v_error_count > 0 THEN
      UPDATE public.product_batches SET status = 'error' WHERE id = NEW.batch_id AND status != 'error';
    ELSE
      UPDATE public.product_batches SET status = 'completed' WHERE id = NEW.batch_id AND status != 'completed';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on batch_items to check batch status
DROP TRIGGER IF EXISTS tr_check_batch_status ON public.batch_items;
CREATE TRIGGER tr_check_batch_status
AFTER UPDATE ON public.batch_items
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION public.notify_batch_status_change();
