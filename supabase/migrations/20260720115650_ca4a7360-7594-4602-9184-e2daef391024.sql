
ALTER TABLE public.wa_settings ADD COLUMN IF NOT EXISTS cloud_waba_id text;

CREATE TABLE IF NOT EXISTS public.wa_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  meta_template_id text,
  name text NOT NULL,
  language text NOT NULL DEFAULT 'pt_BR',
  category text,
  status text NOT NULL DEFAULT 'UNKNOWN',
  header_text text,
  body_text text,
  footer_text text,
  buttons jsonb NOT NULL DEFAULT '[]'::jsonb,
  variables_count integer NOT NULL DEFAULT 0,
  raw jsonb NOT NULL DEFAULT '{}'::jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, name, language)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_templates TO authenticated;
GRANT ALL ON public.wa_templates TO service_role;

ALTER TABLE public.wa_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_templates_manager_read" ON public.wa_templates FOR SELECT TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE POLICY "wa_templates_manager_write" ON public.wa_templates FOR ALL TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'manager'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_wa_templates_updated ON public.wa_templates;
CREATE TRIGGER trg_wa_templates_updated BEFORE UPDATE ON public.wa_templates
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.wa_templates(id) ON DELETE SET NULL;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS template_lang text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS template_params jsonb NOT NULL DEFAULT '[]'::jsonb;
