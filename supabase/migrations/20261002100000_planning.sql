-- =====================================================================
-- MASTER 011: Planejamento de demanda, MRP, reposição e necessidades de
-- produção.
--
-- Princípios:
--  * PLANEJAMENTO NÃO É EXECUÇÃO. Este módulo calcula, projeta, sugere,
--    alerta, prioriza e simula. NUNCA compra, produz ou movimenta estoque
--    por conta própria. Toda materialização passa por decisão humana
--    (convert -> PurchaseRequest / ProductionOrder) usando os módulos
--    MASTER 010 (compras) e MASTER 004 (produção).
--  * PlanningRun COMPLETED é um SNAPSHOT histórico: parâmetros, leituras
--    e BOMs usados são preservados; alterações futuras de estoque mínimo,
--    lead time, BOM ou forecast NÃO reescrevem o run. Recalcular = novo run.
--  * Estoque em parceiro/marketplace NÃO é disponível para produção.
--    Apenas localizações configuradas em planning_availability participam
--    (padrão: FACTORY, WAREHOUSE, OWN_STORE). TRÂNSITO é tratado à parte.
--  * Pedido de compra entra SOMENTE pela quantidade pendente
--    (ordered - received). Produção entra SOMENTE pela quantidade pendente
--    ainda não lançada (planned - produced).
--  * Toda sugestão é explicável (coluna `why`) e auditável.
-- =====================================================================
BEGIN;

-- =====================================================================
-- 1. Novos campos em entidades existentes (idempotente).
-- =====================================================================
-- Estoque de segurança por variante (MASTER 011). minimum_stock continua
-- sendo o piso de reposição do MASTER 010; safety_stock é o buffer do MRP
-- aplicado sobre a projeção.
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS safety_stock numeric(14,3) NOT NULL DEFAULT 0;

-- Lead time de produção por ficha técnica (produto/variante).
ALTER TABLE public.bill_of_materials
  ADD COLUMN IF NOT EXISTS production_lead_time_days integer;
ALTER TABLE public.bill_of_materials
  ADD CONSTRAINT bill_of_materials_prod_lead_check CHECK (production_lead_time_days IS NULL OR production_lead_time_days >= 0);

-- Múltiplo de compra / pack size do catálogo do fornecedor (MASTER 011).
-- Ex.: fornecedor vende caixas de 12 -> order_multiple = 12.
ALTER TABLE public.supplier_products
  ADD COLUMN IF NOT EXISTS order_multiple numeric(14,3);
ALTER TABLE public.supplier_products
  ADD CONSTRAINT supplier_products_order_multiple_check CHECK (order_multiple IS NULL OR order_multiple > 0);

-- =====================================================================
-- 2. Tabelas do Planejamento.
-- =====================================================================

-- 2.1 Configurações do planejamento (1 linha por organização).
CREATE TABLE IF NOT EXISTS public.planning_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  demand_sources jsonb NOT NULL DEFAULT '["HISTORICAL_SALES","MANUAL_FORECAST","MINIMUM_STOCK"]',
  demand_priority jsonb NOT NULL DEFAULT '["MANUAL_FORECAST","HISTORICAL_SALES","MINIMUM_STOCK"]',
  forecast_method text NOT NULL DEFAULT 'SIMPLE_MOVING_AVERAGE'
    CHECK (forecast_method IN ('SIMPLE_MOVING_AVERAGE','WEIGHTED_MOVING_AVERAGE')),
  weighted_weights jsonb NOT NULL DEFAULT '[5,4,3,2,1]',
  projection_days integer NOT NULL DEFAULT 30 CHECK (projection_days BETWEEN 1 AND 365),
  history_days integer NOT NULL DEFAULT 90 CHECK (history_days BETWEEN 1 AND 1095),
  min_history_days integer NOT NULL DEFAULT 30 CHECK (min_history_days BETWEEN 1 AND 365),
  minimum_stock_demand boolean NOT NULL DEFAULT true,
  time_bucket text NOT NULL DEFAULT 'WEEKLY' CHECK (time_bucket IN ('DAILY','WEEKLY')),
  lead_time_policy text NOT NULL DEFAULT 'USE_CONFIGURED'
    CHECK (lead_time_policy IN ('USE_CONFIGURED','USE_OBSERVED','USE_MANUAL')),
  lead_time_overrides jsonb NOT NULL DEFAULT '{}',
  purchase_lead_time_default integer NOT NULL DEFAULT 7 CHECK (purchase_lead_time_default >= 0),
  production_lead_time_default integer NOT NULL DEFAULT 3 CHECK (production_lead_time_default >= 0),
  max_planned_orders integer NOT NULL DEFAULT 2000 CHECK (max_planned_orders > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id),
  UNIQUE (organization_id)
);

-- 2.2 Cenários de simulação (PlanningScenario).
CREATE TABLE IF NOT EXISTS public.planning_scenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  scenario_type text NOT NULL DEFAULT 'CUSTOM' CHECK (scenario_type IN ('BASE','OPTIMISTIC','CONSERVATIVE','CUSTOM')),
  demand_multiplier numeric(8,4) NOT NULL DEFAULT 1 CHECK (demand_multiplier >= 0),
  lead_time_adjustment_days integer NOT NULL DEFAULT 0,
  safety_stock_multiplier numeric(8,4) NOT NULL DEFAULT 1 CHECK (safety_stock_multiplier >= 0),
  horizon_days integer CHECK (horizon_days IS NULL OR (horizon_days BETWEEN 1 AND 365)),
  is_base boolean NOT NULL DEFAULT false,
  description text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
-- Apenas um cenário BASE por organização.
CREATE UNIQUE INDEX IF NOT EXISTS planning_scenarios_one_base_idx
  ON public.planning_scenarios (organization_id) WHERE is_base;

-- 2.3 Localizações participantes do planejamento (PlanningAvailability).
-- Inclui override de estoque de segurança POR localização, quando necessário.
CREATE TABLE IF NOT EXISTS public.planning_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.inventory_locations(id),
  include_in_planning boolean NOT NULL DEFAULT true,
  safety_stock numeric(14,3),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, location_id)
);

