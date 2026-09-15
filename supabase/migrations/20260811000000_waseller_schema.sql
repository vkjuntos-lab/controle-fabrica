-- Adiciona suporte a link de WhatsApp nos pedidos
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'whatsapp_link') THEN
    ALTER TABLE public.orders ADD COLUMN whatsapp_link text;
  END IF;
END $$;

-- Garante que a tabela customers tenha o telefone para integração WhatsApp
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'phone') THEN
    ALTER TABLE public.customers ADD COLUMN phone text;
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.orders TO service_role;
GRANT ALL ON public.customers TO service_role;
