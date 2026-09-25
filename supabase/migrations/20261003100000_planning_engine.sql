-- MASTER 011: complete the existing planning schema, preserving operational writers.
BEGIN;
ALTER TABLE public.planning_settings ALTER COLUMN purchase_lead_time_default DROP NOT NULL, ALTER COLUMN purchase_lead_time_default DROP DEFAULT,
 ALTER COLUMN production_lead_time_default DROP NOT NULL, ALTER COLUMN production_lead_time_default DROP DEFAULT;
ALTER TABLE public.product_variants ADD CONSTRAINT planning_safety_nonnegative CHECK(safety_stock>=0);
ALTER TABLE public.planning_scenarios ADD COLUMN target_stock_multiplier numeric(8,4) NOT NULL DEFAULT 1 CHECK(target_stock_multiplier BETWEEN 0 AND 100);
ALTER TABLE public.planning_runs ADD COLUMN request_key text, ADD COLUMN request_payload jsonb NOT NULL DEFAULT '{}', ADD COLUMN summary jsonb NOT NULL DEFAULT '{}', ADD UNIQUE(organization_id,request_key);
ALTER TABLE public.planned_orders ADD CONSTRAINT planned_conversion_limit CHECK(converted_qty<=quantity);
ALTER TABLE public.material_requirements ADD COLUMN calculation jsonb NOT NULL DEFAULT '{}';
CREATE TABLE public.planning_projections(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 planning_run_id uuid NOT NULL REFERENCES public.planning_runs,variant_id uuid NOT NULL REFERENCES public.product_variants,
 bucket_date date NOT NULL,opening_quantity numeric(20,6) NOT NULL,base_forecast numeric(20,6) NOT NULL,
 manual_adjustment numeric(20,6) NOT NULL,dependent_demand numeric(20,6) NOT NULL,demand numeric(20,6) NOT NULL,
 scheduled_receipts numeric(20,6) NOT NULL,planned_receipts numeric(20,6) NOT NULL,
 projected_without_plans numeric(20,6) NOT NULL,projected_quantity numeric(20,6) NOT NULL,safety_stock numeric(20,6) NOT NULL,
 target_stock numeric(20,6),excess_quantity numeric(20,6),UNIQUE(planning_run_id,variant_id,bucket_date));
CREATE TABLE public.planning_item_snapshots(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,planning_run_id uuid NOT NULL REFERENCES public.planning_runs,
 variant_id uuid NOT NULL REFERENCES public.product_variants,sku text NOT NULL,product_name text NOT NULL,item_type text NOT NULL,
 unit_of_measure_id uuid REFERENCES public.units_of_measure,opening_quantity numeric(20,6) NOT NULL,partner_quantity numeric(20,6) NOT NULL,transit_quantity numeric(20,6) NOT NULL,
 daily_demand numeric(20,6),days_of_cover numeric(20,6),last_sale_date date,last_movement_at timestamptz,parameters jsonb NOT NULL,
 UNIQUE(planning_run_id,variant_id));
CREATE TABLE public.planning_source_facts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,planning_run_id uuid NOT NULL REFERENCES public.planning_runs,
 variant_id uuid NOT NULL REFERENCES public.product_variants,source_type text NOT NULL,source_id text NOT NULL,required_date date NOT NULL,
 quantity numeric(20,6) NOT NULL,context jsonb NOT NULL DEFAULT '{}');
CREATE TABLE public.planning_conversions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,planning_run_id uuid NOT NULL REFERENCES public.planning_runs,
 planned_order_id uuid NOT NULL REFERENCES public.planned_orders,quantity numeric(14,3) NOT NULL CHECK(quantity>0),source_type text NOT NULL CHECK(source_type IN ('PURCHASE_REQUEST','PRODUCTION_ORDER')),
 source_id uuid NOT NULL,idempotency_key text NOT NULL,request_payload jsonb NOT NULL,created_by uuid NOT NULL REFERENCES public.profiles,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(organization_id,idempotency_key));
CREATE INDEX planning_facts_run ON public.planning_source_facts(planning_run_id,variant_id,required_date);
CREATE INDEX planning_series_run ON public.planning_projections(planning_run_id,bucket_date,variant_id);

CREATE OR REPLACE FUNCTION public.planning_guard_relations() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_data jsonb:=to_jsonb(NEW); v_pair text[]; v_id uuid; v_org uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.organization_id<>OLD.organization_id THEN RAISE EXCEPTION 'Organização imutável.'; END IF;
  IF TG_TABLE_NAME='planning_scenarios' THEN RETURN NEW;END IF;
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


CREATE OR REPLACE FUNCTION public.planning_run_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END; final boolean;BEGIN
 IF TG_TABLE_NAME='planning_runs' THEN
  IF OLD.status IN ('COMPLETED','COMPLETED_WITH_WARNINGS','ARCHIVED') THEN RAISE EXCEPTION 'PlanningRun concluído é snapshot imutável.';END IF;
 ELSE
  SELECT status IN ('COMPLETED','COMPLETED_WITH_WARNINGS','ARCHIVED','FAILED') INTO final FROM public.planning_runs WHERE id=(j->>'planning_run_id')::uuid;
  IF final THEN
   IF TG_OP='UPDATE' AND TG_TABLE_NAME='planned_orders' AND
     (to_jsonb(NEW)-ARRAY['status','converted_qty','converted_source','converted_ids'])=(to_jsonb(OLD)-ARRAY['status','converted_qty','converted_source','converted_ids']) THEN RETURN NEW;END IF;
   IF TG_OP='UPDATE' AND TG_TABLE_NAME='planning_exceptions' AND
     (to_jsonb(NEW)-ARRAY['status','resolved_by','resolved_at'])=(to_jsonb(OLD)-ARRAY['status','resolved_by','resolved_at']) THEN RETURN NEW;END IF;
   RAISE EXCEPTION 'Resultado de planejamento imutável.';
  END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE FUNCTION public.planning_record_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb:=to_jsonb(NEW);p text[];o uuid;n bigint;BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Histórico de planejamento imutável.';END IF;
 IF TG_OP='UPDATE' AND TG_TABLE_NAME IN ('planning_conversions','planning_item_snapshots','planning_source_facts','planning_projections') THEN RAISE EXCEPTION 'Snapshot imutável.';END IF;
 FOREACH p SLICE 1 IN ARRAY ARRAY[['planning_run_id','planning_runs'],['planned_order_id','planned_orders'],['variant_id','product_variants'],['unit_of_measure_id','units_of_measure']] LOOP
  IF j->>p[1] IS NULL THEN CONTINUE;END IF;
  EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',p[2]) INTO o USING (j->>p[1])::uuid;GET DIAGNOSTICS n=ROW_COUNT;
  IF n=0 OR (o IS DISTINCT FROM NEW.organization_id AND NOT(p[2]='units_of_measure' AND o IS NULL)) THEN RAISE EXCEPTION 'Referência fora da organização.';END IF;
 END LOOP;
 IF TG_TABLE_NAME<>'planning_conversions' AND EXISTS(SELECT 1 FROM public.planning_runs WHERE id=(j->>'planning_run_id')::uuid AND status<>'PROCESSING') THEN RAISE EXCEPTION 'Run não está em processamento.';END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['planning_projections','planning_item_snapshots','planning_source_facts','planning_conversions'] LOOP
  EXECUTE format('CREATE TRIGGER planning_record_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.planning_record_guard()',t);
 END LOOP;
 FOREACH t IN ARRAY ARRAY['planning_settings','planning_scenarios','planning_availability','forecast_adjustments','planning_runs','planned_orders','material_requirements','projected_shortages','planning_exceptions','planning_projections','planning_item_snapshots','planning_source_facts','planning_conversions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY planning_tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,''planning.read''))',t);
 END LOOP;
