
CREATE TABLE public.wa_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  phone text NOT NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  wa_name text,
  cart jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  unread_count int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_conversations TO authenticated;
GRANT ALL ON public.wa_conversations TO service_role;
ALTER TABLE public.wa_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_conv_store_members" ON public.wa_conversations
  FOR ALL TO authenticated
  USING (public.user_has_store(store_id, auth.uid()))
  WITH CHECK (public.user_has_store(store_id, auth.uid()));

CREATE INDEX idx_wa_conversations_store_updated ON public.wa_conversations(store_id, updated_at DESC);

CREATE TABLE public.wa_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.wa_conversations(id) ON DELETE CASCADE,
  direction text NOT NULL CHECK (direction IN ('inbound','outbound','system')),
  text text,
  wa_message_id text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_messages TO authenticated;
GRANT ALL ON public.wa_messages TO service_role;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_msg_store_members" ON public.wa_messages
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.wa_conversations c
    WHERE c.id = conversation_id AND public.user_has_store(c.store_id, auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.wa_conversations c
    WHERE c.id = conversation_id AND public.user_has_store(c.store_id, auth.uid())
  ));

CREATE INDEX idx_wa_messages_conv_created ON public.wa_messages(conversation_id, created_at DESC);

CREATE TRIGGER wa_conversations_updated_at
  BEFORE UPDATE ON public.wa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