-- 2.4 Ajuste manual de forecast (ForecastAdjustment). Separa o valor
-- calculado do ajuste autorizado sempre de forma explícita.
CREATE TABLE IF NOT EXISTS public.forecast_adjustments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  adjustment_date date NOT NULL,
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  reason text NOT NULL CHECK (length(trim(reason)) > 0),
  created_by uuid NOT NULL REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, variant_id, adjustment_date)
);

-- 2.5 Execuções de planejamento (PlanningRun).
CREATE TABLE IF NOT EXISTS public.planning_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (length(trim(name)) > 0),
  planning_date date NOT NULL,
  horizon_start date NOT NULL,
  horizon_end date NOT NULL CHECK (horizon_end >= horizon_start),
  time_bucket text NOT NULL DEFAULT 'WEEKLY' CHECK (time_bucket IN ('DAILY','WEEKLY')),
  planning_method text NOT NULL DEFAULT 'SIMPLE_MOVING_AVERAGE'
    CHECK (planning_method IN ('SIMPLE_MOVING_AVERAGE','WEIGHTED_MOVING_AVERAGE')),
  demand_sources jsonb NOT NULL DEFAULT '[]',
  scenario_id uuid REFERENCES public.planning_scenarios(id),
  simulated boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT','PROCESSING','COMPLETED','COMPLETED_WITH_WARNINGS','FAILED','ARCHIVED')),
  parameters_snapshot jsonb NOT NULL DEFAULT '{}',
  started_at timestamptz,
  completed_at timestamptz,
  error text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);
CREATE INDEX IF NOT EXISTS planning_runs_org_created ON public.planning_runs(organization_id, created_at DESC);

-- 2.6 Sugestões planejadas (PlannedOrder). NUNCA movimenta estoque nem
-- gera obrigação financeira.
CREATE TABLE IF NOT EXISTS public.planned_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  planning_run_id uuid NOT NULL REFERENCES public.planning_runs(id),
  scenario_id uuid REFERENCES public.planning_scenarios(id),
  simulated boolean NOT NULL DEFAULT false,
  order_type text NOT NULL CHECK (order_type IN ('PRODUCTION','PURCHASE','TRANSFER')),
  status text NOT NULL DEFAULT 'SUGGESTED'
    CHECK (status IN ('SUGGESTED','REVIEWED','APPROVED','CONVERTED','DISMISSED')),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  unit_of_measure_id uuid REFERENCES public.units_of_measure(id),
  quantity numeric(14,3) NOT NULL CHECK (quantity > 0),
  required_date date NOT NULL,
  suggested_start_date date,
  suggested_order_date date,
  suggested_supplier_id uuid REFERENCES public.supplier_profiles(id),
  priority text NOT NULL DEFAULT 'NORMAL' CHECK (priority IN ('CRITICAL','HIGH','NORMAL','LOW')),
  reason text NOT NULL,
  why jsonb NOT NULL DEFAULT '{}',
  moq_applied boolean NOT NULL DEFAULT false,
  moq_value numeric(14,3),
  order_multiple numeric(14,3),
  bom_id uuid REFERENCES public.bill_of_materials(id),
  -- Rastreabilidade de conversão (idempotência e conversão parcial).
  converted_qty numeric(14,3) NOT NULL DEFAULT 0 CHECK (converted_qty >= 0),
  converted_source text CHECK (converted_source IN ('PURCHASE_REQUEST','PRODUCTION_ORDER')),
  converted_ids text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, planning_run_id, order_type, variant_id, required_date)
);
CREATE INDEX IF NOT EXISTS planned_orders_run_idx ON public.planned_orders(planning_run_id, order_type, status);
CREATE INDEX IF NOT EXISTS planned_orders_variant_idx ON public.planned_orders(organization_id, variant_id, required_date);

-- 2.7 Necessidades de material / produto por bucket (visão explicável).
CREATE TABLE IF NOT EXISTS public.material_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  planning_run_id uuid NOT NULL REFERENCES public.planning_runs(id),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  source_kind text NOT NULL CHECK (source_kind IN ('TOP','BOM')),
  parent_planned_order_id uuid REFERENCES public.planned_orders(id),
  required_quantity numeric(14,3) NOT NULL DEFAULT 0,
  available_quantity numeric(14,3) NOT NULL DEFAULT 0,
  scheduled_receipt_quantity numeric(14,3) NOT NULL DEFAULT 0,
  net_requirement numeric(14,3) NOT NULL DEFAULT 0,
  planning_quantity numeric(14,3) NOT NULL DEFAULT 0,
  required_date date NOT NULL,
  suggested_order_date date,
  lead_time_days integer,
  unit_of_measure_id uuid REFERENCES public.units_of_measure(id),
  block_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, planning_run_id, variant_id, source_kind, required_date)
);
CREATE INDEX IF NOT EXISTS material_requirements_run_idx ON public.material_requirements(planning_run_id, variant_id);

-- 2.8 Ruptura projetada (ProjectedShortage).
CREATE TABLE IF NOT EXISTS public.projected_shortages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  planning_run_id uuid NOT NULL REFERENCES public.planning_runs(id),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  shortage_date date NOT NULL,
  shortage_quantity numeric(14,3) NOT NULL CHECK (shortage_quantity > 0),
  severity text NOT NULL CHECK (severity IN ('INFO','WARNING','CRITICAL')),
  source text NOT NULL CHECK (source IN ('DEMAND','PRODUCTION_BLOCKING')),
  parent_planned_order_id uuid REFERENCES public.planned_orders(id),
  detail jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS projected_shortages_run_idx ON public.projected_shortages(planning_run_id, severity);

