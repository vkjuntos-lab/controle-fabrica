
-- Fase 1: Fundação omnichannel para o Agente Bella IA
ALTER TABLE public.wa_conversations
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS handoff_to_human boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS handoff_reason text,
  ADD COLUMN IF NOT EXISTS handoff_at timestamptz;

ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'whatsapp';

ALTER TABLE public.wa_settings
  ADD COLUMN IF NOT EXISTS ig_user_id text,
  ADD COLUMN IF NOT EXISTS ig_page_id text,
  ADD COLUMN IF NOT EXISTS ig_token text,
  ADD COLUMN IF NOT EXISTS ig_active boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_wa_conversations_channel ON public.wa_conversations(channel);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_handoff ON public.wa_conversations(handoff_to_human) WHERE handoff_to_human = true;
CREATE INDEX IF NOT EXISTS idx_wa_settings_ig_user_id ON public.wa_settings(ig_user_id) WHERE ig_user_id IS NOT NULL;
