-- =====================================================================
-- LOVABLE MASTER 015 — BI: núcleo, catálogo de métricas e fatos canônicos.
--
-- O BI NÃO é uma segunda fonte de verdade. Cada linha de `bi_facts` é
-- uma DERIVAÇÃO determinística de um registro operacional, identificável
-- por (domain, source_table, source_id). Reprocessar reescreve a mesma
-- linha; nunca cria uma segunda. É isso que impede a venda reconciliada
-- virar "duas vendas" depois de um retry.
--
-- Distinções que o schema recusa a achatar (seção 17 do escopo):
--   * remessa para parceiro  -> `domain='LOGISTICS'`, NUNCA soma em venda;
--   * venda importada/reconciliada -> MESMA linha de `bi_facts` com
--     `status`advanced de 'IMPORTED' para 'RECONCILED'. Uma venda só;
--   * pedido comercial (`SALES_ORDER`) -> fato distinto de venda;
--   * mercadoria expedida (`SHIPMENT`) -> fato distinto de venda;
--   * documento fiscal -> fato próprio, nunca usado para inferir receita;
--   * recebimento financeiro -> movimento de caixa (`FINANCIAL`), nunca
--     receita.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
CREATE TYPE public.bi_domain AS ENUM (
  'SALES','PARTNERS','INVENTORY','PRODUCTION','PROCUREMENT','FINANCIAL','CRM','FISCAL','COSTS');
CREATE TYPE public.bi_metric_status AS ENUM ('ACTIVE','DEPRECATED','DRAFT');
CREATE TYPE public.bi_run_status AS ENUM ('RUNNING','COMPLETED','PARTIAL','FAILED');
CREATE TYPE public.bi_fact_status AS ENUM (
  'IMPORTED','VALIDATED','RECONCILED','CANCELED','EXCEPTION','POSTED','OPEN','SETTLED','OVERDUE');
CREATE TYPE public.bi_severity AS ENUM ('INFO','WARNING','ERROR');
CREATE TYPE public.bi_issue_status AS ENUM ('OPEN','ACKNOWLEDGED','RESOLVED');
CREATE TYPE public.bi_abc_class AS ENUM ('A','B','C','UNCLASSIFIED');
CREATE TYPE public.bi_xyz_class AS ENUM ('X','Y','Z','UNCLASSIFIED');
CREATE TYPE public.bi_visibility AS ENUM ('PRIVATE','ORGANIZATION');

-- ---------------------------------------------------------------------
-- 2. CATÁLOGO DE MÉTRICAS
--
-- `organization_id IS NULL` é a definição GLOBAL do produto. A resolução
-- de uma métrica é sempre: global primeiro, organização depois. Uma
-- organização NÃO pode sobrescrever uma `metric_key` global — o trigger
-- abaixo recusa. Como todo painel resolve a fórmula pela `metric_key`,
-- dois dashboards nunca podem exibir a mesma métrica com fórmulas
-- diferentes: não existe segunda fórmula para a mesma chave.
-- ---------------------------------------------------------------------
CREATE TABLE public.bi_metric_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_key text NOT NULL CHECK (length(trim(metric_key))>0),
  metric_name text NOT NULL CHECK (length(trim(metric_name))>0),
  description text NOT NULL,
  business_domain public.bi_domain NOT NULL,
  formula text NOT NULL CHECK (length(trim(formula))>0),
  unit text NOT NULL CHECK (unit IN ('UNIT','CURRENCY','PERCENT','RATIO','DAYS','COUNT','DOCUMENT')),
  aggregation_method text NOT NULL CHECK (aggregation_method IN ('SUM','AVERAGE','RATIO','LAST','DISTINCT_COUNT','SNAPSHOT')),
  date_dimension text NOT NULL,
  source_description text NOT NULL,
  -- Filtros e dimensões aceitos. Uma métrica que só existe por produto
  -- não pode ser agregada por representante sem virar outra métrrica.
  available_filters text[] NOT NULL DEFAULT '{}',
  compatible_dimensions text[] NOT NULL DEFAULT '{}',
  periodicity text NOT NULL CHECK (periodicity IN ('DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY','ON_DEMAND')),
  granularity text NOT NULL DEFAULT 'DAY',
  limitations text NOT NULL DEFAULT '',
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  status public.bi_metric_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE NULLS NOT DISTINCT (organization_id, metric_key, version)
);
CREATE UNIQUE INDEX bi_metrics_global_key ON public.bi_metric_definitions(metric_key,version) WHERE organization_id IS NULL;
CREATE INDEX bi_metrics_org_idx ON public.bi_metric_definitions(organization_id,business_domain) WHERE status='ACTIVE';

-- Histórico de fórmula: §65 exige autoria e histórico de alteração, e
-- um relatório de três meses atrás tem de continuar explicando a fórmula
-- que rodou nele.
CREATE TABLE public.bi_metric_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_definition_id uuid NOT NULL REFERENCES public.bi_metric_definitions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  formula text NOT NULL,
  change_reason text NOT NULL,
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id,metric_definition_id,version)
);

