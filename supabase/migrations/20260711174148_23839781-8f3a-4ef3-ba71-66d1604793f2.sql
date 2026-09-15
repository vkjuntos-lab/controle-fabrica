CREATE TABLE IF NOT EXISTS public.bella_prompts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false,
  version INT NOT NULL DEFAULT 1,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bella_prompts TO authenticated;
GRANT ALL ON public.bella_prompts TO service_role;
ALTER TABLE public.bella_prompts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bella_prompts_admin" ON public.bella_prompts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "bella_prompts_manager" ON public.bella_prompts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'manager'));

CREATE INDEX IF NOT EXISTS bella_prompts_store_active_idx ON public.bella_prompts(store_id, is_active);
CREATE TRIGGER bella_prompts_updated_at BEFORE UPDATE ON public.bella_prompts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.bella_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  question TEXT,
  answer TEXT NOT NULL,
  tags TEXT[] DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bella_knowledge TO authenticated;
GRANT ALL ON public.bella_knowledge TO service_role;
ALTER TABLE public.bella_knowledge ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bella_knowledge_admin" ON public.bella_knowledge
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "bella_knowledge_manager" ON public.bella_knowledge
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'manager'))
  WITH CHECK (public.has_role(auth.uid(),'manager'));

CREATE INDEX IF NOT EXISTS bella_knowledge_store_active_idx ON public.bella_knowledge(store_id, active);
CREATE TRIGGER bella_knowledge_updated_at BEFORE UPDATE ON public.bella_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
