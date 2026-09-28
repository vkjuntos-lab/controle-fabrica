-- =====================================================================
-- LOVABLE MASTER 014 — Fiscal: master data, engine tributário e
-- classificação fiscal de produtos.
--
-- Princípio que atravessa todo este arquivo: o banco não deduz nada
-- tributário. Não há NCM por palpite de nome, regime por faturamento,
-- alíquota por "uso comum" nem CFOP universal. O que o banco faz é
-- exigir configuração aprovada e bloquear o que não a tem.
--
-- A origem dos fatos continua sendo operacional. Esta migration não
-- toca estoque, financeiro nem vendas: ela apenas lê o que já existe e
-- guarda a decisão fiscal junto com a versão da regra que a produziu.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enums. Valores configuráveis vivem em tabelas, não aqui: um enum
--    novo exigiria migration. Só entram estados de ciclo de vida, cujo
--    conjunto é decisão de arquitetura e não parâmetro fiscal.
-- ---------------------------------------------------------------------

-- Documento fiscal: preparado não é transmitido, transmitido não é
-- autorizado, autorizado não é pago. São estados distintos e o módulo
-- nunca os colapsa.
CREATE TYPE public.fiscal_document_status AS ENUM (
  'DRAFT',                -- montado na tela, ainda sem conferência
  'PENDING_VALIDATION',   -- entrou na validação cadastral
  'VALIDATED',            -- passou na validação; ainda não calculado
  'READY_TO_SEND',        -- calculado, conferido e aprovado para envio
  'SENDING',              -- transmissão em andamento
  'PROCESSING',           -- provedor aceitou e está processando
  'AUTHORIZED',           -- confirmação oficial com protocolo
  'REJECTED',             -- resposta negativa do ambiente autoritativo
  'CANCELLATION_REQUESTED',
  'CANCELED',
  'DENIED',               -- estado terminal rejeitado na conciliação
  'CONTINGENCY_PENDING'   -- transmissao pendente por contingência
);

-- Ciclo de aprovação de regra tributária. Regra não vai de rascunho a
-- produção sem REVIEW e APPROVED: quem calcula imposto tem que ser
-- identificado.
CREATE TYPE public.tax_rule_status AS ENUM ('DRAFT','REVIEW','APPROVED','ACTIVE','RETIRED');

CREATE TYPE public.fiscal_operation_kind AS ENUM (
  'DIRECT_SALE',          -- venda a cliente final
  'PARTNER_REMITTANCE',   -- remessa a parceiro/marketplace: consignação, não receita
  'PARTNER_RETURN',       -- retorno de parceiro
  'CUSTOMER_RETURN',      -- devolução de cliente
  'SUPPLIER_PURCHASE',    -- compra de mercadoria
  'SUPPLIER_RETURN',      -- devolução a fornecedor
  'INTERNAL_TRANSFER',    -- transferência entre estabelecimentos
  'PRODUCTION_CONSUMPTION',
  'OTHER'
);

CREATE TYPE public.fiscal_environment AS ENUM ('HOMOLOGATION','PRODUCTION');