-- ---------------------------------------------------------------------
-- 3. FATO CANÔNICO
--
-- Uma linha por fato comercial/operacional real. `source_key` é a
-- identidade idempotente: (organization_id, domain, source_table,
-- source_id). Reprocessar faz UPSERT na MESMA chave.
--
-- O motivo de `source_id` ser uuid e não texto: nenhuma origem deste
-- sistema tem chave textual de negócio estável para todos os fatos
-- (SKU do marketplace muda, número de importação é do lote). O
-- identificador físico do registro oficial é a única chave que não
-- collide entre organizações.
-- ---------------------------------------------------------------------
CREATE TABLE public.bi_facts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain public.bi_domain NOT NULL,
  source_table text NOT NULL CHECK (length(trim(source_table))>0),
  source_id uuid NOT NULL,
  -- nature do fato, conforme §17. Um mesmo valor nunca significa duas
  -- coisas: ORDER não vira REVENUE, SHIPMENT não venda SALE.
  fact_nature text NOT NULL CHECK (fact_nature IN (
    'IMPORTED_SALE','NORMALIZED_SALE','RECONCILED_SALE','SALES_ORDER','SHIPMENT',
    'DOCUMENT_FISCAL','INBOUND_DOCUMENT','CASH_MOVEMENT','RECEIVABLE','PAYABLE',
    'PRODUCTION_ORDER','PURCHASE_ORDER','RECEIPT','OPPORTUNITY','QUOTE','LEAD',
    'PARTNER_SHIPMENT','PARTNER_RETURN','INVENTORY_MOVEMENT','COST_SNAPSHOT')),
  fact_date date NOT NULL,
  occurred_at timestamptz,
  status public.bi_fact_status NOT NULL DEFAULT 'POSTED',
  -- dimensões (todas opcionais: nem todo fato tem todas)
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE SET NULL,
  store_id uuid REFERENCES public.marketplace_stores(id) ON DELETE SET NULL,
  partner_id uuid REFERENCES public.partner_profiles(id) ON DELETE SET NULL,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  representative_id uuid REFERENCES public.sales_representatives(id) ON DELETE SET NULL,
  location_id uuid REFERENCES public.inventory_locations(id) ON DELETE SET NULL,
  sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE SET NULL,
  reconciliation_id uuid REFERENCES public.partner_reconciliations(id) ON DELETE SET NULL,
  opportunity_id uuid REFERENCES public.sales_opportunities(id) ON DELETE SET NULL,
  -- Canal classificado uma única vez, por regra declarada em bi_channel_rules.
  channel text CHECK (channel IS NULL OR channel IN ('OWN_STORE','OWN_MARKETPLACE','PARTNER','B2B','INTERNAL')),
  -- medidas
  quantity numeric(20,6) NOT NULL DEFAULT 0,
  gross_amount numeric(20,6) NOT NULL DEFAULT 0,
  billable_amount numeric(20,6),
  net_amount numeric(20,6),
  cogs numeric(20,6),
  fees numeric(20,6),
  commission numeric(20,6),
  freight numeric(20,6),
  tax numeric(20,6),
  other_cost numeric(20,6),
  margin numeric(20,6),
  margin_percent numeric(20,6),
  cost_version_id uuid REFERENCES public.product_cost_versions(id) ON DELETE SET NULL,
  -- proveniência: qual versão de custo e qual metodologia produziu o número
  cost_methodology text,
  quality text NOT NULL DEFAULT 'COMPLETE' CHECK (quality IN ('COMPLETE','INCOMPLETE','UNAVAILABLE')),
  quality_notes text NOT NULL DEFAULT '',
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  source_watermark timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,domain,source_table,source_id)
);
CREATE INDEX bi_facts_org_date ON public.bi_facts(organization_id,domain,fact_date);
CREATE INDEX bi_facts_org_variant ON public.bi_facts(organization_id,variant_id,fact_date) WHERE variant_id IS NOT NULL;
CREATE INDEX bi_facts_org_partner ON public.bi_facts(organization_id,partner_id,fact_date) WHERE partner_id IS NOT NULL;
CREATE INDEX bi_facts_org_store ON public.bi_facts(organization_id,store_id,fact_date) WHERE store_id IS NOT NULL;
CREATE INDEX bi_facts_org_channel ON public.bi_facts(organization_id,channel,fact_date) WHERE channel IS NOT NULL;
CREATE INDEX bi_facts_source ON public.bi_facts(source_table,source_id);
-- O reprocessamento incremental lê por watermark; o índice precisa começar nele.
CREATE INDEX bi_facts_watermark ON public.bi_facts(organization_id,domain,source_watermark);

-- ---------------------------------------------------------------------
-- 4. SALDO HISTÓRICO DE ESTOQUE
--
-- §33 é explícito: saldo em data passada vem do Inventory Ledger, não de
-- "saldo atual menos estimativa". Esta tabela guarda o saldo ACUMULADO
-- por (variante, local, dia) processado a partir de `inventory_movements`
-- POSTED. Uma transferência gera dois movimentos (OUT na origem, IN no
-- destino) e o total físico não muda — o que o teste do §71 exige.
-- ---------------------------------------------------------------------
CREATE TABLE public.bi_inventory_daily_balance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  balance_date date NOT NULL,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id) ON DELETE CASCADE,
  location_type public.inventory_location_type NOT NULL,
  partner_id uuid,
  balance numeric(20,6) NOT NULL DEFAULT 0,
  reserved numeric(20,6) NOT NULL DEFAULT 0,
  available numeric(20,6) NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'un',
  -- movements acumulados até a data: torna a reconciliação com o ledger
  -- verificável sem reprocessar tudo.
  movements_in numeric(20,6) NOT NULL DEFAULT 0,
  movements_out numeric(20,6) NOT NULL DEFAULT 0,
  valuation_quantity numeric(20,6) NOT NULL DEFAULT 0,
  valuation_amount numeric(20,6) NOT NULL DEFAULT 0,
  last_movement_at timestamptz,
  last_sale_at timestamptz,
  source_watermark timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,balance_date,variant_id,location_id)
);
CREATE INDEX bi_inventory_daily_lookup ON public.bi_inventory_daily_balance(organization_id,variant_id,balance_date);
CREATE INDEX bi_inventory_daily_location ON public.bi_inventory_daily_balance(organization_id,location_id,balance_date);

-- ---------------------------------------------------------------------
-- 5. CLASSIFICAÇÃO ABC / XYZ
--
-- Guardamos o RESULTADO com os PARÂMETROS usados (§27). Sem os
-- parâmetros, um ABC de março não é comparável com o de setembro: os
-- limites podem ter sido editados e a base pode ser outra.
-- ---------------------------------------------------------------------
CREATE TABLE public.bi_abc_classification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  metric_key text NOT NULL,
  granularity text NOT NULL CHECK (granularity IN ('PRODUCT','VARIANT')),
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  metric_value numeric(24,6) NOT NULL,
  total_value numeric(24,6) NOT NULL,
  share numeric(12,8) NOT NULL,
  cumulative_share numeric(12,8) NOT NULL,
  class public.bi_abc_class NOT NULL,
  parameters jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id,period_start,period_end,metric_key,granularity,variant_id,class)
);
CREATE INDEX bi_abc_lookup ON public.bi_abc_classification(organization_id,period_end,metric_key);

CREATE TABLE public.bi_xyz_classification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  period_granularity text NOT NULL CHECK (period_granularity IN ('DAY','WEEK','MONTH')),
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  observations integer NOT NULL CHECK (observations>=0),
  mean_value numeric(24,6),
  stddev_value numeric(24,6),
  coefficient_of_variation numeric(24,8),
  class public.bi_xyz_class NOT NULL,
  reason text NOT NULL DEFAULT '',
  parameters jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id,period_start,period_end,period_granularity,variant_id)
);
CREATE INDEX bi_xyz_lookup ON public.bi_xyz_classification(organization_id,period_end);

-- ---------------------------------------------------------------------
-- 6. CONTROLE DE ATUALIZAÇÃO (§60) E IDEMPOTÊNCIA DE EVENTO (§12)
-- ---------------------------------------------------------------------
CREATE TABLE public.bi_processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  domain public.bi_domain,
  period_start date,
  period_end date,
  status public.bi_run_status NOT NULL DEFAULT 'RUNNING',
  mode text NOT NULL CHECK (mode IN ('INCREMENTAL','FULL')),
  source_watermark timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  processed_records integer NOT NULL DEFAULT 0,
  error_details jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_by uuid REFERENCES public.profiles(id),
  UNIQUE NULLS NOT DISTINCT (organization_id,domain,period_start,period_end,started_at)
);
CREATE INDEX bi_runs_org ON public.bi_processing_runs(organization_id,domain,started_at DESC);
-- Só um processamento por domínio e período: dois reprocessamentos
-- simultâneos do mesmo escopo produziriam escrita concorrente no mesmo fato.
CREATE UNIQUE INDEX bi_runs_single_scope ON public.bi_processing_runs(organization_id,domain,period_start,period_end)
  WHERE status='RUNNING';

