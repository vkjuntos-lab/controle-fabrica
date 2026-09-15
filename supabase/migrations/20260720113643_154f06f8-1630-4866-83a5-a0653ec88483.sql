
CREATE TABLE public.wa_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  color text NOT NULL DEFAULT '#8D6E63',
  sla_first_response_seconds integer NOT NULL DEFAULT 300,
  sla_resolution_seconds integer NOT NULL DEFAULT 3600,
  is_default boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_queues TO authenticated;
GRANT ALL ON public.wa_queues TO service_role;
ALTER TABLE public.wa_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "queues_store_scope_select" ON public.wa_queues FOR SELECT TO authenticated
  USING (public.user_has_store(auth.uid(), store_id));
CREATE POLICY "queues_store_scope_mut" ON public.wa_queues FOR ALL TO authenticated
  USING (public.user_has_store(auth.uid(), store_id))
  WITH CHECK (public.user_has_store(auth.uid(), store_id));

CREATE TRIGGER trg_wa_queues_updated BEFORE UPDATE ON public.wa_queues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.wa_conversations ADD COLUMN IF NOT EXISTS queue_id uuid REFERENCES public.wa_queues(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conversations_queue ON public.wa_conversations(queue_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_store_status ON public.wa_conversations(store_id, status);

CREATE OR REPLACE VIEW public.wa_queue_metrics_24h
WITH (security_invoker = true) AS
SELECT
  c.store_id,
  c.queue_id,
  COUNT(*) FILTER (WHERE c.status = 'open') AS open_count,
  COUNT(*) FILTER (WHERE c.assigned_to IS NULL AND c.status = 'open') AS waiting_count,
  COUNT(*) FILTER (WHERE c.first_response_at IS NOT NULL) AS answered_count,
  COUNT(*) FILTER (WHERE c.closed_at IS NOT NULL) AS closed_count,
  AVG(EXTRACT(EPOCH FROM (c.first_response_at - c.created_at)))
    FILTER (WHERE c.first_response_at IS NOT NULL) AS tme_seconds,
  AVG(EXTRACT(EPOCH FROM (c.closed_at - c.created_at)))
    FILTER (WHERE c.closed_at IS NOT NULL) AS tma_seconds,
  COUNT(*) FILTER (WHERE c.sla_state = 'breached') AS sla_breached
FROM public.wa_conversations c
WHERE c.created_at > now() - interval '24 hours'
GROUP BY c.store_id, c.queue_id;

GRANT SELECT ON public.wa_queue_metrics_24h TO authenticated;