-- ---------------------------------------------------------------------
-- 2. Sequence de numeração por estabelecimento/modelo/série.
--    O contador é transacional e nunca reutiliza número de documento
--    já autorizado: autorizacao e Cancelamento congelam o numero.
-- ---------------------------------------------------------------------
CREATE TABLE public.fiscal_number_sequences (
  organization_id uuid NOT NULL REFERENCES public.organizations,
  establishment_id uuid NOT NULL,
  document_model text NOT NULL,
  series text NOT NULL,
  next_number bigint NOT NULL DEFAULT 1 CHECK(next_number>0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(organization_id,establishment_id,document_model,series)
);

-- ---------------------------------------------------------------------
-- 3. Estabelecimento fiscal.
--
--    A organização não tem identidade fiscal própria: `organizations`
--    guarda nome/slug e `companies` é o cadastro de contrapartes
--    (parceiros, clientes, fornecedores). O emissor da operação é uma
--    entidade nova, e `company_id` fica nulo enquanto não houver
--    vínculo formal com uma company do próprio grupo.
--
--    `business_unit_id` é opcional de propósito: o repositório não tem
--    essa entidade, e inventá-la aqui criaria um segundo conceito de
--    unidade concorrente com `inventory_locations`.
-- ---------------------------------------------------------------------
CREATE TABLE public.fiscal_establishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  business_unit_id uuid,
  company_id uuid,
  legal_name text NOT NULL CHECK(length(trim(legal_name))>0),
  trade_name text,
  tax_registration text,             -- CNPJ: texto, nunca numérico
  state_registration text,           -- Inscrição Estadual
  municipal_registration text,       -- Inscrição Municipal
  tax_regime_id uuid,                -- FK adicionada após fiscal_tax_regimes
  fiscal_address_id uuid,
  environment public.fiscal_environment NOT NULL DEFAULT 'HOMOLOGATION',
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK(status IN ('ACTIVE','INACTIVE','SUSPENDED')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  updated_by uuid REFERENCES public.profiles,
  UNIQUE(organization_id,id)
);
CREATE UNIQUE INDEX fiscal_establishments_tax_reg_uq
  ON public.fiscal_establishments(organization_id,tax_registration)
  WHERE tax_registration IS NOT NULL AND length(trim(tax_registration))>0;
CREATE UNIQUE INDEX fiscal_establishments_one_per_org_uq
  ON public.fiscal_establishments(organization_id)
  WHERE status='ACTIVE' AND environment='PRODUCTION';

-- ---------------------------------------------------------------------
-- 4. Regimes tributários: catálogo versionado da organização.
--
--    O regime NÃO é deduzido de porte ou faturamento. Quem cadastra
--    escolhe explicitamente, e a escolha fica registrada.
-- ---------------------------------------------------------------------
CREATE TABLE public.fiscal_tax_regimes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  code text NOT NULL CHECK(length(trim(code))>0),
  label text NOT NULL CHECK(length(trim(label))>0),
  -- Descrição livre: a significação legal de cada regime não é
  -- interpretável por software e varia com a legislação.
  description text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  approved_by uuid REFERENCES public.profiles,
  approved_at timestamptz,
  justification text,
  UNIQUE(organization_id,code,version),
  CHECK(valid_to IS NULL OR valid_to>valid_from)
);
ALTER TABLE public.fiscal_establishments
  ADD CONSTRAINT fiscal_establishments_regime_fk
  FOREIGN KEY(organization_id,tax_regime_id)
  REFERENCES public.fiscal_tax_regimes(organization_id,id);

-- Histórico de mudança de regime por estabelecimento. UmLeiaute novo
-- não pode reescrever o regime vigente quando o documento foi emitido.
CREATE TABLE public.fiscal_establishment_regime_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  establishment_id uuid NOT NULL,
  tax_regime_id uuid,
  valid_from date NOT NULL,
  valid_to date,
  reason text,
  changed_by uuid REFERENCES public.profiles,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(organization_id,establishment_id)
    REFERENCES public.fiscal_establishments(organization_id,id),
  FOREIGN KEY(organization_id,tax_regime_id)
    REFERENCES public.fiscal_tax_regimes(organization_id,id)
);
CREATE INDEX fiscal_regime_history_est
  ON public.fiscal_establishment_regime_history(organization_id,establishment_id,valid_from DESC);

-- ---------------------------------------------------------------------
-- 5. Tipos de operação fiscal.
--
--    A existência de uma operação interna não cria obrigação de
--    emitir documento. `requires_document` é o que diz isso, e é
--    configurável por operação — inclusive porque transferência entre
--    estabelecimentos do mesmo grupo pode ou não gerar documento,
--    conforme a origem e o destino.
-- ---------------------------------------------------------------------
CREATE TABLE public.fiscal_operation_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  kind public.fiscal_operation_kind NOT NULL,
  code text NOT NULL CHECK(length(trim(code))>0),
  label text NOT NULL CHECK(length(trim(label))>0),
  description text,
  -- Operação interna que não vira documento fiscal é caso normal, não
  -- exceção: consumo de produção, por exemplo, não é venda.
  requires_document boolean NOT NULL DEFAULT true,
  requires_inventory_effect boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  UNIQUE(organization_id,code),
  UNIQUE(organization_id,kind)
);