CREATE TABLE public.bi_processed_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_key text NOT NULL,
  domain public.bi_domain NOT NULL,
  processing_run_id uuid REFERENCES public.bi_processing_runs(id) ON DELETE SET NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  result text NOT NULL DEFAULT 'APPLIED',
  UNIQUE (organization_id,event_key)
);

-- ---------------------------------------------------------------------
-- 7. QUALIDADE DOS DADOS (§61)
-- ---------------------------------------------------------------------
CREATE TABLE public.bi_quality_issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  domain public.bi_domain NOT NULL,
  severity public.bi_severity NOT NULL,
  status public.bi_issue_status NOT NULL DEFAULT 'OPEN',
  entity text NOT NULL,
  entity_id text NOT NULL,
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (organization_id,check_key,entity_id)
);
CREATE INDEX bi_issues_open ON public.bi_quality_issues(organization_id,status,severity);

-- ---------------------------------------------------------------------
-- 8. CONFIGURAÇÃO ANALÍTICA POR ORGANIZAÇÃO
-- ---------------------------------------------------------------------
CREATE TABLE public.bi_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  -- §7: intervalo EXCLUSIVO no fim. Um período 01/01..31/01 é
  -- [2026-01-01T00:00, 2026-02-01T00:00) no fuso da organização.
  period_end_exclusive boolean NOT NULL DEFAULT true,
  default_period text NOT NULL DEFAULT 'LAST_30_DAYS' CHECK (default_period IN
    ('TODAY','YESTERDAY','LAST_7_DAYS','LAST_30_DAYS','CURRENT_MONTH','PREVIOUS_MONTH',
     'LAST_3_MONTHS','LAST_6_MONTHS','LAST_12_MONTHS','CURRENT_YEAR','CUSTOM')),
  -- §26: valores iniciais ILUSTRATIVOS e editáveis. A classificação ABC
  -- é uma convenção de gestão, não uma verdade sobre o produto.
  abc_a_limit numeric(5,4) NOT NULL DEFAULT 0.80 CHECK (abc_a_limit>0 AND abc_a_limit<=1),
  abc_b_limit numeric(5,4) NOT NULL DEFAULT 0.95 CHECK (abc_b_limit>abc_a_limit AND abc_b_limit<=1),
  xyz_x_limit numeric(6,4) NOT NULL DEFAULT 0.50 CHECK (xyz_x_limit>=0),
  xyz_y_limit numeric(6,4) NOT NULL DEFAULT 2.00 CHECK (xyz_y_limit>xyz_x_limit),
  xyz_min_observations integer NOT NULL DEFAULT 3 CHECK (xyz_min_observations>=2),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  CHECK (abc_b_limit > abc_a_limit)
);

-- Regras de classificação de canal (§23). A classificação é feita UMA
-- vez, aqui, e nunca é adivinhada na consulta: um mesmo fato não entra
-- em dois canais.
CREATE TABLE public.bi_channel_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  fact_nature text NOT NULL,
  store_ownership_type text CHECK (store_ownership_type IN ('FACTORY','OWN','PARTNER')),
  partner_bound boolean NOT NULL DEFAULT false,
  channel text NOT NULL CHECK (channel IN ('OWN_STORE','OWN_MARKETPLACE','PARTNER','B2B','INTERNAL')),
  description text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE NULLS NOT DISTINCT (organization_id,fact_nature,store_ownership_type,partner_bound)
);

-- ---------------------------------------------------------------------
-- 9. METAS (§53) e DASHBOARDS (§54)
-- ---------------------------------------------------------------------
CREATE TABLE public.bi_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  metric_key text NOT NULL,
  dimension text NOT NULL DEFAULT 'ORGANIZATION',
  dimension_value text,
  period text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  target_value numeric(24,6) NOT NULL,
  unit text NOT NULL,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('DRAFT','ACTIVE','ARCHIVED')),
  version integer NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  approved_by uuid REFERENCES public.profiles(id),
  approved_at timestamptz,
  note text NOT NULL DEFAULT '',
  UNIQUE (organization_id,metric_key,dimension,dimension_value,period,version)
);

CREATE TABLE public.bi_dashboards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name))>0),
  description text NOT NULL DEFAULT '',
  visibility public.bi_visibility NOT NULL DEFAULT 'PRIVATE',
  is_default boolean NOT NULL DEFAULT false,
  default_filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  owner_id uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id,name)
);
CREATE UNIQUE INDEX bi_dashboards_default ON public.bi_dashboards(organization_id) WHERE is_default;

CREATE TABLE public.bi_dashboard_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  dashboard_id uuid NOT NULL REFERENCES public.bi_dashboards(id) ON DELETE CASCADE,
  widget_key text NOT NULL,
  metric_key text NOT NULL,
  domain public.bi_domain NOT NULL,
  title text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  width text NOT NULL DEFAULT 'FULL' CHECK (width IN ('THIRD','HALF','FULL')),
  chart text NOT NULL DEFAULT 'BAR' CHECK (chart IN ('KPI','BAR','LINE','PIE','TABLE','MATRIX')),
  dimension text,
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,dashboard_id,widget_key)
);

-- §16: personalização NÃO altera a definição oficial da métrica. Aqui
-- só entra período, unidades, canais, favoritos e ordem de componentes.
CREATE TABLE public.bi_user_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  default_period text,
  default_location_ids uuid[] NOT NULL DEFAULT '{}',
  default_channels text[] NOT NULL DEFAULT '{}',
  favorite_metric_keys text[] NOT NULL DEFAULT '{}',
  widget_order jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id,user_id)
);

-- ---------------------------------------------------------------------
-- 10. AUDITORIA ANALÍTICA (§65)
--
-- `audit_log` guarda o ato; aqui fica o detalhe reproduzível: período,
-- parâmetros, contagens e resultado do reprocessamento.
-- ---------------------------------------------------------------------
CREATE TABLE public.bi_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  actor_id uuid REFERENCES public.profiles(id),
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bi_audit_org ON public.bi_audit(organization_id,created_at DESC);