-- 2.9 Central de exceções de planejamento.
CREATE TABLE IF NOT EXISTS public.planning_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  planning_run_id uuid REFERENCES public.planning_runs(id),
  exception_type text NOT NULL CHECK (exception_type IN (
    'BOM_MISSING','BOM_CYCLE_DETECTED','UNIT_CONVERSION_MISSING','LEAD_TIME_MISSING',
    'SUPPLIER_MISSING','NEGATIVE_INVENTORY','INVALID_FORECAST','INSUFFICIENT_HISTORY',
    'PAST_DUE_REQUIREMENT','PLANNING_DATA_INCONSISTENT')),
  severity text NOT NULL CHECK (severity IN ('INFO','WARNING','ERROR','BLOCKING')),
  message text NOT NULL,
  variant_id uuid REFERENCES public.product_variants(id),
  context jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','RESOLVED','IGNORED')),
  resolved_by uuid REFERENCES public.profiles(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planning_exceptions_run_idx ON public.planning_exceptions(planning_run_id, severity);

-- =====================================================================
-- 3. Permissões do módulo (fonte de verdade no banco).
-- =====================================================================
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['admin','gestor']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'planning.read','planning.run','planning.simulate','planning.adjust_forecast',
  'planning.approve_suggestion','planning.convert_purchase','planning.convert_production',
  'planning.export']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['producao']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'planning.read','planning.run','planning.simulate','planning.approve_suggestion',
  'planning.convert_production','planning.export']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['estoque']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'planning.read','planning.run','planning.approve_suggestion','planning.convert_purchase',
  'planning.export']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['comercial']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'planning.read','planning.simulate','planning.adjust_forecast']) p ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['financeiro','marketplace']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'planning.read','planning.export']) p ON CONFLICT DO NOTHING;

-- =====================================================================
-- 4. Helpers do módulo.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.planning_require(_org uuid,_permission text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(_org,_permission) THEN
    RAISE EXCEPTION 'Sem permissão: %.',_permission;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.planning_audit(_org uuid,_action text,_table text,_id uuid,_context jsonb DEFAULT '{}')
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context)
  VALUES(_org,auth.uid(),_action,_table,_id::text,_context);
$$;

CREATE OR REPLACE FUNCTION public.planning_event(_org uuid,_event text,_key text,_payload jsonb)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  INSERT INTO public.domain_events(organization_id,event_type,event_source,event_key,payload)
  VALUES(_org,_event,'PLANNING',coalesce(_key,_event),coalesce(_payload,'{}'::jsonb))
  ON CONFLICT DO NOTHING;
$$;

