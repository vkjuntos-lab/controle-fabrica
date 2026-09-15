
-- Enums
DO $$ BEGIN
  CREATE TYPE public.fiscal_regime AS ENUM ('simples', 'presumido', 'real', 'mei');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.fiscal_environment AS ENUM ('homologacao', 'producao');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- fiscal_settings
CREATE TABLE IF NOT EXISTS public.fiscal_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  cnpj text NOT NULL,
  ie text,
  im text,
  razao_social text NOT NULL,
  nome_fantasia text,
  uf text NOT NULL,
  municipio text,
  cep text,
  endereco text,
  cnae text,
  regime fiscal_regime NOT NULL DEFAULT 'simples',
  environment fiscal_environment NOT NULL DEFAULT 'homologacao',
  nfce_serie int NOT NULL DEFAULT 1,
  nfce_next_number int NOT NULL DEFAULT 1,
  nfe_serie int NOT NULL DEFAULT 1,
  nfe_next_number int NOT NULL DEFAULT 1,
  csc_id text,
  csc_token text,
  cert_secret_name text,
  cert_pass_secret_name text,
  provider text NOT NULL DEFAULT 'focus',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_settings TO authenticated;
GRANT ALL ON public.fiscal_settings TO service_role;
ALTER TABLE public.fiscal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_settings authenticated all"
  ON public.fiscal_settings FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- fiscal_tax_profiles
CREATE TABLE IF NOT EXISTS public.fiscal_tax_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  cfop text NOT NULL DEFAULT '5102',
  origem int NOT NULL DEFAULT 0,
  csosn text,
  cst_icms text,
  icms_aliq numeric(6,3) NOT NULL DEFAULT 0,
  icms_base_red numeric(6,3) NOT NULL DEFAULT 0,
  pis_cst text NOT NULL DEFAULT '49',
  pis_aliq numeric(6,3) NOT NULL DEFAULT 0,
  cofins_cst text NOT NULL DEFAULT '49',
  cofins_aliq numeric(6,3) NOT NULL DEFAULT 0,
  ipi_cst text,
  ipi_aliq numeric(6,3) NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fiscal_tax_profiles TO authenticated;
GRANT ALL ON public.fiscal_tax_profiles TO service_role;
ALTER TABLE public.fiscal_tax_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_tax_profiles authenticated all"
  ON public.fiscal_tax_profiles FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

-- Colunas fiscais em products
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS tax_profile_id uuid REFERENCES public.fiscal_tax_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ncm text,
  ADD COLUMN IF NOT EXISTS cest text,
  ADD COLUMN IF NOT EXISTS unit_commercial text DEFAULT 'UN';

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.fiscal_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_fiscal_settings_updated ON public.fiscal_settings;
CREATE TRIGGER trg_fiscal_settings_updated BEFORE UPDATE ON public.fiscal_settings
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();

DROP TRIGGER IF EXISTS trg_fiscal_tax_profiles_updated ON public.fiscal_tax_profiles;
CREATE TRIGGER trg_fiscal_tax_profiles_updated BEFORE UPDATE ON public.fiscal_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_touch_updated_at();