-- =====================================================================
-- 11. RLS — isolamento por organização e por permissão, em TODAS as tabelas
-- =====================================================================
DO $tables$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['bi_metric_definitions','bi_metric_revisions','bi_facts','bi_inventory_daily_balance',
    'bi_abc_classification','bi_xyz_classification','bi_processing_runs','bi_processed_events','bi_quality_issues',
    'bi_settings','bi_targets','bi_dashboards','bi_dashboard_widgets','bi_user_preferences','bi_audit'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO authenticated',t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
    -- Leitura: precisa de bi.read E ser membro ativo. `bi.read` sozinho
    -- não abre a porta: a organização tem que ser a do usuário.
    EXECUTE format($f$CREATE POLICY bi_read ON public.%I FOR SELECT TO authenticated
      USING ((organization_id IS NULL AND public.has_permission(
        (SELECT m.organization_id FROM public.organization_members m
          WHERE m.user_id=auth.uid() AND m.is_active LIMIT 1),'bi.read'))
        OR (organization_id IS NOT NULL AND public.has_permission(organization_id,'bi.read')))$f$,t);
  END LOOP;
END $tables$;

-- Definições globais são visíveis a qualquer membro que tenha bi.read em
-- alguma organização;métricas e dashboards privados continuam restritos.
CREATE POLICY bi_metrics_global_read ON public.bi_metric_definitions FOR SELECT TO authenticated
  USING (organization_id IS NULL AND EXISTS(SELECT 1 FROM public.organization_members m
          WHERE m.user_id=auth.uid() AND m.is_active));
DROP POLICY bi_read ON public.bi_metric_definitions;
CREATE POLICY bi_metrics_write ON public.bi_metric_definitions FOR ALL TO authenticated
  USING (organization_id IS NOT NULL AND public.has_permission(organization_id,'bi.metrics.manage'))
  WITH CHECK (organization_id IS NOT NULL AND public.has_permission(organization_id,'bi.metrics.manage'));

DO $policies$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['bi_metric_revisions','bi_facts','bi_inventory_daily_balance','bi_abc_classification',
    'bi_xyz_classification','bi_processing_runs','bi_processed_events','bi_quality_issues','bi_settings',
    'bi_targets','bi_dashboards','bi_dashboard_widgets','bi_user_preferences','bi_audit'] LOOP
    EXECUTE format('DROP POLICY bi_read ON public.%I',t);
  END LOOP;
END $policies$;

-- Escrita é sempre por RPC com checagem de permissão; RLS aqui nega
-- escrita direta para que nenhuma agregação seja adulterada de fora.
DO $write$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['bi_facts','bi_inventory_daily_balance','bi_abc_classification','bi_xyz_classification',
    'bi_processing_runs','bi_processed_events','bi_quality_issues'] LOOP
    EXECUTE format('CREATE POLICY bi_no_direct_write ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',t);
  END LOOP;
  FOREACH t IN ARRAY ARRAY['bi_settings','bi_targets','bi_dashboards','bi_dashboard_widgets'] LOOP
    EXECUTE format($f$CREATE POLICY bi_manage ON public.%I FOR ALL TO authenticated
      USING (public.has_permission(organization_id,'bi.dashboards.manage'))
      WITH CHECK (public.has_permission(organization_id,'bi.dashboards.manage'))$f$,t);
  END LOOP;
  EXECUTE $f$CREATE POLICY bi_own_prefs ON public.bi_user_preferences FOR ALL TO authenticated
    USING (user_id=auth.uid() OR public.has_permission(organization_id,'bi.dashboards.manage'))
    WITH CHECK (user_id=auth.uid() OR public.has_permission(organization_id,'bi.dashboards.manage'))$f$;
  EXECUTE $f$CREATE POLICY bi_targets_manage ON public.bi_targets FOR ALL TO authenticated
    USING (public.has_permission(organization_id,'bi.targets.manage'))
    WITH CHECK (public.has_permission(organization_id,'bi.targets.manage'))$f$;
END $write$;

-- Dashboard privado só para o dono ou para quem tem bi.dashboards.manage.
CREATE POLICY bi_dashboards_read ON public.bi_dashboards FOR SELECT TO authenticated
  USING (visibility='ORGANIZATION' OR owner_id=auth.uid() OR public.has_permission(organization_id,'bi.dashboards.manage'));
CREATE POLICY bi_dashboards_manage ON public.bi_dashboards FOR ALL TO authenticated
  USING (public.has_permission(organization_id,'bi.dashboards.manage'))
  WITH CHECK (public.has_permission(organization_id,'bi.dashboards.manage'));

-- Metas: leitura exige bi.read; escrita exige bi.targets.manage.
CREATE POLICY bi_targets_read ON public.bi_targets FOR SELECT TO authenticated
  USING (public.has_permission(organization_id,'bi.read'));
CREATE POLICY bi_user_prefs_read ON public.bi_user_preferences FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.has_permission(organization_id,'bi.dashboards.manage'));

-- ---------------------------------------------------------------------
-- 12. GUARDA DE FÓRMULA
--
-- Uma organização não pode declarar a mesma `metric_key` de uma métrica
-- global: se pudesse, `bi_resolve_metric` teria duas fórmulas para a
-- mesma chave e a tela escolheria uma silenciosamente.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_metric_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.organization_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.bi_metric_definitions g
   WHERE g.organization_id IS NULL AND g.metric_key=NEW.metric_key AND g.status='ACTIVE') THEN
   RAISE EXCEPTION 'A métrica % já possui definição global; a organização não pode redefini-la.',NEW.metric_key;
 END IF;
 IF TG_OP='UPDATE' AND NEW.formula IS DISTINCT FROM OLD.formula THEN
   INSERT INTO public.bi_metric_revisions(organization_id,metric_definition_id,version,formula,change_reason,snapshot,created_by)
   VALUES (NEW.organization_id,NEW.id,OLD.version+1,OLD.formula,coalesce(NEW.description,''),to_jsonb(OLD),auth.uid());
 END IF;
 NEW.updated_at:=now();
 RETURN NEW;
END $$;
CREATE TRIGGER bi_metric_guard BEFORE INSERT OR UPDATE ON public.bi_metric_definitions
  FOR EACH ROW EXECUTE FUNCTION public.bi_metric_guard();
REVOKE ALL ON FUNCTION public.bi_metric_guard() FROM PUBLIC,anon,authenticated;