-- ---------------------------------------------------------------------
-- 6. Natureza da operação: liga tipo operacional a documento e CFOP.
--
--    CFOP NÃO é universal por tipo de operação. O mesmo DIRECT_SALE
--    usa CFOP diferente conforme origem, destino e finalidade, então a
--    combinação fica em registro versionado, com vigência.
--
--    A tabela guarda o código como texto: o valor aplicável é decisão do
--    responsável fiscal, e o banco não valida contra lista oficial.
-- ---------------------------------------------------------------------
CREATE TABLE public.fiscal_operation_natures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  operation_type_id uuid NOT NULL,
  establishment_id uuid,
  document_model text NOT NULL CHECK(length(trim(document_model))>0),
  -- Texto livre versionado junto da organização. Ver comentário acima.
  fiscal_nature text,
  cfop_code text,
  purpose text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  status public.tax_rule_status NOT NULL DEFAULT 'DRAFT',
  justification text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  approved_by uuid REFERENCES public.profiles,
  approved_at timestamptz,
  UNIQUE(organization_id,operation_type_id,document_model,version),
  FOREIGN KEY(organization_id,operation_type_id)
    REFERENCES public.fiscal_operation_types(organization_id,id),
  FOREIGN KEY(organization_id,establishment_id)
    REFERENCES public.fiscal_establishments(organization_id,id)
);
CREATE INDEX fiscal_natures_lookup
  ON public.fiscal_operation_natures(organization_id,operation_type_id,status,valid_from DESC);

-- ---------------------------------------------------------------------
-- 7. Classificação fiscal de produto.
--
--    `products.ncm` existe no catálogo, mas é texto livre e não é
--    versionado nem vinculado a vigência. Aqui a classificação tem
--    histórico, e o NCM é obrigatório por operação antes de emitir.
--
--    NCM/CEST ficam como texto: o software não inventa nem valida
--    contra tabela oficial, porque uma lista desatualizada rejecting
--    um código válido é pior do que não validar.
-- ---------------------------------------------------------------------
CREATE TABLE public.product_fiscal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  product_variant_id uuid NOT NULL,
  ncm text NOT NULL CHECK(length(trim(ncm))>0),
  cest text,
  -- 0 = nacional, 1..8 = origem estrangeira conforme seção da NCM.
  origin_code smallint NOT NULL DEFAULT 0 CHECK(origin_code BETWEEN 0 AND 8),
  fiscal_unit text NOT NULL CHECK(length(trim(fiscal_unit))>0),
  -- Classificações adicionais configuráveis (exigência fiscal da peça).
  tax_classification text,
  -- Extensível para IBS/CBS sem criar coluna por tributo.
  additional_classification jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Enquadramento deLauncher é opt-in: padrão é 'DEFAULT'.
  tax_treatment text NOT NULL DEFAULT 'DEFAULT',
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  status public.tax_rule_status NOT NULL DEFAULT 'DRAFT',
  justification text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  approved_by uuid REFERENCES public.profiles,
  approved_at timestamptz,
  UNIQUE(organization_id,product_variant_id,version),
  FOREIGN KEY(organization_id,product_variant_id)
    REFERENCES public.product_variants(organization_id,id),
  CHECK(effective_to IS NULL OR effective_to>effective_from)
);
CREATE INDEX product_fiscal_profiles_variant
  ON public.product_fiscal_profiles(organization_id,product_variant_id,effective_from DESC);