END $$;
CREATE FUNCTION public.planning_note(_org uuid,_run uuid,_type text,_severity text,_variant uuid,_message text,_context jsonb DEFAULT '{}') RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO public.planning_exceptions(organization_id,planning_run_id,exception_type,severity,variant_id,message,context) SELECT _org,_run,_type,_severity,_variant,_message,_context WHERE NOT EXISTS(SELECT 1 FROM public.planning_exceptions WHERE planning_run_id=_run AND exception_type=_type AND variant_id IS NOT DISTINCT FROM _variant AND message=_message AND context=_context)
$$;
CREATE FUNCTION public.planning_save(_org uuid,_kind text,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;v uuid;BEGIN
 PERFORM public.planning_require(_org,CASE WHEN _kind='scenario' THEN 'planning.simulate' WHEN _kind='forecast' THEN 'planning.adjust_forecast' ELSE 'planning.run' END);PERFORM public.inventory_lock(_org);
 IF _kind='settings' THEN
  IF _data ? 'demand_sources' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(_data->'demand_sources')x WHERE x NOT IN ('HISTORICAL_SALES','MANUAL_FORECAST','MINIMUM_STOCK','PRODUCTION_REQUIREMENT')) THEN RAISE EXCEPTION 'Fonte de demanda não implementada.';END IF;
  IF _data ? 'weighted_weights' AND (jsonb_typeof(_data->'weighted_weights')<>'array' OR jsonb_array_length(_data->'weighted_weights') NOT BETWEEN 1 AND 12 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(_data->'weighted_weights')x WHERE x::numeric<=0)) THEN RAISE EXCEPTION 'Pesos devem ser positivos, entre 1 e 12 faixas.';END IF;
  result:=public.planning_settings_save(_org,_data);
 ELSIF _kind='availability' THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(_data->'items')i JOIN public.inventory_locations l ON l.id=(i->>'location_id')::uuid WHERE (i->>'include_in_planning')::boolean AND (l.type IN ('PARTNER','TRANSIT') OR l.operational_purpose<>'NORMAL')) THEN RAISE EXCEPTION 'Parceiro, trânsito e quarentena não são estoque fabril disponível.';END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(_data->'items')i WHERE i->>'safety_stock' IS NOT NULL) THEN RAISE EXCEPTION 'Configure segurança por variante, não um total indistinto por localização.';END IF;
  result:=public.planning_availability_save(_org,_data);
 ELSIF _kind='scenario' THEN
  IF coalesce((_data->>'is_base')::boolean,false) OR _data->>'scenario_type'='BASE' THEN RAISE EXCEPTION 'Cenário base usa os parâmetros oficiais.';END IF;
  result:=public.planning_scenario_save(_org,_data);
  IF _data ? 'target_stock_multiplier' THEN UPDATE public.planning_scenarios SET target_stock_multiplier=(_data->>'target_stock_multiplier')::numeric WHERE id=(result->>'id')::uuid AND organization_id=_org;END IF;
 ELSIF _kind='forecast' THEN result:=public.planning_forecast_adjust_save(_org,_data);
 ELSIF _kind='variant' THEN
  v:=(_data->>'variant_id')::uuid;
  UPDATE public.product_variants SET safety_stock=(_data->>'safety_stock')::numeric WHERE id=v AND organization_id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Variante inválida.';END IF;
  IF _data ? 'production_lead_time_days' THEN UPDATE public.bill_of_materials SET production_lead_time_days=(_data->>'production_lead_time_days')::integer WHERE organization_id=_org AND product_variant_id=v AND status='ACTIVE';END IF;
  IF _data ? 'purchase_lead_time_days' THEN
   IF (_data->>'purchase_lead_time_days')::integer<0 THEN RAISE EXCEPTION 'Prazo inválido.';END IF;
   PERFORM public.planning_ensure_settings(_org);UPDATE public.planning_settings SET lead_time_overrides=lead_time_overrides||jsonb_build_object(v::text,(_data->>'purchase_lead_time_days')::integer) WHERE organization_id=_org;
  END IF;
  result:=jsonb_build_object('id',v);
 ELSIF _kind='supplier_product' THEN
  UPDATE public.supplier_products SET order_multiple=(_data->>'order_multiple')::numeric WHERE id=(_data->>'id')::uuid AND organization_id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Catálogo de fornecedor inválido.';END IF;result:=jsonb_build_object('id',_data->>'id');
 ELSE RAISE EXCEPTION 'Configuração inválida.';END IF;
 PERFORM public.planning_audit(_org,'planning.parameter.'||_kind,'planning_settings',_org,_data);RETURN result;
END $$;

-- Only a uniquely preferred supplier can be suggested. No cheapest/fastest ranking.
CREATE FUNCTION public.planning_supplier(_org uuid,_variant uuid,_unit uuid,_settings public.planning_settings) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.supplier_products;factor numeric;lead integer;BEGIN
 IF (SELECT count(*) FROM public.supplier_products sp JOIN public.supplier_profiles p ON p.id=sp.supplier_id WHERE sp.organization_id=_org AND sp.variant_id=_variant AND sp.status='ACTIVE' AND p.status='ACTIVE' AND p.preferred)<>1 THEN RETURN NULL;END IF;
 SELECT sp.* INTO s FROM public.supplier_products sp JOIN public.supplier_profiles p ON p.id=sp.supplier_id WHERE sp.organization_id=_org AND sp.variant_id=_variant AND sp.status='ACTIVE' AND p.status='ACTIVE' AND p.preferred;
 factor:=CASE WHEN s.purchase_unit_id=_unit THEN 1 WHEN s.inventory_unit_id=_unit THEN s.conversion_factor END;
 IF _settings.lead_time_policy='USE_CONFIGURED' THEN lead:=coalesce(s.lead_time_days,(SELECT lead_time_days FROM public.supplier_profiles WHERE id=s.supplier_id),_settings.purchase_lead_time_default);
 ELSIF _settings.lead_time_policy='USE_MANUAL' THEN lead:=(_settings.lead_time_overrides->>_variant::text)::integer;
 ELSE SELECT ceil(avg(g.received_at-po.issue_date))::integer INTO lead FROM public.goods_receipts g JOIN public.purchase_orders po ON po.id=g.purchase_order_id JOIN public.goods_receipt_items i ON i.goods_receipt_id=g.id WHERE g.organization_id=_org AND g.supplier_id=s.supplier_id AND g.status='POSTED' AND i.variant_id=_variant AND i.accepted_quantity>0 AND g.received_at>=po.issue_date;END IF;
 RETURN jsonb_build_object('supplier_id',s.supplier_id,'supplier_product_id',s.id,'lead_time_days',lead,'lead_time_source',_settings.lead_time_policy,'conversion_factor',factor,'moq',s.minimum_order_quantity*factor,'order_multiple',s.order_multiple*factor,'purchase_unit_id',s.purchase_unit_id);