-- ---------------------------------------------------------------------
-- 13. HELPERS
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_require(_org uuid,_permission text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(_org,_permission) THEN
    RAISE EXCEPTION 'Sem permissão: %',_permission;
  END IF;
END $$;

CREATE FUNCTION public.bi_audit(_org uuid,_action text,_entity text,_entity_id text,_context jsonb DEFAULT '{}') RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
INSERT INTO public.bi_audit(organization_id,action,entity,entity_id,actor_id,context)
VALUES (_org,_action,_entity,_entity_id,auth.uid(),_context);
$$;

-- Resolução de métrica: GLOBAL vence sempre; a organização só acrescenta
-- chaves que não existem globalmente.
CREATE FUNCTION public.bi_resolve_metric(_org uuid,_key text,_version integer DEFAULT NULL)
RETURNS TABLE(metric_key text,metric_name text,description text,business_domain text,formula text,unit text,
              aggregation_method text,date_dimension text,source_description text,limitations text,
              periodicity text,granularity text,version integer,status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT m.metric_key,m.metric_name,m.description,m.business_domain::text,m.formula,m.unit::text,m.aggregation_method,
   m.date_dimension,m.source_description,m.limitations,m.periodicity,m.granularity,m.version,m.status::text
 FROM public.bi_metric_definitions m
 WHERE m.metric_key=_key AND m.status='ACTIVE'
   AND (m.organization_id IS NULL OR m.organization_id=_org)
   AND (_version IS NULL OR m.version=_version)
 ORDER BY (m.organization_id IS NOT NULL) ASC, m.version DESC LIMIT 1;
$$;

-- Período canônico, em metadados. §7: todo recorte é
-- [period_start, period_end) no fuso da organização, e o fim é exclusivo
-- para não contar duas vezes a virada de dia/mês.
CREATE FUNCTION public.bi_resolve_period(_preset text,_from date DEFAULT NULL,_to date DEFAULT NULL)
RETURNS TABLE(period_start date,period_end date,preset text)
LANGUAGE plpgsql STABLE AS $$
DECLARE d date := current_date; s date; e date;
BEGIN
 preset:=coalesce(_preset,'LAST_30_DAYS');
 IF preset='CUSTOM' THEN
   IF _from IS NULL OR _to IS NULL THEN RAISE EXCEPTION 'Período personalizado exige início e fim.'; END IF;
   s:=_from; e:=_to+1; -- exclusivo
 ELSE
   CASE preset
     WHEN 'TODAY' THEN s:=d; e:=d+1;
     WHEN 'YESTERDAY' THEN s:=d-1; e:=d;
     WHEN 'LAST_7_DAYS' THEN s:=d-6; e:=d+1;
     WHEN 'LAST_30_DAYS' THEN s:=d-29; e:=d+1;
     WHEN 'CURRENT_MONTH' THEN s:=date_trunc('month',d)::date; e:=s+interval '1 month';
     WHEN 'PREVIOUS_MONTH' THEN s:=date_trunc('month',d)::date-interval '1 month'; e:=s+interval '1 month';
     WHEN 'LAST_3_MONTHS' THEN s:=date_trunc('month',d)::date-interval '2 months'; e:=s+interval '3 months';
     WHEN 'LAST_6_MONTHS' THEN s:=date_trunc('month',d)::date-interval '5 months'; e:=s+interval '6 months';
     WHEN 'LAST_12_MONTHS' THEN s:=date_trunc('month',d)::date-interval '11 months'; e:=s+interval '12 months';
     WHEN 'CURRENT_YEAR' THEN s:=date_trunc('year',d)::date; e:=s+interval '1 year';
     ELSE RAISE EXCEPTION 'Período desconhecido: %',preset;
   END CASE;
 END IF;
 period_start:=s::date; period_end:=e::date; RETURN NEXT;
END $$;

CREATE FUNCTION public.bi_get_settings(_org uuid) RETURNS public.bi_settings
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT s FROM public.bi_settings s WHERE s.organization_id=_org), s0.*)
  FROM (SELECT 'America/Sao_Paulo'::text timezone,true period_end_exclusive,'LAST_30_DAYS'::text default_period,
               .80::numeric abc_a_limit,.95::numeric abc_b_limit,.50::numeric xyz_x_limit,
               2.00::numeric xyz_y_limit,3::integer xyz_min_observations,_org organization_id) s0;
$$;

-- ---------------------------------------------------------------------
-- 14. CATÁLOGO GLOBAL DE MÉTRICAS
--
-- Cada linha declara: fórmula, fonte oficial, dimensões compatíveis e
-- limitações. `limitations` não é decoração: é o que impede a tela de
-- apresentar um número parcial como integral.
-- ---------------------------------------------------------------------
INSERT INTO public.bi_metric_definitions
 (organization_id,metric_key,metric_name,description,business_domain,formula,unit,aggregation_method,
  date_dimension,source_description,available_filters,compatible_dimensions,periodicity,granularity,limitations,status)