-- ---------------------------------------------------------------------
-- 8. Perfil fiscal de contraparte (cliente ou fornecedor).
--
--    Cliente pessoa física não tem NCM nem Inscrição Estadual. Por isso
--    os campos são opcionais e a validação fiscal é por tipo de
--    documento, não uniforme: exigir IE de consumidor final bloquearia
--    operação legítima.
-- ---------------------------------------------------------------------
CREATE TABLE public.company_fiscal_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  company_id uuid NOT NULL,
  tax_registration text,
  state_registration text,
  municipal_registration text,
  -- regime do destinatário é opt-in; consumidor final não tem um.
  tax_regime_id uuid,
  -- Isento,.optante, não aplicável — decisão fiscal, não dedução.
  ie_status text CHECK(ie_status IN ('CONTRIBUINTE','ISENTO','NAO_APLICAVEL')),
  email_fiscal text,
  phone_fiscal text,
  is_final_consumer boolean NOT NULL DEFAULT false,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_to date,
  status public.tax_rule_status NOT NULL DEFAULT 'DRAFT',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  UNIQUE(organization_id,company_id,version),
  FOREIGN KEY(organization_id,company_id)
    REFERENCES public.companies(organization_id,id),
  FOREIGN KEY(organization_id,tax_regime_id)
    REFERENCES public.fiscal_tax_regimes(organization_id,id)
);

-- ---------------------------------------------------------------------
-- 9. Perfis fiscais de destino por região, para regra por origem/destino.
-- ---------------------------------------------------------------------
CREATE TABLE public.fiscal_region_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  state_code char(2),
  country_code char(2) NOT NULL DEFAULT 'BR',
  region_class text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,country_code,state_code)
);

-- ---------------------------------------------------------------------
-- 10. Tributos suportados.
--
--     Catálogo de identificadores, com extendível para IBS/CBS. Não
--     implementa ICMS-ST nem Imposto Seletivo como cálculo pronto:
--     existem como código configurável e exigem regra aprovada.
-- ---------------------------------------------------------------------
CREATE TABLE public.fiscal_taxes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  code text NOT NULL CHECK(length(trim(code))>0),
  label text NOT NULL CHECK(length(trim(label))>0),
  -- BASE_REDUCAO: tributa subtotal; VALOR_LIQUIDO: tributa líquido.
  calculation_base text NOT NULL DEFAULT 'BASE_CALCULO'
    CHECK(calculation_base IN ('BASE_CALCULO','VALOR_LIQUIDO','ISOLADO')),
  -- TRUE = tributário; FALSE = não tributário (ex.: taxa de servico).
  is_tax boolean NOT NULL DEFAULT true,
  is_recoverable_default boolean,
  -- Reduz a base antes de aplicar alíquota; quem configura, não o software.
  applies_to jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,code)
);

-- ---------------------------------------------------------------------
-- 11. Tax Rule Engine: regras tributárias versionadas.
--
--     Uma regra só calcula quando está ACTIVE e dentro da vigência. A
--     resolução é por prioridade e, depois, vigência mais recente: as
--     regras mais específicas (que têm mais campos preenchidos) vencem.
--     O documento guarda o snapshot, então recalcular depois com regra
--     nova não muda documento já autorizado.
-- ---------------------------------------------------------------------
CREATE TABLE public.tax_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  establishment_id uuid,
  operation_type_id uuid NOT NULL,
  tax_regime_id uuid,
  -- Escopo da regra. NULL = "qualquer", não "não aplicável".
  product_classification text,
  origin_region_id uuid,
  destination_region_id uuid,
  customer_company_id uuid,
  document_model text,
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  valid_from date NOT NULL DEFAULT CURRENT_DATE,
  valid_to date,
  status public.tax_rule_status NOT NULL DEFAULT 'DRAFT',
  priority integer NOT NULL DEFAULT 100,
  -- Parâmetros de cálculo aprovados. JSON versionado para que a
  -- reforma tributária entre sem migration.
  tax_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Layout/Leiaute técnico vigente, versionado em fiscal_layout_versions.
  layout_version_id uuid,
  justification text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  reviewed_by uuid REFERENCES public.profiles,
  reviewed_at timestamptz,
  approved_by uuid REFERENCES public.profiles,
  approved_at timestamptz,
  retired_at timestamptz,
  UNIQUE(organization_id,id),
  FOREIGN KEY(organization_id,establishment_id)
    REFERENCES public.fiscal_establishments(organization_id,id),
  FOREIGN KEY(organization_id,operation_type_id)
    REFERENCES public.fiscal_operation_types(organization_id,id),
  FOREIGN KEY(organization_id,tax_regime_id)
    REFERENCES public.fiscal_tax_regimes(organization_id,id),
  FOREIGN KEY(organization_id,origin_region_id)
    REFERENCES public.fiscal_region_profiles(organization_id,id),
  FOREIGN KEY(organization_id,destination_region_id)
    REFERENCES public.fiscal_region_profiles(organization_id,id),
  FOREIGN KEY(organization_id,customer_company_id)
    REFERENCES public.companies(organization_id,id),
  CHECK(valid_to IS NULL OR valid_to>valid_from)
);
CREATE INDEX tax_rules_resolve
  ON public.tax_rules(organization_id,operation_type_id,status,valid_from DESC,priority);