END $$;
CREATE FUNCTION public.planning_execute(_org uuid,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE run public.planning_runs;cfg public.planning_settings;sc public.planning_scenarios;r record;it record;d date;startd date;endd date;
 key text:=_data->>'idempotency_key';sid uuid:=nullif(_data->>'scenario_id','')::uuid;sim boolean:=coalesce((_data->>'simulated')::boolean,false);
 base numeric;manual numeric;dependent numeric;demand numeric;receipt numeric;bal numeric;rawbal numeric;opening numeric;net numeric;suggested numeric;floorqty numeric;target numeric;
 lead integer;needed date;oid uuid;kind text;supplier jsonb;factor numeric;details jsonb;missing boolean;total integer;weights integer;
BEGIN
 PERFORM public.planning_require(_org,'planning.read');PERFORM public.planning_require(_org,CASE WHEN sim OR sid IS NOT NULL THEN 'planning.simulate' ELSE 'planning.run' END);PERFORM public.inventory_lock(_org);
 IF nullif(trim(key),'') IS NULL THEN RAISE EXCEPTION 'Chave de idempotência obrigatória.';END IF;
 SELECT * INTO run FROM public.planning_runs WHERE organization_id=_org AND request_key=key;
 IF FOUND THEN IF run.request_payload<>_data THEN RAISE EXCEPTION 'Chave reutilizada com conteúdo diferente.';END IF;RETURN to_jsonb(run);END IF;
 PERFORM public.planning_ensure_settings(_org);SELECT * INTO cfg FROM public.planning_settings WHERE organization_id=_org;
 IF sid IS NOT NULL THEN SELECT * INTO sc FROM public.planning_scenarios WHERE id=sid AND organization_id=_org;IF NOT FOUND THEN RAISE EXCEPTION 'Cenário fora da organização.';END IF;sim:=true;END IF;
 startd:=coalesce((_data->>'horizon_start')::date,current_date);endd:=coalesce((_data->>'horizon_end')::date,startd+coalesce(sc.horizon_days,cfg.projection_days)-1);
 IF startd<current_date OR endd<startd OR endd-current_date>=365 THEN RAISE EXCEPTION 'Horizonte deve começar hoje ou no futuro e terminar em até 365 dias.';END IF;
 IF coalesce(sc.demand_multiplier,1)>100 OR coalesce(sc.safety_stock_multiplier,1)>100 OR abs(coalesce(sc.lead_time_adjustment_days,0))>365 THEN RAISE EXCEPTION 'Cenário fora dos limites operacionais.';END IF;
 INSERT INTO public.planning_runs(organization_id,name,planning_date,horizon_start,horizon_end,status,time_bucket,planning_method,demand_sources,scenario_id,simulated,request_key,request_payload,parameters_snapshot,started_at,created_by)
 VALUES(_org,coalesce(nullif(trim(_data->>'name'),''),'Planejamento '||key),current_date,startd,endd,'PROCESSING',cfg.time_bucket,cfg.forecast_method,cfg.demand_sources,sid,sim,key,_data,
 jsonb_build_object('settings',to_jsonb(cfg),'scenario',to_jsonb(sc),'calendar','UTC_CALENDAR_DAYS','bom_policy','VALID_AT_PLANNING_DATE','reservations','NOT_IMPLEMENTED','forecast_policy','ADDITIVE_MANUAL','calculated_at',now()),now(),auth.uid()) RETURNING * INTO run;
 PERFORM public.planning_audit(_org,'planning.run.created','planning_runs',run.id,_data);
 BEGIN
  -- Freeze input relations while calculating. No frontend arithmetic and no writer in this block.
  DROP TABLE IF EXISTS pg_temp.pln_locations,pg_temp.pln_items,pg_temp.pln_edges,pg_temp.pln_depth;
  CREATE TEMP TABLE pln_locations ON COMMIT DROP AS SELECT l.id,l.type,
   l.type NOT IN ('PARTNER','TRANSIT') AND l.operational_purpose='NORMAL' AND
   coalesce(a.include_in_planning,l.type IN ('FACTORY','WAREHOUSE','OWN_STORE')) included
   FROM public.inventory_locations l LEFT JOIN public.planning_availability a ON a.location_id=l.id AND a.organization_id=_org WHERE l.organization_id=_org AND l.status='ACTIVE';
  CREATE TEMP TABLE pln_items ON COMMIT DROP AS
   SELECT v.id,v.sku,p.name,p.item_type::text item_type,(v.status::text='ACTIVE' AND p.status::text='ACTIVE') active,
    coalesce(v.unit_of_measure_id,(SELECT id FROM public.units_of_measure WHERE organization_id IS NULL AND code='un')) unit,
    v.safety_stock,v.minimum_stock,v.reorder_point,v.target_stock,v.replenishment_policy,b.id bom_id,b.version bom_version,b.production_lead_time_days,
    coalesce(stock.available,0)::numeric available,coalesce(stock.partner,0)::numeric partner,coalesce(stock.transit,0)::numeric transit,stock.last_movement,
    0::numeric daily_demand,NULL::date last_sale,0::integer depth
   FROM public.product_variants v JOIN public.products p ON p.id=v.product_id
   LEFT JOIN LATERAL(SELECT b.* FROM public.bill_of_materials b WHERE b.organization_id=_org AND b.product_variant_id=v.id AND b.status IN ('ACTIVE','INACTIVE','ARCHIVED') AND coalesce(b.effective_from,'-infinity')<=current_date AND (b.effective_to IS NULL OR b.effective_to>current_date) ORDER BY b.effective_from DESC NULLS LAST,b.version DESC LIMIT 1)b ON true
   LEFT JOIN LATERAL(SELECT sum(CASE WHEN m.direction='IN' THEN m.quantity ELSE -m.quantity END) FILTER(WHERE l.included) available,
    sum(CASE WHEN m.direction='IN' THEN m.quantity ELSE -m.quantity END) FILTER(WHERE l.type='PARTNER') partner,
    sum(CASE WHEN m.direction='IN' THEN m.quantity ELSE -m.quantity END) FILTER(WHERE l.type='TRANSIT') transit,max(m.occurred_at) last_movement
    FROM public.inventory_movements m JOIN pg_temp.pln_locations l ON l.id=m.location_id WHERE m.organization_id=_org AND m.variant_id=v.id AND m.status='POSTED' AND m.occurred_at<=now())stock ON true WHERE v.organization_id=_org;
  IF (SELECT count(*) FROM pg_temp.pln_items)*(endd-current_date+1)>20000 THEN RAISE EXCEPTION 'Limite de 20000 posições diárias por execução; reduza o horizonte.';END IF;
  CREATE UNIQUE INDEX ON pln_items(id);
  CREATE TEMP TABLE pln_edges ON COMMIT DROP AS SELECT i.id,i.bom_id,a.id parent,i.component_variant_id child,i.unit_of_measure_id,
    i.quantity,i.scrap_percentage,(public.cost_conversion(_org,i.unit_of_measure_id,c.unit)->>'factor')::numeric factor
    FROM pg_temp.pln_items a JOIN public.bill_of_materials_items i ON i.bom_id=a.bom_id AND i.organization_id=_org JOIN pg_temp.pln_items c ON c.id=i.component_variant_id;
  CREATE TEMP TABLE pln_depth ON COMMIT DROP AS WITH RECURSIVE paths(node,path,cycle) AS(
   SELECT id,ARRAY[id],false FROM pg_temp.pln_items UNION ALL SELECT e.child,p.path||e.child,e.child=ANY(p.path) FROM paths p JOIN pg_temp.pln_edges e ON e.parent=p.node WHERE NOT p.cycle AND cardinality(p.path)<33)
   SELECT node,max(cardinality(path)-1) depth,bool_or(cycle) cycle FROM paths GROUP BY node;
  IF EXISTS(SELECT 1 FROM pg_temp.pln_depth WHERE cycle OR depth>=32) THEN
   PERFORM public.planning_note(_org,run.id,'BOM_CYCLE_DETECTED','BLOCKING',NULL,'Ciclo ou profundidade superior a 32 níveis. Nenhuma sugestão foi emitida.');
   UPDATE public.planning_runs SET status='FAILED',error='BOM_CYCLE_DETECTED',completed_at=now() WHERE id=run.id RETURNING * INTO run;RETURN to_jsonb(run);
  END IF;
  UPDATE pg_temp.pln_items i SET depth=d.depth FROM pg_temp.pln_depth d WHERE d.node=i.id;
  -- One source sale = one fact, irrespective of the number of reconciliation records.
  INSERT INTO public.planning_source_facts(organization_id,planning_run_id,variant_id,source_type,source_id,required_date,quantity,context)
  SELECT _org,run.id,s.variant_id,'HISTORICAL_SALES',s.id::text,s.sale_date,s.quantity,jsonb_build_object('store_id',s.store_id,'marketplace',st.marketplace,'ownership_type',st.ownership_type,'partner_id',st.partner_id)
   FROM public.marketplace_sales s JOIN public.marketplace_stores st ON st.id=s.store_id
   WHERE s.organization_id=_org AND s.variant_id IS NOT NULL AND s.sale_date>=current_date-cfg.history_days AND s.sale_date<current_date
   AND (s.status='VALIDATED' OR (s.status='RECONCILED' AND EXISTS(SELECT 1 FROM public.partner_reconciliation_items i WHERE i.marketplace_sale_id=s.id AND i.organization_id=_org AND i.status='RECONCILED')))
   AND cfg.demand_sources ? 'HISTORICAL_SALES';
  weights:=jsonb_array_length(cfg.weighted_weights);
  IF cfg.forecast_method='WEIGHTED_MOVING_AVERAGE' AND (weights<1 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(cfg.weighted_weights)x WHERE x::numeric<=0)) THEN RAISE EXCEPTION 'Pesos inválidos.';END IF;
  FOR r IN SELECT * FROM pg_temp.pln_items LOOP
   SELECT max(required_date) INTO d FROM public.planning_source_facts WHERE planning_run_id=run.id AND variant_id=r.id AND source_type='HISTORICAL_SALES';
   IF d IS NOT NULL AND (SELECT min(required_date) FROM public.planning_source_facts WHERE planning_run_id=run.id AND variant_id=r.id AND source_type='HISTORICAL_SALES')<=current_date-cfg.min_history_days THEN
    IF cfg.forecast_method='SIMPLE_MOVING_AVERAGE' THEN SELECT sum(quantity)/cfg.history_days INTO base FROM public.planning_source_facts WHERE planning_run_id=run.id AND variant_id=r.id AND source_type='HISTORICAL_SALES';
    ELSE
     SELECT sum(coalesce(f.qty,0)*(cfg.weighted_weights->>least(weights-1,floor((current_date-1-g.day::date)::numeric*weights/cfg.history_days)::integer))::numeric)/
      sum((cfg.weighted_weights->>least(weights-1,floor((current_date-1-g.day::date)::numeric*weights/cfg.history_days)::integer))::numeric)
      INTO base FROM generate_series((current_date-cfg.history_days)::timestamp,(current_date-1)::timestamp,'1 day')g(day)
      LEFT JOIN LATERAL(SELECT sum(quantity) qty FROM public.planning_source_facts WHERE planning_run_id=run.id AND variant_id=r.id AND source_type='HISTORICAL_SALES' AND required_date=g.day::date)f ON true;
    END IF;
    UPDATE pg_temp.pln_items SET daily_demand=coalesce(base,0),last_sale=d WHERE id=r.id;
   ELSE
    UPDATE pg_temp.pln_items SET last_sale=d WHERE id=r.id;
    IF cfg.demand_sources ? 'HISTORICAL_SALES' AND r.item_type IN ('FINISHED_GOOD','SEMI_FINISHED_GOOD') THEN PERFORM public.planning_note(_org,run.id,'INSUFFICIENT_HISTORY','INFO',r.id,'Histórico insuficiente. Forecast base zero identificado; use ajuste manual.');END IF;
   END IF;
  END LOOP;
  INSERT INTO public.planning_source_facts(organization_id,planning_run_id,variant_id,source_type,source_id,required_date,quantity,context)
   SELECT _org,run.id,variant_id,'MANUAL_FORECAST',id::text,adjustment_date,quantity,jsonb_build_object('reason',reason,'created_by',created_by)
   FROM public.forecast_adjustments WHERE organization_id=_org AND adjustment_date BETWEEN startd AND endd AND cfg.demand_sources ? 'MANUAL_FORECAST';
  -- Scheduled receipts are pending quantities only and require a real expected date and included destination.
  FOR r IN SELECT i.*,p.destination_location_id,p.id po_id,coalesce(i.expected_delivery_date,p.expected_delivery_date) arrival FROM public.purchase_order_items i JOIN public.purchase_orders p ON p.id=i.purchase_order_id
   WHERE p.organization_id=_org AND p.status IN ('APPROVED','SENT','RECEIVING') AND i.status IN ('OPEN','PARTIALLY_RECEIVED') AND i.ordered_quantity>i.received_quantity LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_temp.pln_locations WHERE id=r.destination_location_id AND included) THEN CONTINUE;END IF;
   IF r.arrival IS NULL OR r.arrival<current_date THEN PERFORM public.planning_note(_org,run.id,'PAST_DUE_REQUIREMENT','WARNING',r.variant_id,'Compra sem data futura confiável: não abatida da necessidade.',jsonb_build_object('purchase_order_id',r.po_id));CONTINUE;END IF;
   factor:=CASE WHEN r.purchase_unit_id=(SELECT unit FROM pg_temp.pln_items WHERE id=r.variant_id) THEN 1 WHEN r.inventory_unit_id=(SELECT unit FROM pg_temp.pln_items WHERE id=r.variant_id) THEN r.conversion_factor END;
   IF factor IS NULL OR factor<=0 THEN PERFORM public.planning_note(_org,run.id,'UNIT_CONVERSION_MISSING','BLOCKING',r.variant_id,'Compra pendente sem conversão válida.',jsonb_build_object('purchase_order_item_id',r.id));CONTINUE;END IF;
   INSERT INTO public.planning_source_facts(organization_id,planning_run_id,variant_id,source_type,source_id,required_date,quantity,context)
    VALUES(_org,run.id,r.variant_id,'PURCHASE_RECEIPT',r.id::text,r.arrival+coalesce(sc.lead_time_adjustment_days,0),greatest(0,r.ordered_quantity-r.received_quantity)*factor,jsonb_build_object('purchase_order_id',r.po_id,'ordered',r.ordered_quantity,'received',r.received_quantity,'factor',factor,'expected_date',r.arrival));
  END LOOP;
  FOR r IN SELECT * FROM public.production_orders WHERE organization_id=_org AND status IN ('RELEASED','IN_PROGRESS') LOOP
   IF NOT EXISTS(SELECT 1 FROM pg_temp.pln_locations WHERE id=r.destination_location_id AND included) THEN CONTINUE;END IF;
   SELECT coalesce(sum(o.quantity_good),0) INTO base FROM public.production_outputs o JOIN public.inventory_movements m ON m.id=o.inventory_movement_id WHERE o.production_order_id=r.id AND m.status='POSTED' AND NOT EXISTS(SELECT 1 FROM public.inventory_movements rev WHERE rev.reversal_of_id=m.id);
   IF r.planned_end_at IS NULL OR r.planned_end_at::date<current_date THEN PERFORM public.planning_note(_org,run.id,'PAST_DUE_REQUIREMENT','WARNING',r.product_variant_id,'Produção sem data futura confiável não é recebimento programado.',jsonb_build_object('production_order_id',r.id));
   ELSE INSERT INTO public.planning_source_facts(organization_id,planning_run_id,variant_id,source_type,source_id,required_date,quantity,context) VALUES(_org,run.id,r.product_variant_id,'PRODUCTION_RECEIPT',r.id::text,r.planned_end_at::date,greatest(0,r.planned_quantity-base),jsonb_build_object('planned',r.planned_quantity,'posted_good',base));END IF;
   -- Outstanding material commitment of released production, not a second manufactured-product demand.
   FOR it IN SELECT * FROM public.production_order_materials WHERE production_order_id=r.id LOOP
    factor:=(public.cost_conversion(_org,it.unit_of_measure_id,(SELECT unit FROM pg_temp.pln_items WHERE id=it.component_variant_id))->>'factor')::numeric;
    IF factor IS NULL THEN PERFORM public.planning_note(_org,run.id,'UNIT_CONVERSION_MISSING','BLOCKING',it.component_variant_id,'Consumo programado sem conversão.');CONTINUE;END IF;
    INSERT INTO public.planning_source_facts(organization_id,planning_run_id,variant_id,source_type,source_id,required_date,quantity,context)
    VALUES(_org,run.id,it.component_variant_id,'PRODUCTION_REQUIREMENT',it.id::text,greatest(current_date,coalesce(r.planned_start_at::date,current_date)),greatest(0,it.planned_quantity-it.actual_quantity)*factor,jsonb_build_object('production_order_id',r.id,'factor',factor));
   END LOOP;
  END LOOP;
  UPDATE public.planning_runs SET parameters_snapshot=parameters_snapshot||jsonb_build_object('locations',(SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') FROM pg_temp.pln_locations l),'bom_edges',(SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]') FROM pg_temp.pln_edges e)) WHERE id=run.id;
  -- Low-level coding: all parents are solved before their shared components. One stock pool per variant.
  FOR r IN SELECT * FROM pg_temp.pln_items ORDER BY depth,id LOOP
   supplier:=public.planning_supplier(_org,r.id,r.unit,cfg);bal:=r.available;rawbal:=bal;
   floorqty:=r.safety_stock*coalesce(sc.safety_stock_multiplier,1);target:=r.target_stock*coalesce(sc.target_stock_multiplier,1);
   INSERT INTO public.planning_item_snapshots(organization_id,planning_run_id,variant_id,sku,product_name,item_type,unit_of_measure_id,opening_quantity,partner_quantity,transit_quantity,daily_demand,days_of_cover,last_sale_date,last_movement_at,parameters)
    VALUES(_org,run.id,r.id,r.sku,r.name,r.item_type,r.unit,bal,r.partner,r.transit,r.daily_demand,CASE WHEN r.daily_demand>0 THEN bal/r.daily_demand END,r.last_sale,r.last_movement,to_jsonb(r)||jsonb_build_object('supplier',supplier,'safety_effective',floorqty));
   IF bal<0 THEN PERFORM public.planning_note(_org,run.id,'NEGATIVE_INVENTORY','WARNING',r.id,'Saldo inicial negativo no ledger.');END IF;
   FOR d IN SELECT day::date FROM generate_series(current_date::timestamp,endd::timestamp,'1 day')day LOOP
    opening:=bal;oid:=NULL;suggested:=0;lead:=NULL;needed:=NULL;missing:=false;
    base:=CASE WHEN d>=startd THEN r.daily_demand*coalesce(sc.demand_multiplier,1) ELSE 0 END;
    SELECT coalesce(sum(quantity) FILTER(WHERE source_type='MANUAL_FORECAST'),0)*coalesce(sc.demand_multiplier,1),
      coalesce(sum(quantity) FILTER(WHERE source_type IN ('BOM','PRODUCTION_REQUIREMENT')),0),
      coalesce(sum(quantity) FILTER(WHERE source_type IN ('PURCHASE_RECEIPT','PRODUCTION_RECEIPT')),0)
     INTO manual,dependent,receipt FROM public.planning_source_facts WHERE planning_run_id=run.id AND variant_id=r.id AND required_date=d;
    demand:=base+manual+dependent;bal:=bal+receipt-demand;rawbal:=rawbal+receipt-demand;
    net:=greatest(0,floorqty-bal);
    IF cfg.minimum_stock_demand AND cfg.demand_sources ? 'MINIMUM_STOCK' AND d>=startd AND r.replenishment_policy<>'MANUAL' AND
     (r.replenishment_policy='TARGET_STOCK' OR bal<=coalesce(r.reorder_point,r.minimum_stock,0)) THEN net:=greatest(net,coalesce(target,r.minimum_stock,0)-bal);END IF;
    net:=ceil(net*1000)/1000;
    IF net>0 THEN
     kind:=CASE WHEN r.item_type IN ('FINISHED_GOOD','SEMI_FINISHED_GOOD') THEN 'PRODUCTION' ELSE 'PURCHASE' END;
     IF NOT r.active THEN missing:=true;PERFORM public.planning_note(_org,run.id,'PLANNING_DATA_INCONSISTENT','WARNING',r.id,'Variante/produto inativo ou descontinuado: sugestão bloqueada.');
     ELSIF kind='PRODUCTION' AND r.bom_id IS NULL THEN missing:=true;PERFORM public.planning_note(_org,run.id,'BOM_MISSING','BLOCKING',r.id,'Produto fabricado sem BOM vigente.');
     ELSIF kind='PRODUCTION' AND (NOT EXISTS(SELECT 1 FROM pg_temp.pln_edges WHERE parent=r.id) OR EXISTS(SELECT 1 FROM pg_temp.pln_edges WHERE parent=r.id AND factor IS NULL)) THEN missing:=true;PERFORM public.planning_note(_org,run.id,'UNIT_CONVERSION_MISSING','BLOCKING',r.id,'BOM vazia ou componente sem conversão oficial.');
     END IF;
     IF NOT missing THEN
      suggested:=net;
      IF kind='PRODUCTION' THEN lead:=coalesce(r.production_lead_time_days,cfg.production_lead_time_default);
      ELSE
       IF supplier IS NULL THEN PERFORM public.planning_note(_org,run.id,'SUPPLIER_MISSING','WARNING',r.id,'Sem fornecedor preferencial único; responsável deve definir o suprimento.');END IF;
       lead:=(supplier->>'lead_time_days')::integer;
       IF supplier IS NOT NULL AND supplier->>'conversion_factor' IS NULL THEN missing:=true;suggested:=0;PERFORM public.planning_note(_org,run.id,'UNIT_CONVERSION_MISSING','BLOCKING',r.id,'Catálogo sem conversão de MOQ/múltiplo para unidade de estoque.');
       ELSE suggested:=greatest(suggested,coalesce((supplier->>'moq')::numeric,0));IF (supplier->>'order_multiple')::numeric>0 THEN suggested:=ceil(suggested/(supplier->>'order_multiple')::numeric)*(supplier->>'order_multiple')::numeric;END IF;END IF;
      END IF;
      IF lead IS NULL THEN PERFORM public.planning_note(_org,run.id,'LEAD_TIME_MISSING','WARNING',r.id,'Lead time não configurado/observado; data sugerida indisponível.');
      ELSE lead:=greatest(0,lead+coalesce(sc.lead_time_adjustment_days,0));needed:=d-lead;IF needed<current_date THEN PERFORM public.planning_note(_org,run.id,'PAST_DUE_REQUIREMENT','WARNING',r.id,'PLANNING_LATE: início sugerido anterior a hoje.',jsonb_build_object('required_date',d,'suggested_date',needed));END IF;END IF;
      IF NOT missing THEN
       suggested:=ceil(suggested*1000)/1000;
       details:=jsonb_build_object('opening',opening,'base_forecast',base,'manual_adjustment',manual,'dependent_demand',dependent,'gross_requirement',demand,'scheduled_receipts',receipt,'safety_stock',floorqty,'target_stock',target,'net_requirement',net,'suggested_quantity',suggested,'supplier',supplier,'lead_time_days',lead,'required_date',d,'suggested_date',needed,'bom_id',r.bom_id,'bom_version',r.bom_version,'rounding',CASE WHEN suggested>net THEN 'MOQ_OR_ORDER_MULTIPLE' ELSE 'NONE' END);
       INSERT INTO public.planned_orders(organization_id,planning_run_id,scenario_id,simulated,order_type,variant_id,unit_of_measure_id,quantity,required_date,suggested_start_date,suggested_order_date,suggested_supplier_id,priority,reason,why,moq_applied,moq_value,order_multiple,bom_id)
        VALUES(_org,run.id,sid,sim,kind,r.id,r.unit,suggested,d,CASE WHEN kind='PRODUCTION' THEN needed END,CASE WHEN kind='PURCHASE' THEN needed END,(supplier->>'supplier_id')::uuid,CASE WHEN needed<current_date THEN 'HIGH' ELSE 'NORMAL' END,'Necessidade líquida calculada; sugestão não executa estoque ou financeiro.',details,coalesce((supplier->>'moq')::numeric>net,false),(supplier->>'moq')::numeric,(supplier->>'order_multiple')::numeric,r.bom_id) RETURNING id INTO oid;
       IF kind='PRODUCTION' THEN FOR it IN SELECT * FROM pg_temp.pln_edges WHERE parent=r.id LOOP
        INSERT INTO public.planning_source_facts(organization_id,planning_run_id,variant_id,source_type,source_id,required_date,quantity,context)
         VALUES(_org,run.id,it.child,'BOM',oid::text,greatest(current_date,coalesce(needed,d)),suggested*it.quantity*(1+it.scrap_percentage/100)*it.factor,to_jsonb(it)||jsonb_build_object('parent_planned_order_id',oid,'parent_quantity',suggested,'original_required_date',needed));
       END LOOP;END IF;
       bal:=bal+suggested;
      END IF;
     END IF;
     INSERT INTO public.material_requirements(organization_id,planning_run_id,variant_id,source_kind,required_quantity,available_quantity,scheduled_receipt_quantity,net_requirement,planning_quantity,required_date,suggested_order_date,lead_time_days,unit_of_measure_id,block_reason,calculation)
      VALUES(_org,run.id,r.id,CASE WHEN dependent>0 THEN 'BOM' ELSE 'TOP' END,demand,opening,receipt,net,suggested,d,needed,lead,r.unit,CASE WHEN missing THEN 'BLOCKING' END,jsonb_build_object('base_forecast',base,'manual',manual,'dependent',dependent,'safety',floorqty,'target',target,'planned_order_id',oid));
     INSERT INTO public.projected_shortages(organization_id,planning_run_id,variant_id,shortage_date,shortage_quantity,severity,source,detail)
      VALUES(_org,run.id,r.id,d,net,CASE WHEN missing OR d<=current_date THEN 'CRITICAL' ELSE 'WARNING' END,CASE WHEN dependent>0 THEN 'PRODUCTION_BLOCKING' ELSE 'DEMAND' END,jsonb_build_object('physical_gap',greatest(0,-(opening+receipt-demand)),'buffer_or_target_gap',net,'suggested_order_id',oid,'suggestion_is_not_execution',true));
    END IF;
    INSERT INTO public.planning_projections(organization_id,planning_run_id,variant_id,bucket_date,opening_quantity,base_forecast,manual_adjustment,dependent_demand,demand,scheduled_receipts,planned_receipts,projected_without_plans,projected_quantity,safety_stock,target_stock,excess_quantity)
     VALUES(_org,run.id,r.id,d,opening,base,manual,dependent,demand,receipt,suggested,rawbal,bal,floorqty,target,CASE WHEN target IS NOT NULL THEN greatest(0,bal-target) END);
    IF (SELECT count(*) FROM public.planned_orders WHERE planning_run_id=run.id)>cfg.max_planned_orders THEN RAISE EXCEPTION 'Limite de sugestões excedido; reduza horizonte.';END IF;
   END LOOP;
  END LOOP;
  UPDATE public.planning_runs SET status=CASE WHEN EXISTS(SELECT 1 FROM public.planning_exceptions WHERE planning_run_id=run.id) THEN 'COMPLETED_WITH_WARNINGS' ELSE 'COMPLETED' END,completed_at=now(),
   summary=jsonb_build_object('production_orders',(SELECT count(*) FROM public.planned_orders WHERE planning_run_id=run.id AND order_type='PRODUCTION'),'purchase_orders',(SELECT count(*) FROM public.planned_orders WHERE planning_run_id=run.id AND order_type='PURCHASE'),
   'shortage_items',(SELECT count(DISTINCT variant_id) FROM public.projected_shortages WHERE planning_run_id=run.id),'material_items',(SELECT count(DISTINCT variant_id) FROM public.material_requirements WHERE planning_run_id=run.id AND source_kind='BOM'),
   'late_orders',(SELECT count(*) FROM public.planned_orders WHERE planning_run_id=run.id AND coalesce(suggested_start_date,suggested_order_date)<current_date),
   'average_days_cover',(SELECT avg(days_of_cover) FROM public.planning_item_snapshots WHERE planning_run_id=run.id),
   'below_safety',(SELECT count(*) FROM public.planning_item_snapshots WHERE planning_run_id=run.id AND opening_quantity<(parameters->>'safety_effective')::numeric)) WHERE id=run.id RETURNING * INTO run;
 EXCEPTION WHEN OTHERS THEN
  UPDATE public.planning_runs SET status='FAILED',completed_at=now(),error=SQLERRM WHERE id=run.id RETURNING * INTO run;
  PERFORM public.planning_note(_org,run.id,'PLANNING_DATA_INCONSISTENT','BLOCKING',NULL,SQLERRM);
 END;
 PERFORM public.planning_audit(_org,'planning.run.'||lower(run.status),'planning_runs',run.id,jsonb_build_object('summary',run.summary,'error',run.error));RETURN to_jsonb(run);