VALUES
 (NULL,'sales.quantity_reconciled','Quantidade vendida reconciliada',
  'Unidades efetivamente vendidas por parceiro e confirmadas em fechamento de reconciliação.',
  'SALES','SUM(quantity) de bi_facts com fact_nature=RECONCILED_SALE e status=RECONCILED.',
  'UNIT','SUM','fact_date (data da venda no marketplace)',
  'bi_facts derivado de marketplace_sales status RECONCILED, mesma linha da venda importada.',
  ARRAY['period','partner','store','variant','product','channel','marketplace'],
  ARRAY['ORGANIZATION','PARTNER','STORE','VARIANT','PRODUCT','CHANNEL','PERIOD','CATEGORY'],
  'DAILY','DAY',
  'Não inclui venda pendente de conciliação. Uma venda importada e depois reconciliada permanece uma única venda.',  'ACTIVE'),

 (NULL,'sales.quantity_imported','Quantidade vendida importada',
  'Unidades recebidas de importação de marketplace, ainda não confirmadas em conciliação.',
  'SALES','SUM(quantity) de bi_facts com fact_nature=IMPORTED_SALE e status<>CANCELED.',
  'UNIT','SUM','fact_date',
  'bi_facts derivado de marketplace_sales com status IMPORTED/VALIDATED/EXCEPTION.',
  ARRAY['period','partner','store','variant','product','channel'],
  ARRAY['ORGANIZATION','PARTNER','STORE','VARIANT','PRODUCT','CHANNEL','PERIOD'],
  'DAILY','DAY','Inclui vendas pendentes de conciliação; não é receita da fábrica.',  'ACTIVE'),

 (NULL,'sales.billable_revenue','Receita faturável',
  'Valor que o parceiro deve à fábrica pelas vendas reconciliadas.',
  'SALES','SUM(billable_amount) de bi_facts RECONCILED_SALE. NÃO é o valor bruto vendido no marketplace.',
  'CURRENCY','SUM','fact_date','partner_reconciliation_items.billable_amount, capturado no fechamento.',
  ARRAY['period','partner','store','variant','product','channel'],
  ARRAY['ORGANIZATION','PARTNER','STORE','VARIANT','PRODUCT','CHANNEL','PERIOD'],
  'MONTHLY','DAY','Valor bruto no marketplace NÃO pode ser somado aqui: é receita do parceiro, não da fábrica.',  'ACTIVE'),

 (NULL,'sales.gross_revenue_collected','Valor bruto vendido no marketplace',
  'Valor cobrado do consumidor pelo parceiro, incluindo frete e descontos.',
  'SALES','SUM(gross_amount) de bi_facts de venda do parceiro.',
  'CURRENCY','SUM','fact_date','marketplace_sales.gross_amount.',
  ARRAY['period','partner','store','variant','product','channel'],
  ARRAY['PARTNER','STORE','VARIANT','PRODUCT','CHANNEL','PERIOD'],
  'DAILY','DAY','Indicador do canal, não da fábrica. Nunca somar com receita faturável.',  'ACTIVE'),

 (NULL,'sales.b2b_order_value','Valor de pedidos comerciais B2B',
  'Valor total de pedidos de venda criados para clientes diretos.',
  'SALES','SUM(total_amount) de bi_facts fact_nature=SALES_ORDER status<>CANCELED.',
  'CURRENCY','SUM','order_date','sales_orders.total_amount.',
  ARRAY['period','company','representative','status'],
  ARRAY['ORGANIZATION','COMPANY','REPRESENTATIVE','PERIOD','STATUS'],
  'DAILY','DAY','Pedido é intenção comercial, não faturamento e não recebimento.',  'ACTIVE'),

 (NULL,'sales.orders_shipped','Pedidos expedidos',
  'Pedidos com expedição despachada, por valor de mercadoria expedida.',
  'SALES','COUNT de bi_facts fact_nature=SHIPMENT agrupado por pedido.',
  'COUNT','DISTINCT_COUNT','fact_date','shipments com dispatched_at não nulo.',
  ARRAY['period','company','carrier'],
  ARRAY['ORGANIZATION','COMPANY','PERIOD','CARRIER'],
  'DAILY','DAY','Mercadoria expedida não é venda: devolução posterior reduz o realizado.',  'ACTIVE'),

 (NULL,'sales.average_price_realized','Preço médio realizado',
  'Receita faturável dividida pela quantidade vendida reconciliada.',
  'SALES','SUM(billable_amount)/NULLIF(SUM(quantity),0) sobre RECONCILED_SALE.',
  'CURRENCY','RATIO','fact_date','bi_facts reconciliados.',
  ARRAY['period','partner','variant','product','channel'],
  ARRAY['PARTNER','VARIANT','PRODUCT','CHANNEL','PERIOD'],
  'DAILY','DAY','Indefinido quando a quantidade do período é zero; a tela mostra indisponível.',  'ACTIVE'),

 (NULL,'sales.margin_industrial','Margem bruta gerencial industrial',
  'Receita faturável menos custo industrial apurado dos itens vendidos.',
  'COSTS','SUM(billable_amount - cogs) sobre RECONCILED_SALE com custo válido.',
  'CURRENCY','SUM','fact_date','bi_facts.cogs cruzado com product_cost_versions (MASTER 009).',
  ARRAY['period','partner','variant','product','channel'],
  ARRAY['ORGANIZATION','PARTNER','VARIANT','PRODUCT','CHANNEL','PERIOD'],
  'MONTHLY','DAY','Exibe somente itens com custo publicado. Itens sem custo ficam como pendência, nunca como margem zero.',  'ACTIVE'),

 (NULL,'partners.stock_third_parties','Estoque em terceiros',
  'Saldo físico em locais de parceiros, apurado pelo Inventory Ledger.',
  'INVENTORY','SUM(balance) de bi_inventory_daily_balance com location_type=PARTNER na data mais recente.',
  'UNIT','SNAPSHOT','balance_date','inventory_movements POSTED agregados por local.',
  ARRAY['period','partner','location','variant'],
  ARRAY['PARTNER','LOCATION','VARIANT','PERIOD'],
  'DAILY','DAY','É posição física, não venda. Remessa para parceiro aumenta este saldo.',  'ACTIVE'),

 (NULL,'partners.shipped_quantity','Quantidade remetida a parceiros',
  'Unidades expedidas do estoque da fábrica para estoque do parceiro.',
  'PARTNERS','SUM(quantity) de bi_facts fact_nature=PARTNER_SHIPMENT.',
  'UNIT','SUM','fact_date','partner_shipment_items com remessa despachada.',
  ARRAY['period','partner','variant','product'],
  ARRAY['PARTNER','VARIANT','PRODUCT','PERIOD'],
  'DAILY','DAY','Remessa NÃO é venda. Somar remessa e venda reconciliada produz unidade duplicada.',  'ACTIVE'),

 (NULL,'partners.pending_reconciliation','Vendas pendentes de reconciliação',
  'Vendas importadas ainda não confirmadas em fechamento.',
  'PARTNERS','SUM(quantity) de vendas com status<>RECONCILED e <>CANCELED.',
  'UNIT','SUM','sale_date','marketplace_sales pendentes.',
  ARRAY['period','partner','store'],
  ARRAY['PARTNER','STORE','PERIOD'],
  'DAILY','DAY','Não é receita realizável.',  'ACTIVE'),

 (NULL,'partners.receivable_open','Recebíveis de parceiros em aberto',
  'Títulos a receber de parceiros originados em reconciliação.',
  'FINANCIAL','SUM(open_amount) de account_receivables de parceiro com status não pago.',
  'CURRENCY','SNAPSHOT','due_date','account_receivables (MASTER financeiro).',
  ARRAY['period','partner','status','overdue'],
  ARRAY['PARTNER','STATUS','PERIOD'],
  'DAILY','DAY','Título a receber não é caixa recebido.',  'ACTIVE'),

 (NULL,'inventory.total_balance','Estoque físico total',
  'Soma de todos os saldos de produto em todas as localizações.',
  'INVENTORY','SUM(balance) de bi_inventory_daily_balance na data consultada.',
  'UNIT','SNAPSHOT','balance_date','inventory_movements POSTED (fonte oficial).',
  ARRAY['period','location','location_type','partner','variant','product'],
  ARRAY['LOCATION','LOCATION_TYPE','PARTNER','VARIANT','PRODUCT','PERIOD'],
  'DAILY','DAY','Transferência não altera o total físico: só move entre locais.',  'ACTIVE'),

 (NULL,'inventory.available_balance','Estoque disponível',
  'Saldo físico menos reservas ativas.',
  'INVENTORY','SUM(available) de bi_inventory_daily_balance na data consultada.',
  'UNIT','SNAPSHOT','balance_date','inventory_movements menos inventory_reservations ativas.',
  ARRAY['period','location','variant','product'],
  ARRAY['LOCATION','VARIANT','PRODUCT','PERIOD'],
  'DAILY','DAY','Reserva não sai do estoque físico; só reduz a disponibilidade.',  'ACTIVE'),

 (NULL,'inventory.turnover','Giro de estoque',
  'Custo dos produtos vendidos dividido pelo estoque médio valorizado.',
  'INVENTORY','SUM(cogs de vendas reconciliadas no período) / estoque médio valorizado do mesmo período.',
  'RATIO','RATIO','fact_date','bi_facts.cogs e bi_inventory_daily_balance.valuation_amount.',
  ARRAY['period','product','variant','category'],
  ARRAY['PRODUCT','VARIANT','CATEGORY','PERIOD'],
  'MONTHLY','MONTH','Numerador é CUSTO, não receita. Usar receita aqui seria outro indicador, com outro nome.',  'ACTIVE'),

 (NULL,'inventory.days_of_coverage','Dias de cobertura',
  'Demanda média diária observada multiplicada pelo saldo disponível.',
  'INVENTORY','SUM(available) / (SUM(quantity do período) / GREATEST(dias do período,1)).',
  'DAYS','RATIO','balance_date','bi_inventory_daily_balance e vendas reconciliadas.',
  ARRAY['period','variant','product','location'],
  ARRAY['VARIANT','PRODUCT','LOCATION','PERIOD'],
  'DAILY','DAY','Indisponível sem demanda média válida. Não se projeta com histórico insuficiente.',  'ACTIVE'),

 (NULL,'inventory.days_since_last_movement','Dias sem movimentação',
  'Dias desde o último movimento de estoque do item.',
  'INVENTORY','(data de referência - max(occurred_at do item)).',
  'DAYS','SNAPSHOT','balance_date','bi_inventory_daily_balance.last_movement_at.',
  ARRAY['period','variant','product','location'],
  ARRAY['VARIANT','PRODUCT','LOCATION','PERIOD'],
  'DAILY','DAY','Dias sem movimentação NÃO classificam o estoque como obsoleto: isso exige política configurada.',  'ACTIVE'),

 (NULL,'production.planned_quantity','Quantidade planejada',
  'Soma das quantidades planejadas das ordens de produção abertas e concluídas.',
  'PRODUCTION','SUM(planned_quantity) de bi_facts fact_nature=PRODUCTION_ORDER.',
  'UNIT','SUM','fact_date','production_orders.planned_quantity.',
  ARRAY['period','status','variant','product'],
  ARRAY['STATUS','VARIANT','PRODUCT','PERIOD'],
  'DAILY','DAY','Planejada não é realizada.',  'ACTIVE'),

 (NULL,'production.produced_quantity','Quantidade produzida',
  'Soma das quantidades boas apontadas em produção.',
  'PRODUCTION','SUM(quantity) de bi_facts fact_nature=PRODUCTION_ORDER (good output).',
  'UNIT','SUM','fact_date','production_outputs.quantity_good.',
  ARRAY['period','status','variant','product'],
  ARRAY['STATUS','VARIANT','PRODUCT','PERIOD'],
  'DAILY','DAY','Não inclui rejeição.',  'ACTIVE'),

 (NULL,'production.efficiency','Eficiência produtiva',
  'Quantidade realizada dividida pela quantidade planejada.',
  'PRODUCTION','SUM(produced_quantity)/NULLIF(SUM(planned_quantity),0).',
  'PERCENT','RATIO','fact_date','production_orders planned x produced.',
  ARRAY['period','variant','product','status'],
  ARRAY['VARIANT','PRODUCT','STATUS','PERIOD'],
  'MONTHLY','MONTH','Só existe se a ordem tiver apontamento real. Não estima produção não registrada.',  'ACTIVE'),

 (NULL,'production.loss_quantity','Perdas de produção',
  'Quantidade perdida e rejeitada em produção.',
  'PRODUCTION','SUM(quantity) de perdas e SUM(quantity_rejected) de apontamentos.',
  'UNIT','SUM','fact_date','production_losses e production_outputs.quantity_rejected.',
  ARRAY['period','variant','reason'],
  ARRAY['VARIANT','PRODUCT','REASON','PERIOD'],
  'DAILY','DAY','Perda de produção é diferente de perda de estoque em trânsito.',  'ACTIVE'),

 (NULL,'procurement.ordered_value','Valor de pedidos de compra',
  'Valor total de pedidos de compra emitidos.',
  'PROCUREMENT','SUM(total_amount) de bi_facts fact_nature=PURCHASE_ORDER status<>CANCELED.',
  'CURRENCY','SUM','issue_date','purchase_orders.total_amount.',
  ARRAY['period','supplier','status'],
  ARRAY['SUPPLIER','STATUS','PERIOD'],
  'DAILY','DAY','Pedido de compra não é despesa reconhecida nem pagamento.',  'ACTIVE'),

 (NULL,'procurement.received_quantity','Quantidade recebida',
  'Quantidade efetivamente recebida e aceita.',
  'PROCUREMENT','SUM(received_quantity) de bi_facts fact_nature=RECEIPT.',
  'UNIT','SUM','received_at','goods_receipts aceitos.',
  ARRAY['period','supplier','variant','product'],
  ARRAY['SUPPLIER','VARIANT','PRODUCT','PERIOD'],
  'DAILY','DAY','Recebimento divergente do pedido vira pendência, não entra como recebido.',  'ACTIVE'),

 (NULL,'procurement.lead_time_observed','Prazo de entrega observado',
  'Média de dias entre emissão do pedido e recebimento do lote.',
  'PROCUREMENT','AVG(received_at - issue_date) de pedidos com recebimento.',
  'DAYS','AVERAGE','received_at','purchase_orders e goods_receipts.',
  ARRAY['period','supplier'],
  ARRAY['SUPPLIER','PERIOD'],
  'MONTHLY','MONTH','Não produz classificação automática de fornecedor.',  'ACTIVE'),

 (NULL,'financial.receivable_open','Contas a receber em aberto',
  'Soma dos títulos a receber com saldo em aberto.',
  'FINANCIAL','SUM(open_amount) de account_receivables com status não pago e não cancelado.',
  'CURRENCY','SNAPSHOT','due_date','account_receivables (fonte oficial).',
  ARRAY['period','company','status','overdue','category'],
  ARRAY['COMPANY','STATUS','CATEGORY','PERIOD'],
  'DAILY','DAY','Recebível não é caixa.',  'ACTIVE'),

 (NULL,'financial.payable_open','Contas a pagar em aberto',
  'Soma dos títulos a pagar com saldo em aberto.',
  'FINANCIAL','SUM(open_amount) de account_payables com status não pago e não cancelado.',
  'CURRENCY','SNAPSHOT','due_date','account_payables (fonte oficial).',
  ARRAY['period','company','supplier','status','overdue'],
  ARRAY['COMPANY','STATUS','PERIOD'],
  'DAILY','DAY','Obrigação não é pagamento.',  'ACTIVE'),

 (NULL,'financial.overdue_receivable','Recebíveis vencidos',
  'Títulos a receber com vencimento anterior à data de referência e saldo maior que zero.',
  'FINANCIAL','SUM(open_amount) de account_receivables vencidos.',
  'CURRENCY','SNAPSHOT','due_date','account_receivables.',
  ARRAY['period','company','days_overdue'],
  ARRAY['COMPANY','PERIOD'],
  'DAILY','DAY','Vencido é título, não perda: não presume inadimplência definitiva.',  'ACTIVE'),

 (NULL,'financial.cash_in','Caixa recebido',
  'Movimentações de entrada efetivamente lançadas no Financial Ledger.',
  'FINANCIAL','SUM(amount) de financial_transactions direction=IN.',
  'CURRENCY','SUM','occurred_at','financial_transactions POSTED (fonte oficial).',
  ARRAY['period','account','category','cost_center','company'],
  ARRAY['ACCOUNT','CATEGORY','COMPANY','COST_CENTER','PERIOD'],
  'DAILY','DAY','Caixa recebido não é receita e não é venda.',  'ACTIVE'),

 (NULL,'financial.cash_out','Caixa pago',
  'Movimentações de saída efetivamente lançadas no Financial Ledger.',
  'FINANCIAL','SUM(amount) de financial_transactions direction=OUT.',
  'CURRENCY','SUM','occurred_at','financial_transactions POSTED.',
  ARRAY['period','account','category','cost_center','company'],
  ARRAY['ACCOUNT','CATEGORY','COMPANY','COST_CENTER','PERIOD'],
  'DAILY','DAY','Pagamento não é despesa do período se Recognize só no recebimento.',  'ACTIVE'),

 (NULL,'financial.cash_flow_projected','Fluxo de caixa projetado',
  'Soma de títulos com vencimento no período e saldo em aberto.',
  'FINANCIAL','SUM(open_amount) de recebíveis futuros - SUM(open_amount) de pagáveis futuros.',
  'CURRENCY','SNAPSHOT','due_date','account_receivables e account_payables em aberto.',
  ARRAY['period','company','account'],
  ARRAY['COMPANY','ACCOUNT','PERIOD'],
  'DAILY','DAY','PROJEÇÃO. Não pode ser somado ao caixa realizado no mesmo total.',  'ACTIVE'),

 (NULL,'financial.inadimplency_rate','Inadimplência',
  'Percentual do valor a receber total que está vencido.',
  'FINANCIAL','SUM(open_amount vencido)/NULLIF(SUM(original_amount) do mesmo conjunto,0).',
  'PERCENT','RATIO','due_date','account_receivables.',
  ARRAY['period','company','category'],
  ARRAY['COMPANY','CATEGORY','PERIOD'],
  'MONTHLY','MONTH','Fórmula documentada aqui; nome é o do MASTER, medida é carteira vencida sobre carteira total.',  'ACTIVE'),

 (NULL,'crm.leads_total','Leads cadastrados',
  'Total de leads no período, por estado real do CRM.',
  'CRM','COUNT de leads criados, agrupados por status.',
  'COUNT','DISTINCT_COUNT','created_at','leads.',
  ARRAY['period','status','source','segment','representative'],
  ARRAY['STATUS','SOURCE','SEGMENT','PERIOD'],
  'DAILY','DAY','Lead não é oportunidade e não é pedido.',  'ACTIVE'),

 (NULL,'crm.conversion_rate','Taxa de conversão de lead',
  'Percentual de leads que viraram empresa cliente.',
  'CRM','COUNT(leads status=CONVERTED)/NULLIF(COUNT(leads),0).',
  'PERCENT','RATIO','converted_at','leads.',
  ARRAY['period','source','segment','representative'],
  ARRAY['SOURCE','SEGMENT','PERIOD'],
  'MONTHLY','MONTH','Conversão observada no CRM; não mediq nenhuma receita.',  'ACTIVE'),

 (NULL,'crm.pipeline_value','Valor estimado de oportunidades',
  'Soma do valor estimado das oportunidades abertas.',
  'CRM','SUM(estimated_value) de sales_opportunities com status=OPEN.',
  'CURRENCY','SUM','created_at','sales_opportunities.',
  ARRAY['period','stage','representative','pipeline','status'],
  ARRAY['STAGE','REPRESENTATIVE','PIPELINE','STATUS','PERIOD'],
  'DAILY','DAY','Valor ESTIMADO. Nunca somar com proposta aceita ou pedido: não são receitas independentes.',  'ACTIVE'),

 (NULL,'crm.quotes_value','Valor de propostas',
  'Soma do total de propostas por estado.',
  'CRM','SUM(total) de sales_quotes agrupado por status.',
  'CURRENCY','SUM','issue_date','sales_quotes.',
  ARRAY['period','status','representative','company'],
  ARRAY['STATUS','REPRESENTATIVE','COMPANY','PERIOD'],
  'DAILY','DAY','Proposta não é pedido, faturamento ou recebimento.',  'ACTIVE'),

 (NULL,'crm.quote_acceptance_rate','Taxa de aceite de propostas',
  'Percentual de propostas aceitas sobre as enviadas.',
  'CRM','COUNT(status=ACCEPTED)/NULLIF(COUNT(status IN (SENT,ACCEPTED,REJECTED)),0).',
  'PERCENT','RATIO','issue_date','sales_quotes.',
  ARRAY['period','representative','company'],
  ARRAY['REPRESENTATIVE','COMPANY','PERIOD'],
  'MONTHLY','MONTH','Aceite registrado; não implica faturamento.',  'ACTIVE'),

 (NULL,'crm.sales_by_representative','Vendas por representante',
  'Receita faturável atribuída ao representante do pedido.',
  'CRM','SUM(billable_amount) de vendas com representative_id.',
  'CURRENCY','SUM','fact_date','bi_facts reconciliados com representative_id.',
  ARRAY['period','representative','channel'],
  ARRAY['REPRESENTATIVE','CHANNEL','PERIOD'],
  'DAILY','DAY','Comissões estimadas e apuradas são indicadores separados.',  'ACTIVE'),

 (NULL,'fiscal.documents_prepared','Documentos fiscais preparados',
  'Documentos fiscais em qualquer estado anterior à autorização.',
  'FISCAL','COUNT de documentos com status anterior a AUTHORIZED.',
  'DOCUMENT','DISTINCT_COUNT','issue_date','fiscal_documents (MASTER 014).',
  ARRAY['period','status','establishment','source_type'],
  ARRAY['STATUS','ESTABLISHMENT','SOURCE_TYPE','PERIOD'],
  'DAILY','DAY','Documento preparado nao e NF-e autorizada e nao comprova duvida.',  'ACTIVE'),

 (NULL,'fiscal.documents_authorized','Documentos fiscais autorizados',
  'Documentos com protocolo de autorização registrado.',
  'FISCAL','COUNT de fiscal_documents com status=AUTHORIZED e authorization_protocol não nulo.',
  'DOCUMENT','DISTINCT_COUNT','issue_date','fiscal_documents autorizados.',
  ARRAY['period','establishment','source_type'],
  ARRAY['ESTABLISHMENT','SOURCE_TYPE','PERIOD'],
  'DAILY','DAY','Somente documento efetivamente autorizado pelo provedor conta como autorizado.',  'ACTIVE'),

 (NULL,'fiscal.pending_issues','Pendências fiscais',
  'Exceções fiscais em aberto.',
  'FISCAL','COUNT de fiscal_exceptions com status<>RESOLVED.',
  'DOCUMENT','DISTINCT_COUNT','created_at','fiscal_exceptions.',
  ARRAY['period','severity','responsible'],
  ARRAY['SEVERITY','RESPONSIBLE','PERIOD'],
  'DAILY','DAY','O BI não calcula obrigação tributária a partir de estimativa.',  'ACTIVE'),

 (NULL,'bi.abc_class','Classificação ABC',
  'Classe do item na curva ABC segundo a base e os limites configurados.',
  'INVENTORY','Classe atribuída pela participação acumulada sobre a base escolhida.',
  'COUNT','LAST','period_end','bi_abc_classification.',
  ARRAY['period','metric_key','granularity','class'],
  ARRAY['CLASS','VARIANT','PRODUCT','PERIOD'],
  'ON_DEMAND','DAY','Convenção de gestão configurável. Não é avaliação universal de importância do produto.',  'ACTIVE'),

 (NULL,'bi.xyz_class','Classificação XYZ',
  'Classe do item na curva XYZ por variabilidade da demanda.',
  'INVENTORY','Classe atribuída pelo coeficiente de variação sobre o histórico válido.',
  'COUNT','LAST','period_end','bi_xyz_classification.',
  ARRAY['period','granularity','class'],
  ARRAY['CLASS','VARIANT','PRODUCT','PERIOD'],
  'ON_DEMAND','DAY','Exige histórico suficiente. Sem ele a classificação é indisponível, não "X".',  'ACTIVE');
COMMIT;