-- Uma regra com o mesmo escopo e mesma vigência não pode duplicar:
-- a resolução por prioridade ficaria sem sentido.
CREATE UNIQUE INDEX tax_rules_scope_uq
  ON public.tax_rules(
    organization_id,operation_type_id,coalesce(establishment_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(tax_regime_id,'00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(product_classification,''),coalesce(document_model,''),version)
  WHERE status<>'RETIRED';

-- ---------------------------------------------------------------------
-- 12. Parâmetros de cálculo por tributo dentro da regra.
--
--     Separado de `tax_parameters` para que o motor de cálculo leia
--     uma linha por tributo, com NUMERIC e não float.
-- ---------------------------------------------------------------------
CREATE TABLE public.tax_rule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  tax_rule_id uuid NOT NULL,
  tax_id uuid NOT NULL,
  -- NUMERIC(18,6): 6 casas é o arredondamento padrão em documento
  -- fiscal brasileiro; o arredondamento final é 2 casas e é aplicado
  -- só no fim, no total do tributo.
  rate numeric(18,6) NOT NULL DEFAULT 0 CHECK(rate>=0),
  reduction numeric(18,6) NOT NULL DEFAULT 0,
  -- BASE_REDUCAO/VALOR_LIQUIDO/ISOLADO, herdado de fiscal_taxes.
  base_mode text NOT NULL DEFAULT 'BASE_CALCULO'
    CHECK(base_mode IN ('BASE_CALCULO','VALOR_LIQUIDO','ISOLADO')),
  fixed_amount numeric(18,6) NOT NULL DEFAULT 0,
  -- Código de tratamento tributário do documento (ex.: 3). Texto:
  -- não validamos contra tabela oficial.
  treatment_code text,
  is_recoverable boolean,
  is_withheld boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(organization_id,tax_rule_id,tax_id),
  FOREIGN KEY(organization_id,tax_rule_id) REFERENCES public.tax_rules(organization_id,id),
  FOREIGN KEY(organization_id,tax_id) REFERENCES public.fiscal_taxes(organization_id,id)
);

-- ---------------------------------------------------------------------
-- 13. Versões de Leiaute / atualização normativa.
--
--     Guarda fonte, publicação, vigência e implantação. Regras não se
--     atualizam automaticamente a partir de texto publicado na internet:
--     alguém registra, alguém implanta.
-- ---------------------------------------------------------------------
CREATE TABLE public.fiscal_layout_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations,
  document_model text NOT NULL CHECK(length(trim(document_model))>0),
  version text NOT NULL CHECK(length(trim(version))>0),
  -- Fonte técnica (norma, manual do provedor, leiaute). Texto, com
  -- referência; não URL automático.
  source_reference text NOT NULL CHECK(length(trim(source_reference))>0),
  published_at date,
  valid_from date NOT NULL,
  valid_to date,
  implanted_at timestamptz,
  -- Campos exigidos por esta versão do leiaute. O que o documento
  -- precisa ter muda com a versão, não com o tipo genérico.
  required_fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Campos previstos para IBS/CBS e demais tributos da reforma.
  reform_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK(status IN ('DRAFT','HOMOLOGATION','ACTIVE','RETIRED')),
  homologation_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles,
  approved_by uuid REFERENCES public.profiles,
  approved_at timestamptz,
  UNIQUE(organization_id,document_model,version)
);
ALTER TABLE public.tax_rules
  ADD CONSTRAINT tax_rules_layout_fk
  FOREIGN KEY(organization_id,layout_version_id)
  REFERENCES public.fiscal_layout_versions(organization_id,id);

-- ---------------------------------------------------------------------
-- 14. RLS: todas as entidades fiscais isolam por organização.
--     A checagem real de permissão é server-side, em fiscal_require.
-- ---------------------------------------------------------------------
ALTER TABLE public.fiscal_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_tax_regimes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_establishment_regime_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_operation_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_operation_natures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_fiscal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_fiscal_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_region_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_taxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_layout_versions ENABLE ROW LEVEL SECURITY;

-- Leitura liberada conforme a permissão do módulo; escrita é negada aqui
-- e só acontece por função SECURITY DEFINER que já validou a permissão.
-- Sem isso o frontend escreveria direto na tabela fiscal.
DO $policies$ DECLARE t text; perm text; BEGIN
  FOREACH t IN ARRAY ARRAY[
    'fiscal_establishments','fiscal_tax_regimes','fiscal_establishment_regime_history',
    'fiscal_operation_types','fiscal_operation_natures','product_fiscal_profiles',
    'company_fiscal_profiles','fiscal_region_profiles','fiscal_taxes','tax_rules',
    'tax_rule_items','fiscal_layout_versions'] LOOP
    perm := CASE WHEN t IN ('tax_rules','tax_rule_items') THEN 'fiscal.tax_rules.read'
                 WHEN t IN ('fiscal_establishments','fiscal_tax_regimes',
                            'fiscal_establishment_regime_history','fiscal_operation_types',
                            'fiscal_operation_natures','fiscal_layout_versions') THEN 'fiscal.read'
                 ELSE 'fiscal.read' END;
    EXECUTE format(
      'CREATE POLICY fiscal_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',
      t,perm);
  END LOOP;
END $policies$;

-- Numeração é estado interno do contador: sem leitura direta nem escrita.
CREATE POLICY fiscal_no_direct_access ON public.fiscal_number_sequences
  FOR ALL TO authenticated USING(false) WITH CHECK(false);

-- =====================================================================
-- 15. Helpers.
-- =====================================================================
CREATE FUNCTION public.fiscal_require(_org uuid,_permission text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(_org,_permission) THEN
    RAISE EXCEPTION 'Sem permissão: %',_permission;
  END IF;
END $$;

CREATE FUNCTION public.fiscal_audit(_org uuid,_action text,_table text,_id uuid,_context jsonb DEFAULT '{}') RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
VALUES(_org,auth.uid(),_action,_table,_id::text,_context);
$$;

CREATE FUNCTION public.fiscal_emit(_org uuid,_type text,_key text,_payload jsonb) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
INSERT INTO public.domain_events(organization_id,event_type,event_source,event_key,payload)
VALUES(_org,_type,'FISCAL',_key,_payload||jsonb_build_object('schema_version',1))
ON CONFLICT (organization_id,event_key) DO NOTHING;
$$;

-- Preferência por organização nas tabelas de configuração: uma linha
-- por organização, com organization_id como chave.
CREATE FUNCTION public.fiscal_my_org_ids() RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT organization_id FROM public.organization_members
  WHERE user_id=auth.uid() AND is_active;
$$;

-- Ambientes são separados por DEFAULT. Um documento marcado PRODUCTION
-- nunca pode ser transmitido em HOMOLOGATION: é o erro que mais custa.
CREATE FUNCTION public.fiscal_assert_environment(_doc_environment public.fiscal_environment,
                                                 _provider_environment public.fiscal_environment) RETURNS void
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF _doc_environment IS DISTINCT FROM _provider_environment THEN
    RAISE EXCEPTION 'Ambiente do documento (%) difere do provedor (%)',_doc_environment,_provider_environment;
  END IF;
END $$;
