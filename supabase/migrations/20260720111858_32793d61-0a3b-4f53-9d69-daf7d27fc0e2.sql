
-- 1. Estender wa_conversations
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_at timestamptz,
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS sla_state text NOT NULL DEFAULT 'ok',
  ADD COLUMN IF NOT EXISTS last_snippet text;

CREATE INDEX IF NOT EXISTS idx_wa_conv_assigned ON public.wa_conversations(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wa_conv_status ON public.wa_conversations(store_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_wa_conv_tags ON public.wa_conversations USING GIN(tags);

-- 2. Notas internas
CREATE TABLE IF NOT EXISTS public.wa_internal_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_wa_notes_conv ON public.wa_internal_notes(conversation_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_internal_notes TO authenticated;
GRANT ALL ON public.wa_internal_notes TO service_role;
ALTER TABLE public.wa_internal_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_notes_store_members" ON public.wa_internal_notes
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.wa_conversations c
    WHERE c.id = wa_internal_notes.conversation_id
      AND public.user_has_store(c.store_id, auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.wa_conversations c
    WHERE c.id = wa_internal_notes.conversation_id
      AND public.user_has_store(c.store_id, auth.uid())));

-- 3. Catálogo de tags por loja
CREATE TABLE IF NOT EXISTS public.wa_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  label text NOT NULL,
  color text NOT NULL DEFAULT '#8B5CF6',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, label)
);
CREATE INDEX IF NOT EXISTS idx_wa_tags_store ON public.wa_tags(store_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_tags TO authenticated;
GRANT ALL ON public.wa_tags TO service_role;
ALTER TABLE public.wa_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_tags_store_members" ON public.wa_tags
  FOR ALL TO authenticated
  USING (public.user_has_store(store_id, auth.uid()))
  WITH CHECK (public.user_has_store(store_id, auth.uid()));

-- 4. Trigger em wa_messages -> atualiza contadores + snippet + first_response_at
CREATE OR REPLACE FUNCTION public.wa_messages_after_insert()
RETURNS TRIGGER AS $$
DECLARE
  snippet text;
BEGIN
  snippet := left(COALESCE(NEW.text, ''), 140);
  IF NEW.direction = 'inbound' THEN
    UPDATE public.wa_conversations
      SET unread_count = unread_count + 1,
          last_inbound_at = NEW.created_at,
          last_snippet = snippet,
          updated_at = now()
      WHERE id = NEW.conversation_id;
  ELSIF NEW.direction = 'outbound' THEN
    UPDATE public.wa_conversations
      SET last_outbound_at = NEW.created_at,
          last_snippet = snippet,
          first_response_at = COALESCE(first_response_at,
            CASE WHEN (NEW.meta ? 'author_id') THEN NEW.created_at ELSE first_response_at END),
          updated_at = now()
      WHERE id = NEW.conversation_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS wa_messages_after_insert_trg ON public.wa_messages;
CREATE TRIGGER wa_messages_after_insert_trg
  AFTER INSERT ON public.wa_messages
  FOR EACH ROW EXECUTE FUNCTION public.wa_messages_after_insert();

-- 5. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_internal_notes;