END $$;
CREATE FUNCTION public.planning_order_action(_org uuid,_id uuid,_action text,_data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.planned_orders;r public.planning_runs;c public.planning_conversions;qty numeric;target uuid;result jsonb;key text:=_data->>'idempotency_key';BEGIN
 PERFORM public.planning_require(_org,'planning.read');PERFORM public.inventory_lock(_org);
 SELECT * INTO o FROM public.planned_orders WHERE id=_id AND organization_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sugestão não encontrada.';END IF;
 SELECT * INTO r FROM public.planning_runs WHERE id=o.planning_run_id AND organization_id=_org;
 IF r.status NOT IN ('COMPLETED','COMPLETED_WITH_WARNINGS') OR r.simulated THEN RAISE EXCEPTION 'Simulação ou execução não concluída não pode ser convertida/aprovada.';END IF;
 IF _action IN ('review','approve','dismiss') THEN
  PERFORM public.planning_require(_org,'planning.approve_suggestion');
  IF nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo da decisão obrigatório.';END IF;
  IF (_action='review' AND o.status<>'SUGGESTED') OR (_action='approve' AND o.status NOT IN ('SUGGESTED','REVIEWED')) OR (_action='dismiss' AND (o.status IN ('CONVERTED','DISMISSED') OR o.converted_qty>0)) THEN RAISE EXCEPTION 'Transição inválida.';END IF;
  UPDATE public.planned_orders SET status=CASE _action WHEN 'review' THEN 'REVIEWED' WHEN 'approve' THEN 'APPROVED' ELSE 'DISMISSED' END WHERE id=o.id RETURNING * INTO o;
  result:=to_jsonb(o);
 ELSIF _action='convert' THEN
  PERFORM public.planning_require(_org,CASE WHEN o.order_type='PURCHASE' THEN 'planning.convert_purchase' ELSE 'planning.convert_production' END);
  IF nullif(trim(key),'') IS NULL THEN RAISE EXCEPTION 'Chave de conversão obrigatória.';END IF;
  SELECT * INTO c FROM public.planning_conversions WHERE organization_id=_org AND idempotency_key=key;
  IF FOUND THEN IF c.planned_order_id<>o.id OR c.request_payload<>_data THEN RAISE EXCEPTION 'Chave reutilizada com dados diferentes.';END IF;RETURN to_jsonb(c);END IF;
  IF o.status<>'APPROVED' THEN RAISE EXCEPTION 'Aprove a sugestão antes de converter.';END IF;
  qty:=(_data->>'quantity')::numeric;
  IF qty IS NULL OR qty<=0 OR qty>o.quantity-o.converted_qty OR qty<>round(qty,3) THEN RAISE EXCEPTION 'Quantidade inválida ou superior ao restante.';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.product_variants v JOIN public.products p ON p.id=v.product_id WHERE v.id=o.variant_id AND v.status='ACTIVE' AND p.status='ACTIVE') THEN RAISE EXCEPTION 'Produto inativo/descontinuado.';END IF;
  IF o.order_type='PURCHASE' THEN
   target:=public.request_save(_org,jsonb_build_object('needed_by_date',o.required_date,'notes','Origem MRP: run '||r.id||', sugestão '||o.id,'items',jsonb_build_array(jsonb_build_object('variant_id',o.variant_id,'quantity',qty,'unit_of_measure_id',o.unit_of_measure_id,'needed_by_date',o.required_date,'reason',o.reason,'source_type','MRP','source_id',o.id))));
  ELSIF o.order_type='PRODUCTION' THEN
   IF NOT EXISTS(SELECT 1 FROM public.bill_of_materials b WHERE b.id=o.bom_id AND b.organization_id=_org AND b.status='ACTIVE' AND b.version=(o.why->>'bom_version')::integer) OR EXISTS(
     (SELECT id,component_variant_id,quantity,scrap_percentage,unit_of_measure_id FROM public.bill_of_materials_items WHERE bom_id=o.bom_id EXCEPT
      SELECT (e->>'id')::uuid,(e->>'child')::uuid,(e->>'quantity')::numeric,(e->>'scrap_percentage')::numeric,(e->>'unit_of_measure_id')::uuid FROM jsonb_array_elements(r.parameters_snapshot->'bom_edges') e WHERE e->>'bom_id'=o.bom_id::text)
     UNION ALL
     (SELECT (e->>'id')::uuid,(e->>'child')::uuid,(e->>'quantity')::numeric,(e->>'scrap_percentage')::numeric,(e->>'unit_of_measure_id')::uuid FROM jsonb_array_elements(r.parameters_snapshot->'bom_edges')e WHERE e->>'bom_id'=o.bom_id::text EXCEPT
      SELECT id,component_variant_id,quantity,scrap_percentage,unit_of_measure_id FROM public.bill_of_materials_items WHERE bom_id=o.bom_id)) THEN RAISE EXCEPTION 'BOM mudou; execute novo planejamento.';END IF;
   result:=public.production_create_order(_org,o.variant_id,qty,(_data->>'source_location_id')::uuid,(_data->>'destination_location_id')::uuid,o.bom_id,o.suggested_start_date::timestamptz,o.required_date::timestamptz,'Origem MRP: run '||r.id||', sugestão '||o.id,'planning:'||key);
   target:=coalesce((result->>'id')::uuid,(result->'order'->>'id')::uuid);
  ELSE RAISE EXCEPTION 'Conversão de transferência não implementada.';END IF;
  INSERT INTO public.planning_conversions(organization_id,planning_run_id,planned_order_id,quantity,source_type,source_id,idempotency_key,request_payload,created_by)
   VALUES(_org,r.id,o.id,qty,CASE WHEN o.order_type='PURCHASE' THEN 'PURCHASE_REQUEST' ELSE 'PRODUCTION_ORDER' END,target,key,_data,auth.uid()) RETURNING * INTO c;
  UPDATE public.planned_orders SET converted_qty=converted_qty+qty,converted_source=c.source_type,converted_ids=array_append(converted_ids,target::text),status=CASE WHEN converted_qty+qty=quantity THEN 'CONVERTED' ELSE 'APPROVED' END WHERE id=o.id;
  result:=to_jsonb(c);
 ELSE RAISE EXCEPTION 'Ação inválida.';END IF;
 PERFORM public.planning_audit(_org,'planning.suggestion.'||_action,'planned_orders',o.id,_data||jsonb_build_object('result',result));RETURN result;
