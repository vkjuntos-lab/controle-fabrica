-- Tabela de Tags
CREATE TABLE IF NOT EXISTS public.tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    name text NOT NULL,
    color text DEFAULT '#D63351',
    created_at timestamptz DEFAULT now(),
    UNIQUE(store_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tags TO authenticated;
GRANT ALL ON public.tags TO service_role;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store specific access for tags" ON public.tags FOR ALL TO authenticated USING (store_id = (auth.jwt() -> 'user_metadata' ->> 'store_id')::uuid);

-- Atualização da tabela de clientes
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS kanban_stage text DEFAULT 'novo';
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS value_potential numeric DEFAULT 0;
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS tags text[];

-- Tabela de Mensagens Agendadas
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
    text text NOT NULL,
    send_at timestamptz NOT NULL,
    status text DEFAULT 'pending',
    last_error text,
    created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_messages TO authenticated;
GRANT ALL ON public.scheduled_messages TO service_role;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store specific access for scheduled_messages" ON public.scheduled_messages FOR ALL TO authenticated USING (store_id = (auth.jwt() -> 'user_metadata' ->> 'store_id')::uuid);

-- Tabela de Autorrespostas
CREATE TABLE IF NOT EXISTS public.auto_responses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE NOT NULL,
    trigger_type text NOT NULL,
    response_text text NOT NULL,
    is_active boolean DEFAULT true,
    created_at timestamptz DEFAULT now(),
    UNIQUE(store_id, trigger_type)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.auto_responses TO authenticated;
GRANT ALL ON public.auto_responses TO service_role;
ALTER TABLE public.auto_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Store specific access for auto_responses" ON public.auto_responses FOR ALL TO authenticated USING (store_id = (auth.jwt() -> 'user_metadata' ->> 'store_id')::uuid);