-- Cria as configurações padrão da organização, se necessário.
CREATE OR REPLACE FUNCTION public.planning_ensure_settings(_org uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.planning_settings(organization_id)
  VALUES(_org) ON CONFLICT (organization_id) DO NOTHING;
  INSERT INTO public.planning_scenarios(organization_id,name,scenario_type,demand_multiplier,is_base,description)
  VALUES(_org,'Cenário base', 'BASE', 1, true, 'Parâmetros vigentes (referência).')
  ON CONFLICT (organization_id,name) DO NOTHING;
END
$$;

-- Guard de imutabilidade: runs concluídos e registros ligados a runs
-- concluídos não podem ser alterados/excluídos.
CREATE OR REPLACE FUNCTION public.planning_run_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_final boolean; j jsonb:=to_jsonb(COALESCE(NEW,OLD));
BEGIN
  IF TG_OP='DELETE' THEN
    SELECT (status IN ('COMPLETED','COMPLETED_WITH_WARNINGS','ARCHIVED')) INTO v_final
      FROM public.planning_runs WHERE id=(j->>'planning_run_id')::uuid;
    IF v_final THEN RAISE EXCEPTION 'Planejamento concluído é um snapshot histórico imutável.'; END IF;
    RETURN OLD;
  END IF;
  IF TG_TABLE_NAME='planning_runs' THEN
    IF OLD.status IN ('COMPLETED','COMPLETED_WITH_WARNINGS','ARCHIVED') THEN
      RAISE EXCEPTION 'PlanningRun concluído/arquivado é imutável. Crie um novo run para recalcular.';
    END IF;
  ELSE
    SELECT (status IN ('COMPLETED','COMPLETED_WITH_WARNINGS','ARCHIVED')) INTO v_final
      FROM public.planning_runs WHERE id=(j->>'planning_run_id')::uuid;
    IF v_final THEN RAISE EXCEPTION 'Registro de planejamento concluído é imutável.'; END IF;
  END IF;
  RETURN NEW;
END
$$;

-- Validação de vínculos dentro da organização.
CREATE OR REPLACE FUNCTION public.planning_guard_relations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_data jsonb:=to_jsonb(NEW); v_pair text[]; v_id uuid; v_org uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
  FOREACH v_pair SLICE 1 IN ARRAY CASE TG_TABLE_NAME
    WHEN 'planning_availability' THEN ARRAY[ARRAY['location_id','inventory_locations']]
    WHEN 'forecast_adjustments' THEN ARRAY[ARRAY['variant_id','product_variants']]
    WHEN 'planning_runs' THEN ARRAY[ARRAY['scenario_id','planning_scenarios']]
    WHEN 'planned_orders' THEN ARRAY[ARRAY['planning_run_id','planning_runs'],ARRAY['scenario_id','planning_scenarios'],ARRAY['variant_id','product_variants'],ARRAY['unit_of_measure_id','units_of_measure'],ARRAY['suggested_supplier_id','supplier_profiles'],ARRAY['bom_id','bill_of_materials']]
    WHEN 'material_requirements' THEN ARRAY[ARRAY['planning_run_id','planning_runs'],ARRAY['variant_id','product_variants'],ARRAY['parent_planned_order_id','planned_orders'],ARRAY['unit_of_measure_id','units_of_measure']]
    WHEN 'projected_shortages' THEN ARRAY[ARRAY['planning_run_id','planning_runs'],ARRAY['variant_id','product_variants'],ARRAY['parent_planned_order_id','planned_orders']]
    WHEN 'planning_exceptions' THEN ARRAY[ARRAY['planning_run_id','planning_runs'],ARRAY['variant_id','product_variants']]
    ELSE ARRAY[ARRAY[]::text[]]
  END
  LOOP
    v_id:=(v_data->>v_pair[1])::uuid;
    IF v_id IS NULL THEN CONTINUE; END IF;
    EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',v_pair[2]) INTO v_org USING v_id;
    IF v_org IS NULL AND v_pair[2]='units_of_measure' THEN CONTINUE; END IF;
    IF v_org IS DISTINCT FROM NEW.organization_id THEN RAISE EXCEPTION 'Referência fora da organização.'; END IF;
  END LOOP;
  RETURN NEW;
END
$$;

CREATE TRIGGER planning_availability_relations BEFORE INSERT OR UPDATE ON public.planning_availability
  FOR EACH ROW EXECUTE FUNCTION public.planning_guard_relations();
CREATE TRIGGER planning_scenarios_guard_relations BEFORE INSERT OR UPDATE ON public.planning_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.planning_guard_relations();
CREATE TRIGGER forecast_adjustments_relations BEFORE INSERT OR UPDATE ON public.forecast_adjustments
  FOR EACH ROW EXECUTE FUNCTION public.planning_guard_relations();
CREATE TRIGGER planning_runs_guard BEFORE UPDATE OR DELETE ON public.planning_runs
  FOR EACH ROW EXECUTE FUNCTION public.planning_run_guard();
CREATE TRIGGER planning_runs_relations BEFORE INSERT OR UPDATE ON public.planning_runs
  FOR EACH ROW EXECUTE FUNCTION public.planning_guard_relations();
CREATE TRIGGER planned_orders_guard BEFORE UPDATE OR DELETE ON public.planned_orders
  FOR EACH ROW EXECUTE FUNCTION public.planning_run_guard();
CREATE TRIGGER planned_orders_relations BEFORE INSERT OR UPDATE ON public.planned_orders
  FOR EACH ROW EXECUTE FUNCTION public.planning_guard_relations();
CREATE TRIGGER material_requirements_guard BEFORE UPDATE OR DELETE ON public.material_requirements
  FOR EACH ROW EXECUTE FUNCTION public.planning_run_guard();
CREATE TRIGGER material_requirements_relations BEFORE INSERT OR UPDATE ON public.material_requirements
  FOR EACH ROW EXECUTE FUNCTION public.planning_guard_relations();
CREATE TRIGGER projected_shortages_guard BEFORE UPDATE OR DELETE ON public.projected_shortages
  FOR EACH ROW EXECUTE FUNCTION public.planning_run_guard();
CREATE TRIGGER projected_shortages_relations BEFORE INSERT OR UPDATE ON public.projected_shortages
  FOR EACH ROW EXECUTE FUNCTION public.planning_guard_relations();
CREATE TRIGGER planning_exceptions_guard BEFORE UPDATE OR DELETE ON public.planning_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.planning_run_guard();
CREATE TRIGGER planning_exceptions_relations BEFORE INSERT OR UPDATE ON public.planning_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.planning_guard_relations();

-- =====================================================================
-- 5. RPCs de configuração.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.planning_settings_save(_org uuid,_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.planning_require(_org,'planning.run');
  PERFORM public.planning_ensure_settings(_org);
  UPDATE public.planning_settings SET
    demand_sources=coalesce(_data->'demand_sources',demand_sources),
    demand_priority=coalesce(_data->'demand_priority',demand_priority),
    forecast_method=coalesce(_data->>'forecast_method',forecast_method),
    weighted_weights=coalesce(_data->'weighted_weights',weighted_weights),
    projection_days=coalesce((_data->>'projection_days')::int,projection_days),
    history_days=coalesce((_data->>'history_days')::int,history_days),
    min_history_days=coalesce((_data->>'min_history_days')::int,min_history_days),
    minimum_stock_demand=coalesce((_data->>'minimum_stock_demand')::boolean,minimum_stock_demand),
    time_bucket=coalesce(_data->>'time_bucket',time_bucket),
    lead_time_policy=coalesce(_data->>'lead_time_policy',lead_time_policy),
    lead_time_overrides=coalesce(_data->'lead_time_overrides',lead_time_overrides),
    purchase_lead_time_default=coalesce((_data->>'purchase_lead_time_default')::int,purchase_lead_time_default),
    production_lead_time_default=coalesce((_data->>'production_lead_time_default')::int,production_lead_time_default),
    updated_by=auth.uid(), updated_at=now()
    WHERE organization_id=_org;
  PERFORM public.planning_audit(_org,'planning.settings.update','planning_settings',_org,jsonb_build_object('data',_data));
  RETURN jsonb_build_object('updated',true);
END
$$;

-- Configura as localizações que participam do planejamento.
-- _data: {"items": [{"location_id":"","include_in_planning":true,"safety_stock":null}]}
CREATE OR REPLACE FUNCTION public.planning_availability_save(_org uuid,_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE it jsonb; v_loc uuid; v_inc boolean; v_safe numeric;
BEGIN
  PERFORM public.planning_require(_org,'planning.run');
  IF _data->'items' IS NULL OR jsonb_array_length(_data->'items')=0 THEN
    RAISE EXCEPTION 'Informe ao menos uma localização.';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(_data->'items') LOOP
    v_loc:=(it->>'location_id')::uuid;
    v_inc:=coalesce((it->>'include_in_planning')::boolean,true);
    v_safe:=(case when (it->>'safety_stock')::text in ('','null') then null else (it->>'safety_stock')::numeric end);
    IF NOT EXISTS (SELECT 1 FROM public.inventory_locations WHERE id=v_loc AND organization_id=_org) THEN
      RAISE EXCEPTION 'Localização inválida nesta organização.';
    END IF;
    INSERT INTO public.planning_availability(organization_id,location_id,include_in_planning,safety_stock)
    VALUES(_org,v_loc,v_inc,v_safe)
    ON CONFLICT(organization_id,location_id) DO UPDATE SET
      include_in_planning=EXCLUDED.include_in_planning,
      safety_stock=EXCLUDED.safety_stock, updated_at=now();
  END LOOP;
  PERFORM public.planning_audit(_org,'planning.availability.update','planning_availability',_org,jsonb_build_object('items',_data->'items'));
  RETURN jsonb_build_object('updated',true);
END
$$;

-- Cria/atualiza cenário. O BASE é único por organização.
CREATE OR REPLACE FUNCTION public.planning_scenario_save(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v text;
BEGIN
  PERFORM public.planning_require(_org,'planning.simulate');
  PERFORM public.planning_ensure_settings(_org);
  IF _id IS NULL THEN
    INSERT INTO public.planning_scenarios(
      organization_id,name,scenario_type,demand_multiplier,lead_time_adjustment_days,
      safety_stock_multiplier,horizon_days,is_base,description,created_by)
    VALUES(_org,trim(_data->>'name'),
      coalesce(_data->>'scenario_type','CUSTOM'),
      coalesce((_data->>'demand_multiplier')::numeric,1),
      coalesce((_data->>'lead_time_adjustment_days')::int,0),
      coalesce((_data->>'safety_stock_multiplier')::numeric,1),
      (case when (_data->>'horizon_days')::text in ('','null') then null else (_data->>'horizon_days')::int end),
      coalesce((_data->>'is_base')::boolean,false), _data->>'description', auth.uid())
    RETURNING id::text INTO v;
  ELSE
    UPDATE public.planning_scenarios SET
      name=coalesce(trim(_data->>'name'),name),
      scenario_type=coalesce(_data->>'scenario_type',scenario_type),
      demand_multiplier=coalesce((_data->>'demand_multiplier')::numeric,demand_multiplier),
      lead_time_adjustment_days=coalesce((_data->>'lead_time_adjustment_days')::int,lead_time_adjustment_days),
      safety_stock_multiplier=coalesce((_data->>'safety_stock_multiplier')::numeric,safety_stock_multiplier),
      horizon_days=coalesce((_data->>'horizon_days')::int,horizon_days),
      is_base=coalesce((_data->>'is_base')::boolean,is_base),
      description=coalesce(_data->>'description',description), updated_at=now()
      WHERE id=_id AND organization_id=_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'Cenário não encontrado.'; END IF;
    v:=_id::text;
  END IF;
  PERFORM public.planning_audit(_org,'planning.scenario.save','planning_scenarios',v::uuid,_data);
  RETURN jsonb_build_object('id',v);
END
$$;

CREATE OR REPLACE FUNCTION public.planning_scenario_delete(_org uuid,_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.planning_require(_org,'planning.simulate');
  DELETE FROM public.planning_scenarios WHERE id=_id AND organization_id=_org AND is_base=false
    AND NOT EXISTS (SELECT 1 FROM public.planning_runs r WHERE r.scenario_id=planning_scenarios.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Cenário não encontrado (ou é o BASE / está em uso).'; END IF;
  PERFORM public.planning_audit(_org,'planning.scenario.delete','planning_scenarios',_id,'{}'::jsonb);
  RETURN jsonb_build_object('deleted',true);
END
$$;

-- Ajuste manual de forecast (ForecastAdjustment).
CREATE OR REPLACE FUNCTION public.planning_forecast_adjust_save(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v text;
BEGIN
  PERFORM public.planning_require(_org,'planning.adjust_forecast');
  IF _data->>'variant_id' IS NULL OR (_data->>'quantity')::numeric IS NULL OR (_data->>'quantity')::numeric<=0 THEN
    RAISE EXCEPTION 'Informe variante e quantidade positiva.';
  END IF;
  IF _data->>'adjustment_date' IS NULL THEN RAISE EXCEPTION 'Informe o período do ajuste.'; END IF;
  IF nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo do ajuste.'; END IF;
  IF _id IS NULL THEN
    INSERT INTO public.forecast_adjustments(organization_id,variant_id,adjustment_date,quantity,reason,created_by)
    VALUES(_org,(_data->>'variant_id')::uuid,(_data->>'adjustment_date')::date,(_data->>'quantity')::numeric,trim(_data->>'reason'),auth.uid())
    RETURNING id::text INTO v;
  ELSE
    UPDATE public.forecast_adjustments SET
      adjustment_date=(_data->>'adjustment_date')::date,
      quantity=(_data->>'quantity')::numeric,
      reason=trim(_data->>'reason')
      WHERE id=_id AND organization_id=_org;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ajuste não encontrado.'; END IF;
    v:=_id::text;
  END IF;
  PERFORM public.planning_audit(_org,'planning.forecast.adjust','forecast_adjustments',v::uuid,_data);
  RETURN jsonb_build_object('id',v);
END
$$;

CREATE OR REPLACE FUNCTION public.planning_forecast_adjust_delete(_org uuid,_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.planning_require(_org,'planning.adjust_forecast');
  DELETE FROM public.forecast_adjustments WHERE id=_id AND organization_id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Ajuste não encontrado.'; END IF;
  PERFORM public.planning_audit(_org,'planning.forecast.adjust.delete','forecast_adjustments',_id,'{}'::jsonb);
  RETURN jsonb_build_object('deleted',true);
END
$$;

-- Resolve/ignora/reabre exceções de planejamento.
CREATE OR REPLACE FUNCTION public.planning_exception_action(_org uuid,_id uuid,_action text,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_goal text; new_status text;
BEGIN
  PERFORM public.planning_require(_org,'planning.approve_suggestion');
  v_goal:=CASE _action WHEN 'resolve' THEN 'RESOLVED' WHEN 'ignore' THEN 'IGNORED'
    WHEN 'reopen' THEN 'OPEN' ELSE NULL END;
  IF v_goal IS NULL THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
  IF _action='reopen' THEN
    UPDATE public.planning_exceptions SET status='OPEN' WHERE id=_id AND organization_id=_org AND status<>'OPEN';
  ELSE
    UPDATE public.planning_exceptions SET status=v_goal,resolved_by=auth.uid(),resolved_at=now()
      WHERE id=_id AND organization_id=_org AND status='OPEN';
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exceção não encontrada ou já tratada.'; END IF;
  PERFORM public.planning_audit(_org,'planning.exception.'||_action,'planning_exceptions',_id,_data);
  RETURN jsonb_build_object('id',_id,'status',v_goal);
END
$$;--

-- =====================================================================
-- 6. Núcleo do MRP.
--
-- O motor é executado 100% server-side (plpgsql). O browser apenas lê
-- resultados. Buckets DAILY/WEEKLY com PAB (Projected Available Balance)
-- por data: um recebimento só cobre falta em buckets posteriores à sua
-- chegada (regra: "compra daqui a 60 dias não resolve falta para amanhã").
-- =====================================================================

-- Lead time de compra efetivo de uma variante conforme a política.
CREATE OR REPLACE FUNCTION public.pln_purchase_lead(_org uuid,_variant uuid,_v_settings public.planning_settings,_v_scn public.planning_scenarios)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_lt integer; v_obs integer; v_pol text:=_v_settings.lead_time_policy; v_man text;
BEGIN
  v_lt:=(SELECT min(sp.lead_time_days) FROM public.supplier_products sp
    WHERE sp.variant_id=_variant AND sp.organization_id=_org AND sp.status='ACTIVE' AND sp.lead_time_days IS NOT NULL);
  IF v_pol='USE_OBSERVED' THEN
    v_obs:=(SELECT round(avg(coalesce(poe.expected_delivery_date,po.expected_delivery_date)-po.issue_date))::int
      FROM public.purchase_orders po JOIN public.purchase_order_items poe ON poe.purchase_order_id=po.id
      WHERE poe.variant_id=_variant AND po.organization_id=_org AND po.status IN ('COMPLETED','RECEIVING')
        AND (po.expected_delivery_date IS NOT NULL OR poe.expected_delivery_date IS NOT NULL));
    IF v_obs IS NOT NULL AND v_obs>=0 THEN v_lt:=v_obs; END IF;
  ELSIF v_pol='USE_MANUAL' THEN
    v_man:=(_v_settings.lead_time_overrides->>_variant::text);
    IF v_man IS NOT NULL AND v_man~'^[0-9]+$' THEN v_lt:=v_man::int; END IF;
  ELSIF v_pol='USE_CONFIGURED' THEN
    NULL; -- v_lt do catálogo
  END IF;
  RETURN greatest(1,coalesce(v_lt,_v_settings.purchase_lead_time_default)+coalesce(_v_scn.lead_time_adjustment_days,0));
END
$$;

-- Supplier sugerido (preferido) para variante de compra; usuário decide na conversão.
CREATE OR REPLACE FUNCTION public.pln_supplier(_org uuid,_variant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row jsonb;
BEGIN
  SELECT jsonb_build_object('supplier_id',sp.id,'moq',sp.minimum_order_quantity,'order_multiple',sp.order_multiple,
      'lead_time_days',sp.lead_time_days,'conversion_factor',sp.conversion_factor,
      'purchase_unit_id',sp.purchase_unit_id,'inventory_unit_id',sp.inventory_unit_id,
      'unit_conversion_ok',(sp.conversion_factor IS NOT NULL OR sp.purchase_unit_id IS NULL OR sp.inventory_unit_id IS NULL OR sp.purchase_unit_id=sp.inventory_unit_id))
    INTO v_row
  FROM public.supplier_products sp JOIN public.supplier_profiles p ON p.id=sp.supplier_id
  WHERE sp.variant_id=_variant AND sp.organization_id=_org AND sp.status='ACTIVE' AND p.status='ACTIVE'
  ORDER BY p.preferred DESC NULLS LAST, sp.last_price ASC NULLS LAST, sp.minimum_order_quantity ASC NULLS LAST
  LIMIT 1;
  RETURN v_row;
END
$$;

-- Núcleo de resolução de UMA variante: ingere a demanda já agregada em
-- _pln_demand, calcula o PAB por bucket e gera sugestões (produção ou
-- compra), além das necessidades de material (explosão para _pln_child).
CREATE OR REPLACE FUNCTION public.pln_solve(
  _org uuid,_run uuid,_variant uuid,
  _v_settings public.planning_settings,_v_scn public.planning_scenarios,
  _source text DEFAULT 'TOP', _depth integer DEFAULT 0, _stack text[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r record; it record; k text; b date; v_pair text[];
  v_plan_date date; v_bucket text; v_pol text; v_loc text;
  v_safety numeric; v_safety_base numeric; v_avail numeric; v_dem numeric;
  v_sched numeric; v_pln numeric; v_proj numeric; v_net numeric; v_lead integer;
  v_oqty numeric; v_moq numeric; v_om numeric; v_qty numeric; v_start date; v_odate date;
  v_item_type text; v_status text; v_min numeric; v_reorder numeric; v_target numeric;
  v_sup jsonb; v_why jsonb; v_oqid uuid; v_has_dmd boolean; v_calc numeric;
  v_is_short integer;
  v_bom record; v_children text; v_sk text; v_poc integer; v_unit uuid; v_sup_null boolean;
  v_lead2 integer; v_arr date; v_prod_lead integer; v_po_lead integer;
  v_demand_qty numeric; v_src_bom boolean;
BEGIN
  v_plan_date:=(SELECT planning_date FROM public.planning_runs WHERE id=_run);
  v_bucket:=(SELECT time_bucket FROM public.planning_runs WHERE id=_run);
  SELECT item_type,status,minimum_stock,reorder_point,target_stock,product_id
    INTO v_item_type,v_status,v_min,v_reorder,v_target,v_calc FROM public.product_variants WHERE id=_variant AND organization_id=_org;
  IF NOT FOUND THEN RETURN; END IF;

  -- Ciclo de BOM? (regra 41)
  IF _stack @> ARRAY[_variant::text] THEN
    INSERT INTO public.planning_exceptions(organization_id,planning_run_id,exception_type,severity,message,variant_id,context)
    VALUES(_org,_run,'BOM_CYCLE_DETECTED','BLOCKING','Ciclo na estrutura do produto: '||_variant::text||' reaparece na árvore BOM.',_variant,jsonb_build_object('stack',_stack));
    RETURN;
  END IF;

  -- Variante descontinuada: não sugere, apenas alerta se houver demanda.
  IF v_status='DISCONTINUED' THEN
    IF EXISTS (SELECT 1 FROM _pln_demand WHERE variant=_variant AND qty>0) OR EXISTS (SELECT 1 FROM forecast_adjustments WHERE variant_id=_variant AND organization_id=_org) THEN
      INSERT INTO public.planning_exceptions(organization_id,planning_run_id,exception_type,severity,message,variant_id,context)
      VALUES(_org,_run,'BOM_MISSING','INFO','Produto descontinuado ainda com demanda planejada. Revisar.',_variant,'{}'::jsonb);
    END IF;
    RETURN;
  END IF;

  -- Safety stock efetivo (por localização quando configurado; senão da variante).
  SELECT
    CASE WHEN EXISTS(SELECT 1 FROM public.planning_availability pa
                       WHERE pa.organization_id=_org AND pa.safety_stock IS NOT NULL)
      THEN (SELECT coalesce(sum(coalesce(pa.safety_stock,0)),0) FROM public.planning_availability pa
              WHERE pa.organization_id=_org AND pa.safety_stock IS NOT NULL)
      ELSE coalesce(v_safety,0) END * coalesce(_v_scn.safety_stock_multiplier,1)
    INTO v_safety
  FROM (SELECT _variant v) z;
  v_safety:=coalesce(v_safety,0);

  -- BOM vigente na data do planejamento (se houver).
  SELECT * INTO v_bom FROM (
    SELECT b.* FROM public.bill_of_materials b
    WHERE b.organization_id=_org AND b.status='ACTIVE' AND b.product_variant_id=_variant
      AND (b.effective_from IS NULL OR b.effective_from<=v_plan_date)
      AND (b.effective_to IS NULL OR b.effective_to>=v_plan_date)
    ORDER BY b.effective_from DESC NULLS LAST LIMIT 1) x;

  -- Estoque disponível (apenas locações participantes do planejamento).
  v_loc:='SELECT array_agg(l.id) FROM (
     SELECT l.id FROM public.inventory_locations l
       LEFT JOIN public.planning_availability pa ON pa.location_id=l.id AND pa.organization_id=_org
       WHERE l.organization_id=_org AND l.status=''ACTIVE''
         AND (CASE WHEN EXISTS(SELECT 1 FROM public.planning_availability WHERE organization_id=_org)
               THEN coalesce(pa.include_in_planning,false)
               ELSE l.type IN (''FACTORY'',''WAREHOUSE'',''OWN_STORE'') END)) l';
  v_loc:='a';
  v_avail:=coalesce((SELECT sum(on_hand) FROM public.inventory_balances WHERE organization_id=_org AND variant_id=_variant AND batch_id IS NULL AND location_id IN (SELECT l.id FROM public.inventory_locations l LEFT JOIN public.planning_availability pa ON pa.location_id=l.id AND pa.organization_id=_org WHERE l.organization_id=_org AND l.status='ACTIVE' AND (CASE WHEN EXISTS(SELECT 1 FROM public.planning_availability WHERE organization_id=_org) THEN coalesce(pa.include_in_planning,false) ELSE l.type IN ('FACTORY','WAREHOUSE','OWN_STORE') END))),0);

  -- Demanda total por variante
  v_has_dmd:=EXISTS (SELECT 1 FROM _pln_demand WHERE variant=_variant AND qty<>0);

  FOR b,v_dem IN SELECT bucket,sum(qty) FROM _pln_demand WHERE variant=_variant GROUP BY bucket ORDER BY bucket LOOP
    v_dem:=coalesce(v_dem,0);
    v_sched:=coalesce((SELECT sum(qty) FROM _pln_sched WHERE variant=_variant AND arr<=b),0);
    v_pln:=coalesce((SELECT sum(quantity) FROM public.planned_orders WHERE planning_run_id=_run AND variant_id=_variant AND status<>'DISMISSED' AND required_date<=b),0);
    v_proj:=v_avail + v_sched + v_pln - v_dem - v_safety;
    v_net:=0; v_oqid:=NULL; v_is_short:=0;
    IF v_proj<0 THEN
      v_net:=-v_proj;
      -- Material/produto produzível com BOM: sugere PRODUÇÃO.
      IF v_bom.id IS NOT NULL AND v_item_type IN ('FINISHED_GOOD','SEMI_FINISHED_GOOD') THEN
        v_prod_lead:=coalesce(v_bom.production_lead_time_days,_v_settings.production_lead_time_default);
        IF v_bom.production_lead_time_days IS NULL AND _v_settings.production_lead_time_default IS NULL THEN
          v_prod_lead:=3;
          INSERT INTO public.planning_exceptions(organization_id,planning_run_id,exception_type,severity,message,variant_id)
          VALUES(_org,_run,'LEAD_TIME_MISSING','WARNING','Lead time de produção não configurado; usado padrão.',_variant);
        END IF;
        v_start:=b - v_prod_lead;
        IF v_start < v_plan_date THEN
          INSERT INTO public.planning_exceptions(organization_id,planning_run_id,exception_type,severity,message,variant_id,context)
          VALUES(_org,_run,'PAST_DUE_REQUIREMENT','WARNING','Produção deve começar antes da data atual.',_variant,jsonb_build_object('suggested_start',v_start,'required',b));
          INSERT INTO public.projected_shortages(organization_id,planning_run_id,variant_id,shortage_date,shortage_quantity,severity,source,detail)
          VALUES(_org,_run,_variant,b,v_net,'CRITICAL','DEMAND',jsonb_build_object('past_due',true));
        END IF;
        v_why:=jsonb_build_object('metodo','PAB','demanda_ate',v_dem,'estoque_disponivel',v_avail,'recebimentos_programados',v_sched,'planejado',v_pln,'seguranca',v_safety,'qtd_liquida',v_net,'inicio_sugerido',v_start,'lead_producao',v_prod_lead);
        INSERT INTO public.planned_orders(
          organization_id,planning_run_id,scenario_id,simulated,order_type,status,variant_id,unit_of_measure_id,
          quantity,required_date,suggested_start_date,priority,reason,why,bom_id)
        VALUES(_org,_run,_v_scn.id,_v_scn.id IS NOT NULL AND NOT _v_scn.is_base,'PRODUCTION','SUGGESTED',_variant,NULL,
          v_net,b,v_start,'HIGH','Necessidade líquida de produção no período.','Planejamento sugere produzir; não executa.',v_why,v_bom.id)
        RETURNING id INTO v_oqid;
        -- explosão da BOM para necessidades de material (data = início)
        FOR it IN SELECT i.component_variant_id,i.unit_of_measure_id,(i.quantity*(1+i.scrap_percentage/100.0)) coef
                  FROM public.bill_of_materials_items i WHERE i.bom_id=v_bom.id LOOP
          v_calc:=v_net*it.coef;
          INSERT INTO _pln_child(variant,bucket,qty,unit) VALUES(it.component_variant_id,v_start,v_calc,it.unit_of_measure_id)
          ON CONFLICT (variant,bucket) DO UPDATE SET qty=_pln_child.qty+EXCLUDED.qty;
        END LOOP;
      ELSE
        -- Compra (produto acabado sem BOM, matéria-prima, componente, embalagem).
        v_sup:=public.pln_supplier(_org,_variant);
        IF v_sup IS NULL THEN
          v_is_short:=1;
          INSERT INTO public.planning_exceptions(organization_id,planning_run_id,exception_type,severity,message,variant_id,context)
          VALUES(_org,_run,'SUPPLIER_MISSING','WARNING','Sem fornecedor cadastrado para o material; compra não sugerida.',_variant,jsonb_build_object('net',v_net,'required',b));
        ELSE
          IF (v_sup->>'unit_conversion_ok')::boolean=false THEN
            INSERT INTO public.planning_exceptions(organization_id,planning_run_id,exception_type,severity,message,variant_id,context)
            VALUES(_org,_run,'UNIT_CONVERSION_MISSING','WARNING','Conversão de unidade do fornecedor ausente para o material.',_variant,jsonb_build_object('net',v_net));
          END IF;
          v_lead:=public.pln_purchase_lead(_org,_variant,_v_settings,_v_scn);
          IF v_lead IS NULL THEN
            INSERT INTO public.planning_exceptions(organization_id,planning_run_id,exception_type,severity,message,variant_id)
            VALUES(_org,_run,'LEAD_TIME_MISSING','WARNING','Lead time de compra não configurado; usado padrão.',_variant);
            v_lead:=_v_settings.purchase_lead_time_default;
          END IF;
          v_qty:=v_net;
          v_moq:=(v_sup->>'moq')::numeric; v_om:=(v_sup->>'order_multiple')::numeric; v_sup_null:=false;
          IF v_moq IS NOT NULL AND v_moq IS DISTINCT FROM 0 AND v_qty<v_moq THEN
            v_qty:=v_moq; v_oqid:=NULL;
            v_odate:=b - v_lead;
          ELSIF v_om IS NOT NULL AND v_om>1 THEN
            v_qty:=ceil(v_qty/v_om)*v_om;
            v_oqid:=NULL; v_odate:=b - v_lead;
          ELSE
            v_odate:=b - v_lead;
          END IF;
          IF v_odate < v_plan_date THEN
            INSERT INTO public.planning_exceptions(organization_id,planning_run_id,exception_type,severity,message,variant_id,context)
            VALUES(_org,_run,'PAST_DUE_REQUIREMENT','WARNING','Pedido deveria ser disparado antes da data atual.',_variant,jsonb_build_object('suggested_order_date',v_odate,'required',b));
            INSERT INTO public.projected_shortages(organization_id,planning_run_id,variant_id,shortage_date,shortage_quantity,severity,source,detail)
            VALUES(_org,_run,_variant,b,v_qty,'CRITICAL','DEMAND',jsonb_build_object('past_due',true));
          END IF;
          v_why:=jsonb_build_object('metodo','PAB','demanda_ate',v_dem,'estoque_disponivel',v_avail,'recebimentos_programados',v_sched,'planejado',v_pln,'seguranca',v_safety,'qtd_liquida',v_net,'moq',v_moq,'order_multiple',v_om,'qtd_sugerida',v_qty,'data_pedido',v_odate,'lead',v_lead);
          INSERT INTO public.planned_orders(
            organization_id,planning_run_id,scenario_id,simulated,order_type,status,variant_id,unit_of_measure_id,
            quantity,required_date,suggested_order_date,suggested_supplier_id,priority,reason,why,
            moq_applied,moq_value,order_multiple)
          VALUES(_org,_run,_v_scn.id,_v_scn.id IS NOT NULL AND NOT _v_scn.is_base,'PURCHASE','SUGGESTED',_variant,(v_sup->>'inventory_unit_id')::uuid,
            v_qty,b,v_odate,(v_sup->>'supplier_id')::uuid,'NORMAL','Necessidade líquida de compra no período (MRP).','Compra sugerida; usuário converte para requisição.',v_why,
            v_moq IS NOT NULL AND v_qty>v_net,v_moq,v_om)
          RETURNING id INTO v_oqid;
        END IF;
      END IF;
      v_is_short:=CASE WHEN v_oqid IS NULL THEN 1 ELSE 0 END;
    END IF;

    -- Registra a necessidade (visão por produto/material) e a ruptura não coberta.
    v_sched:=coalesce((SELECT sum(qty) FROM _pln_sched WHERE variant=_variant AND arr<=b),0);
    INSERT INTO public.material_requirements(
      organization_id,planning_run_id,variant_id,source_kind,parent_planned_order_id,
      required_quantity,available_quantity,scheduled_receipt_quantity,net_requirement,planning_quantity,
      required_date,suggested_order_date,unit_of_measure_id,block_reason)
    VALUES(_org,_run,_variant,_source,v_bom.id IS NOT NULL AND _oqid IS NOT NULL AND v_item_type IN ('FINISHED_GOOD','SEMI_FINISHED_GOOD') THEN NULL ELSE v_oqid END,
      v_dem,v_avail,v_sched,greatest(0,v_net),greatest(0,v_net),b, v_odate, v_unit, CASE WHEN v_is_short=1 THEN 'Sem sugestão viável' ELSE NULL END)
    ON CONFLICT (organization_id,planning_run_id,variant_id,source_kind,required_date) DO UPDATE SET
      required_quantity=EXCLUDED.required_quantity,
      available_quantity=EXCLUDED.available_quantity,
      scheduled_receipt_quantity=EXCLUDED.scheduled_receipt_quantity,
      net_requirement=EXCLUDED.net_requirement,
      planning_quantity=EXCLUDED.planning_quantity,
      suggested_order_date=EXCLUDED.suggested_order_date,
      block_reason=EXCLUDED.block_reason;
    IF v_is_short=1 THEN
      INSERT INTO public.projected_shortages(organization_id,planning_run_id,variant_id,shortage_date,shortage_quantity,severity,source,detail)
      VALUES(_org,_run,_variant,b,v_net,'CRITICAL',CASE WHEN EXISTS(SELECT 1 FROM _pln_child WHERE variant=_variant) THEN 'PRODUCTION_BLOCKING' ELSE 'DEMAND' END,jsonb_build_object('net',v_net,'blocked',true))
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;

  -- Histórico insuficiente: sinaliza para variantes de demanda sem histórico.
  IF v_has_dmd AND NOT EXISTS (SELECT 1 FROM _pln_sched WHERE variant=_variant) AND v_avail<v_dem THEN
    IF NOT EXISTS (SELECT 1 FROM forecast_adjustments WHERE variant_id=_variant AND organization_id=_org) THEN
      INSERT INTO public.planning_exceptions(organization_id,planning_run_id,exception_type,severity,message,variant_id)
      VALUES(_org,_run,'INSUFFICIENT_HISTORY','INFO','Histórico insuficiente para forecast estatístico; use ajuste manual.',_variant);
    END IF;
  END IF;
END
$$;