END $$;
CREATE FUNCTION public.planning_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1,_export boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;t text;runid uuid:=nullif(_filters->>'run_id','')::uuid;run public.planning_runs;BEGIN
 PERFORM public.planning_require(_org,'planning.read');IF _export THEN PERFORM public.planning_require(_org,'planning.export');END IF;
 IF _page<1 OR _page>1000000 THEN RAISE EXCEPTION 'Página inválida.';END IF;
 IF runid IS NOT NULL THEN SELECT * INTO run FROM public.planning_runs WHERE id=runid AND organization_id=_org;IF NOT FOUND THEN RAISE EXCEPTION 'Planejamento não encontrado.';END IF;END IF;
 IF _kind='runs' THEN
  WITH rows AS MATERIALIZED(SELECT * FROM public.planning_runs WHERE organization_id=_org AND (coalesce(_filters->>'query','')='' OR strpos(lower(name),lower(_filters->>'query'))>0))
   SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT * FROM rows ORDER BY created_at DESC,id LIMIT 50 OFFSET (_page-1)*50)x),'[]'),'total',(SELECT count(*) FROM rows)) INTO result;
 ELSIF _kind='run' THEN IF runid IS NULL THEN RAISE EXCEPTION 'Informe o planejamento.';END IF;result:=to_jsonb(run);
 ELSIF _kind='dashboard' THEN SELECT to_jsonb(r) INTO result FROM public.planning_runs r WHERE organization_id=_org AND NOT simulated AND status IN ('COMPLETED','COMPLETED_WITH_WARNINGS') ORDER BY created_at DESC LIMIT 1;
 ELSIF _kind='options' THEN
  SELECT jsonb_build_object('variants',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT v.id,v.sku,p.name,v.safety_stock,v.unit_of_measure_id,b.production_lead_time_days FROM public.product_variants v JOIN public.products p ON p.id=v.product_id LEFT JOIN public.bill_of_materials b ON b.product_variant_id=v.id AND b.status='ACTIVE' WHERE v.organization_id=_org AND (coalesce(_filters->>'query','')='' OR strpos(lower(v.sku||' '||p.name),lower(_filters->>'query'))>0) ORDER BY v.sku LIMIT 50 OFFSET (_page-1)*50)x),'[]'),
   'locations',coalesce((SELECT jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'type',l.type,'purpose',l.operational_purpose,'included',coalesce(a.include_in_planning,l.type IN ('FACTORY','WAREHOUSE','OWN_STORE')))) FROM public.inventory_locations l LEFT JOIN public.planning_availability a ON a.location_id=l.id AND a.organization_id=_org WHERE l.organization_id=_org AND l.status='ACTIVE'),'[]'),
   'scenarios',coalesce((SELECT jsonb_agg(to_jsonb(s)) FROM public.planning_scenarios s WHERE organization_id=_org),'[]'),
   'settings',(SELECT to_jsonb(s) FROM public.planning_settings s WHERE organization_id=_org),
   'supplier_products',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT sp.id,sp.variant_id,v.sku,c.legal_name,sp.minimum_order_quantity,sp.order_multiple,sp.lead_time_days FROM public.supplier_products sp JOIN public.supplier_profiles p ON p.id=sp.supplier_id JOIN public.companies c ON c.id=p.company_id JOIN public.product_variants v ON v.id=sp.variant_id WHERE sp.organization_id=_org ORDER BY v.sku LIMIT 50 OFFSET (_page-1)*50)x),'[]')) INTO result;
 ELSIF _kind='forecasts' THEN
  WITH rows AS MATERIALIZED(SELECT f.*,v.sku,p.name FROM public.forecast_adjustments f JOIN public.product_variants v ON v.id=f.variant_id JOIN public.products p ON p.id=v.product_id WHERE f.organization_id=_org)
   SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT * FROM rows ORDER BY adjustment_date DESC,id LIMIT 50 OFFSET (_page-1)*50)x),'[]'),'total',(SELECT count(*) FROM rows)) INTO result;
 ELSIF _kind='compare' THEN
  IF runid IS NULL OR NOT EXISTS(SELECT 1 FROM public.planning_runs WHERE id=(_filters->>'other_run_id')::uuid AND organization_id=_org) THEN RAISE EXCEPTION 'Planejamentos inválidos.';END IF;
  WITH totals AS(SELECT planning_run_id,variant_id,sum(demand) demand,sum(planned_receipts) planned,min(projected_without_plans) min_balance FROM public.planning_projections WHERE organization_id=_org AND planning_run_id IN (runid,(_filters->>'other_run_id')::uuid) GROUP BY 1,2),rows AS MATERIALIZED(
   SELECT coalesce(a.variant_id,b.variant_id) id,v.sku,coalesce(a.demand,0) base_demand,coalesce(b.demand,0) comparison_demand,coalesce(a.planned,0) base_planned,coalesce(b.planned,0) comparison_planned,a.min_balance base_min_balance,b.min_balance comparison_min_balance,
    EXISTS(SELECT 1 FROM public.projected_shortages WHERE planning_run_id=(_filters->>'other_run_id')::uuid AND variant_id=v.id) AND NOT EXISTS(SELECT 1 FROM public.projected_shortages WHERE planning_run_id=runid AND variant_id=v.id) new_shortage
   FROM(SELECT * FROM totals WHERE planning_run_id=runid)a FULL JOIN(SELECT * FROM totals WHERE planning_run_id=(_filters->>'other_run_id')::uuid)b USING(variant_id) JOIN public.product_variants v ON v.id=coalesce(a.variant_id,b.variant_id))
   SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT * FROM rows ORDER BY sku LIMIT 50 OFFSET (_page-1)*50)x),'[]'),'total',(SELECT count(*) FROM rows)) INTO result;
 ELSIF _kind='channels' THEN
  SELECT jsonb_build_object('rows',coalesce(jsonb_agg(to_jsonb(x)),'[]')) INTO result FROM(SELECT context->>'ownership_type' channel,context->>'store_id' store_id,context->>'marketplace' marketplace,context->>'partner_id' partner_id,sum(quantity) units FROM public.planning_source_facts WHERE organization_id=_org AND planning_run_id=runid AND source_type='HISTORICAL_SALES' GROUP BY 1,2,3,4 ORDER BY 1,2 LIMIT 50 OFFSET (_page-1)*50)x;
 ELSIF _kind='projections' AND coalesce(_filters->>'bucket',run.time_bucket)='WEEKLY' THEN
  WITH source AS(SELECT p.*,run.planning_date+((p.bucket_date-run.planning_date)/7)*7 week FROM public.planning_projections p JOIN public.planning_item_snapshots i ON i.planning_run_id=p.planning_run_id AND i.variant_id=p.variant_id
   WHERE p.organization_id=_org AND p.planning_run_id=runid AND (coalesce(_filters->>'query','')='' OR strpos(lower(i.sku||' '||i.product_name),lower(_filters->>'query'))>0)
   AND (nullif(_filters->>'variant_id','') IS NULL OR p.variant_id=(_filters->>'variant_id')::uuid)), agg AS MATERIALIZED(
   SELECT variant_id,week bucket_date,variant_id::text||':'||week::text id,(array_agg(opening_quantity ORDER BY bucket_date))[1] opening_quantity,
    sum(base_forecast) base_forecast,sum(manual_adjustment) manual_adjustment,sum(dependent_demand) dependent_demand,sum(demand) demand,sum(scheduled_receipts) scheduled_receipts,sum(planned_receipts) planned_receipts,
    (array_agg(projected_without_plans ORDER BY bucket_date DESC))[1] projected_without_plans,(array_agg(projected_quantity ORDER BY bucket_date DESC))[1] projected_quantity,
    max(safety_stock) safety_stock,max(target_stock) target_stock,(array_agg(excess_quantity ORDER BY bucket_date DESC))[1] excess_quantity FROM source GROUP BY variant_id,week), rows AS MATERIALIZED(
    SELECT a.*,i.sku,i.product_name FROM agg a JOIN public.planning_item_snapshots i ON i.variant_id=a.variant_id AND i.planning_run_id=runid)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT * FROM rows ORDER BY sku,bucket_date LIMIT 50 OFFSET (_page-1)*50)x),'[]'),'total',(SELECT count(*) FROM rows)) INTO result;
 ELSIF _kind IN ('orders','requirements','shortages','exceptions','projections','items','facts','conversions') THEN
  IF runid IS NULL THEN RAISE EXCEPTION 'Informe o planejamento.';END IF;
  t:=CASE _kind WHEN 'orders' THEN 'planned_orders' WHEN 'requirements' THEN 'material_requirements' WHEN 'shortages' THEN 'projected_shortages' WHEN 'exceptions' THEN 'planning_exceptions' WHEN 'projections' THEN 'planning_projections' WHEN 'items' THEN 'planning_item_snapshots' WHEN 'facts' THEN 'planning_source_facts' ELSE 'planning_conversions' END;
  IF _kind='conversions' THEN
   SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT * FROM public.planning_conversions WHERE organization_id=_org AND planning_run_id=runid ORDER BY created_at,id LIMIT 50 OFFSET (_page-1)*50)x),'[]'),'total',(SELECT count(*) FROM public.planning_conversions WHERE organization_id=_org AND planning_run_id=runid)) INTO result;
  ELSE
   EXECUTE format('WITH rows AS MATERIALIZED(SELECT to_jsonb(t)||jsonb_build_object(''sku'',v.sku,''product_name'',p.name) row FROM public.%I t LEFT JOIN public.product_variants v ON v.id=t.variant_id LEFT JOIN public.products p ON p.id=v.product_id WHERE t.organization_id=$1 AND t.planning_run_id=$2 AND ($3='''' OR strpos(lower(coalesce(v.sku,'''')||'' ''||coalesce(p.name,'''')),lower($3))>0) AND ($4='''' OR t.variant_id::text=$4) AND ($5='''' OR to_jsonb(t)->>''order_type''=$5)) SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(row) FROM(SELECT row FROM rows ORDER BY row->>''sku'',coalesce(row->>''bucket_date'',row->>''required_date'',row->>''shortage_date''),row->>''id'' LIMIT 50 OFFSET $6)x),''[]''::jsonb),''total'',(SELECT count(*) FROM rows))',t)
    INTO result USING _org,runid,coalesce(_filters->>'query',''),coalesce(_filters->>'variant_id',''),coalesce(_filters->>'order_type',''),(_page-1)*50;
  END IF;
 ELSE RAISE EXCEPTION 'Consulta inválida.';END IF;
 RETURN coalesce(result,'{}'::jsonb);
END $$;
-- Old incomplete solver is intentionally not callable. No alternate planning engine is exposed.
CREATE OR REPLACE FUNCTION public.pln_solve(_org uuid,_run uuid,_variant uuid,_v_settings public.planning_settings,_v_scn public.planning_scenarios,_source text DEFAULT 'TOP',_depth integer DEFAULT 0,_stack text[] DEFAULT '{}') RETURNS void LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Utilize planning_execute.';END $$;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT oid::regprocedure sig,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'planning_%' OR proname LIKE 'pln_%') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.sig);
  IF f.proname IN ('planning_save','planning_execute','planning_query','planning_order_action','planning_exception_action') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.sig);END IF;
 END LOOP;
END $$;
COMMIT;
