-- MASTER 009: explicit versions and immutable source snapshots. No financial or inventory postings.
BEGIN;
CREATE TABLE public.material_cost_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES public.organizations,
 variant_id uuid NOT NULL REFERENCES public.product_variants, version integer NOT NULL,
 unit_of_measure_id uuid NOT NULL REFERENCES public.units_of_measure, unit_cost numeric(20,6) NOT NULL CHECK(unit_cost>=0 AND unit_cost<1e12),
 effective_from date NOT NULL, effective_to date, status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
 source_type text NOT NULL DEFAULT 'MANUAL' CHECK(source_type IN ('MANUAL','ADJUSTMENT')),source_reference text NOT NULL CHECK(length(trim(source_reference))>0),
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES public.profiles,
 UNIQUE(organization_id,variant_id,version),UNIQUE(organization_id,variant_id,effective_from),CHECK(effective_to IS NULL OR effective_to>effective_from)
);
CREATE TABLE public.labor_rates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 activity text NOT NULL CHECK(length(trim(activity))>0),version integer NOT NULL,hourly_cost numeric(20,6) NOT NULL CHECK(hourly_cost>=0 AND hourly_cost<1e12),
 effective_from date NOT NULL,effective_to date,status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
 reason text NOT NULL CHECK(length(trim(reason))>0),created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES public.profiles,
 UNIQUE(organization_id,activity,effective_from),CHECK(effective_to IS NULL OR effective_to>effective_from)
);
CREATE TABLE public.overhead_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 name text NOT NULL,version integer NOT NULL,method text NOT NULL CHECK(method IN ('PER_UNIT','PERCENTAGE_OF_DIRECT_COST','LABOR_HOUR')),
 rate numeric(20,6) NOT NULL CHECK(rate>=0 AND rate<1e12),effective_from date NOT NULL,effective_to date,
 status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','SUPERSEDED','ARCHIVED')),
 financial_category_id uuid REFERENCES public.financial_categories,cost_center_id uuid REFERENCES public.cost_centers,
 reason text NOT NULL CHECK(length(trim(reason))>0),created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES public.profiles,
 UNIQUE(organization_id,effective_from),CHECK(effective_to IS NULL OR effective_to>effective_from)
);
CREATE TABLE public.cost_routing_steps (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 bom_id uuid NOT NULL REFERENCES public.bill_of_materials,activity text NOT NULL,
 standard_minutes numeric(16,4) NOT NULL CHECK(standard_minutes>=0 AND standard_minutes<1e9),effective_from date NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason))>0),created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES public.profiles,
 UNIQUE(organization_id,bom_id,activity,effective_from)
);
CREATE TABLE public.production_labor_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 production_order_id uuid NOT NULL REFERENCES public.production_orders,activity text NOT NULL,
 minutes numeric(16,4) NOT NULL CHECK(minutes>0 AND minutes<1e9),occurred_at timestamptz NOT NULL,
 reason text NOT NULL CHECK(length(trim(reason))>0),idempotency_key text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES public.profiles,UNIQUE(organization_id,idempotency_key)
);
CREATE TABLE public.cost_calculation_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 scope jsonb NOT NULL,status text NOT NULL CHECK(status IN ('COMPLETED','PARTIAL','FAILED')),
 created_at timestamptz NOT NULL DEFAULT now(),started_at timestamptz NOT NULL DEFAULT now(),completed_at timestamptz,items_processed integer NOT NULL DEFAULT 0,items_failed integer NOT NULL DEFAULT 0,
 results jsonb NOT NULL DEFAULT '[]',created_by uuid REFERENCES public.profiles
);
CREATE TABLE public.product_cost_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 variant_id uuid NOT NULL REFERENCES public.product_variants,version integer NOT NULL,
 costing_method text NOT NULL CHECK(costing_method IN ('STANDARD','ACTUAL_PRODUCTION')),
 material_cost numeric(20,6) NOT NULL,component_cost numeric(20,6) NOT NULL,packaging_cost numeric(20,6) NOT NULL,
 labor_cost numeric(20,6) NOT NULL,loss_cost numeric(20,6) NOT NULL,overhead_cost numeric(20,6) NOT NULL,other_cost numeric(20,6) NOT NULL DEFAULT 0,
 total_unit_cost numeric(20,6),effective_from date NOT NULL,effective_to date,
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','ACTIVE','SUPERSEDED','ARCHIVED')),
 completeness text NOT NULL CHECK(completeness IN ('COMPLETE','INCOMPLETE')),
 bom_id uuid REFERENCES public.bill_of_materials,production_order_id uuid REFERENCES public.production_orders,
 source_reference jsonb NOT NULL,issues jsonb NOT NULL DEFAULT '[]',input_fingerprint text NOT NULL,
 approved_at timestamptz,approved_by uuid REFERENCES public.profiles,calculated_at timestamptz NOT NULL DEFAULT now(),calculated_by uuid REFERENCES public.profiles,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,variant_id,version),UNIQUE(organization_id,variant_id,input_fingerprint),
 CHECK(effective_to IS NULL OR effective_to>effective_from),CHECK(total_unit_cost IS NULL OR total_unit_cost>=0)
);
CREATE INDEX product_cost_effective ON public.product_cost_versions(organization_id,variant_id,effective_from DESC) WHERE status IN ('ACTIVE','SUPERSEDED');
CREATE TABLE public.pricing_variable_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 channel text NOT NULL CHECK(channel IN ('PARTNER','MARKETPLACE','RETAIL','WHOLESALE','OWN_STORE')),
 store_id uuid REFERENCES public.marketplace_stores,variant_id uuid REFERENCES public.product_variants,
 effective_from date NOT NULL,effective_to date,
 commission_percent numeric(9,4) NOT NULL DEFAULT 0 CHECK(commission_percent BETWEEN 0 AND 100),
 tax_percent numeric(9,4) NOT NULL DEFAULT 0 CHECK(tax_percent BETWEEN 0 AND 100),
 fee_percent numeric(9,4) NOT NULL DEFAULT 0 CHECK(fee_percent BETWEEN 0 AND 100),
 freight_per_unit numeric(20,6) NOT NULL DEFAULT 0 CHECK(freight_per_unit>=0),other_per_unit numeric(20,6) NOT NULL DEFAULT 0 CHECK(other_per_unit>=0),
 reason text NOT NULL CHECK(length(trim(reason))>0),created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES public.profiles,
 CHECK(effective_to IS NULL OR effective_to>effective_from)
);
CREATE TABLE public.profitability_settings (
 organization_id uuid PRIMARY KEY REFERENCES public.organizations,low_margin_percent numeric(9,4) CHECK(low_margin_percent BETWEEN -1000 AND 100),
 updated_at timestamptz NOT NULL DEFAULT now(),updated_by uuid REFERENCES public.profiles
);
-- Additional effective amounts have explicit provenance; legacy ambiguous freight/discount is not guessed.
CREATE TABLE public.sale_economics (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 sale_id uuid NOT NULL REFERENCES public.marketplace_sales,commission_amount numeric(20,6) NOT NULL CHECK(commission_amount>=0),
 company_shipping_amount numeric(20,6) NOT NULL CHECK(company_shipping_amount>=0),company_discount_amount numeric(20,6) NOT NULL CHECK(company_discount_amount>=0),
 marketplace_discount_amount numeric(20,6) NOT NULL CHECK(marketplace_discount_amount>=0),tax_amount numeric(20,6) NOT NULL CHECK(tax_amount>=0),other_amount numeric(20,6) NOT NULL CHECK(other_amount>=0),
 source_reference text NOT NULL CHECK(length(trim(source_reference))>0),created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES public.profiles,
 UNIQUE(organization_id,sale_id)
);
CREATE TABLE public.sale_cost_snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 sale_id uuid NOT NULL REFERENCES public.marketplace_sales,reconciliation_id uuid REFERENCES public.partner_reconciliations,
 reconciliation_closed_at timestamptz,variant_id uuid REFERENCES public.product_variants,store_id uuid NOT NULL REFERENCES public.marketplace_stores,
 partner_id uuid REFERENCES public.partner_profiles,product_cost_version_id uuid REFERENCES public.product_cost_versions,
 sale_date date NOT NULL,channel text NOT NULL,currency text NOT NULL,quantity numeric(20,6) NOT NULL,
 revenue numeric(20,6) NOT NULL,cogs numeric(20,6),commission numeric(20,6),fees numeric(20,6),freight numeric(20,6),discount numeric(20,6),tax numeric(20,6),other_cost numeric(20,6),
 gross_margin numeric(20,6),contribution numeric(20,6),margin_percent numeric(20,6),
 completeness text NOT NULL CHECK(completeness IN ('COMPLETE','INCOMPLETE')),source_reference jsonb NOT NULL,issues jsonb NOT NULL DEFAULT '[]',
 source_key text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),created_by uuid REFERENCES public.profiles,
 UNIQUE(organization_id,source_key)
);
CREATE INDEX sale_cost_reports ON public.sale_cost_snapshots(organization_id,sale_date,store_id,variant_id);
-- Price versions remain in the existing price table items, not a parallel price system.
ALTER TABLE public.price_tables ADD COLUMN channel text NOT NULL DEFAULT 'PARTNER' CHECK(channel IN ('PARTNER','WHOLESALE','RETAIL','MARKETPLACE','OWN_STORE'));
ALTER TABLE public.price_table_items DROP CONSTRAINT price_table_items_organization_id_price_table_id_variant_id_key;
ALTER TABLE public.price_table_items ADD COLUMN approved_by uuid REFERENCES public.profiles,ADD COLUMN approved_at timestamptz,ADD COLUMN minimum_price numeric(14,2) CHECK(minimum_price>=0);
CREATE UNIQUE INDEX price_item_effective ON public.price_table_items(organization_id,price_table_id,variant_id,valid_from);

INSERT INTO public.role_permissions(role,permission)
SELECT r::public.app_role,p FROM unnest(ARRAY['admin','gestor'])r CROSS JOIN unnest(ARRAY[
 'costs.read','costs.calculate','costs.simulate','costs.approve','costs.publish','costs.manage_material_cost','costs.manage_labor_rate','costs.manage_overhead',
 'pricing.read','pricing.manage','pricing.simulate','pricing.approve','profitability.read','profitability.export'])p ON CONFLICT DO NOTHING;
-- Product visibility does not imply cost visibility.
CREATE FUNCTION public.cost_require(_org uuid,_permission text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN IF auth.uid() IS NULL OR NOT public.has_permission(_org,_permission) THEN RAISE EXCEPTION 'Sem permissão: %',_permission;END IF;END $$;
CREATE FUNCTION public.cost_audit(_org uuid,_action text,_id uuid,_context jsonb) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
 INSERT INTO public.audit_log(organization_id,user_id,action,resource,resource_id,context) VALUES(_org,auth.uid(),_action,'cost_engine',_id::text,jsonb_build_object('protected_record_id',_id,'recorded_fields',(SELECT jsonb_agg(k) FROM jsonb_object_keys(_context) k)))
$$;
CREATE FUNCTION public.cost_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE j jsonb:=to_jsonb(NEW);pair text[];o uuid;n bigint;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Histórico de custo imutável.';END IF;
 IF TG_OP='UPDATE' THEN
  IF TG_TABLE_NAME IN ('product_cost_versions','material_cost_versions','labor_rates','overhead_rules') THEN
   IF (to_jsonb(OLD)-ARRAY['status','effective_to','approved_at','approved_by'])<>(j-ARRAY['status','effective_to','approved_at','approved_by']) THEN RAISE EXCEPTION 'Versão imutável.';END IF;
  ELSIF TG_TABLE_NAME NOT IN ('cost_calculation_runs','profitability_settings') THEN RAISE EXCEPTION 'Registro imutável.';END IF;
 END IF;
 FOREACH pair SLICE 1 IN ARRAY ARRAY[['variant_id','product_variants'],['unit_of_measure_id','units_of_measure'],['bom_id','bill_of_materials'],['production_order_id','production_orders'],['financial_category_id','financial_categories'],['cost_center_id','cost_centers'],['sale_id','marketplace_sales'],['store_id','marketplace_stores'],['partner_id','partner_profiles'],['product_cost_version_id','product_cost_versions'],['reconciliation_id','partner_reconciliations']] LOOP
  IF j->>pair[1] IS NULL THEN CONTINUE;END IF;
  EXECUTE format('SELECT organization_id FROM public.%I WHERE id=$1',pair[2]) INTO o USING (j->>pair[1])::uuid;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n=0 OR (o IS DISTINCT FROM NEW.organization_id AND NOT(pair[2]='units_of_measure' AND o IS NULL)) THEN RAISE EXCEPTION 'Referência fora da organização.';END IF;
 END LOOP;
 RETURN NEW;
END $$;
DO $$ DECLARE t text;p text;BEGIN
 FOREACH t IN ARRAY ARRAY['material_cost_versions','labor_rates','overhead_rules','cost_routing_steps','production_labor_entries','cost_calculation_runs','product_cost_versions','pricing_variable_rules','profitability_settings','sale_economics','sale_cost_snapshots'] LOOP
  p:=CASE WHEN t IN ('sale_cost_snapshots','sale_economics') THEN 'profitability.read' WHEN t IN ('pricing_variable_rules','profitability_settings') THEN 'pricing.read' ELSE 'costs.read' END;
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role',t);
  EXECUTE format('CREATE POLICY cost_tenant_read ON public.%I FOR SELECT TO authenticated USING(public.has_permission(organization_id,%L))',t,p);
  EXECUTE format('CREATE TRIGGER cost_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.cost_guard()',t);
 END LOOP;
END $$;

CREATE FUNCTION public.cost_save_input(_org uuid,_kind text,_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE id uuid;d date:=coalesce(nullif(_data->>'effective_from','')::date,current_date);v integer;last_date date;old_id uuid;permission text;
BEGIN
 permission:=CASE _kind WHEN 'conversion' THEN 'costs.manage_material_cost' WHEN 'material' THEN 'costs.manage_material_cost' WHEN 'labor' THEN 'costs.manage_labor_rate' WHEN 'routing' THEN 'costs.manage_labor_rate' WHEN 'labor_entry' THEN 'costs.manage_labor_rate' WHEN 'overhead' THEN 'costs.manage_overhead' WHEN 'variable_rule' THEN 'pricing.manage' WHEN 'settings' THEN 'pricing.manage' WHEN 'economics' THEN 'pricing.manage' ELSE NULL END;
 IF permission IS NULL THEN RAISE EXCEPTION 'Configuração inválida.';END IF;
 PERFORM public.cost_require(_org,permission);PERFORM public.inventory_lock(_org);
 IF _kind='conversion' THEN
  IF (SELECT count(*) FROM public.units_of_measure WHERE id IN ((_data->>'from_unit_id')::uuid,(_data->>'to_unit_id')::uuid) AND (organization_id=_org OR organization_id IS NULL))<>2 THEN RAISE EXCEPTION 'Unidades inválidas.';END IF;
  IF nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Conversão exige referência.';END IF;
  INSERT INTO public.unit_conversions(organization_id,from_unit_id,to_unit_id,factor,created_by) VALUES(_org,(_data->>'from_unit_id')::uuid,(_data->>'to_unit_id')::uuid,(_data->>'factor')::numeric,auth.uid()) RETURNING unit_conversions.id INTO id;
 ELSIF _kind='material' THEN
  SELECT max(version)+1,max(effective_from) INTO v,last_date FROM public.material_cost_versions WHERE organization_id=_org AND variant_id=(_data->>'variant_id')::uuid;
  IF d<=last_date THEN RAISE EXCEPTION 'Nova vigência deve ser posterior à última versão.';END IF;
  UPDATE public.material_cost_versions SET status='SUPERSEDED',effective_to=d WHERE organization_id=_org AND variant_id=(_data->>'variant_id')::uuid AND status='ACTIVE';
  INSERT INTO public.material_cost_versions(organization_id,variant_id,version,unit_of_measure_id,unit_cost,effective_from,source_reference,created_by)
  VALUES(_org,(_data->>'variant_id')::uuid,coalesce(v,1),(_data->>'unit_of_measure_id')::uuid,(_data->>'unit_cost')::numeric,d,_data->>'reason',auth.uid()) RETURNING material_cost_versions.id INTO id;
 ELSIF _kind='labor' THEN
  SELECT max(version)+1,max(effective_from) INTO v,last_date FROM public.labor_rates WHERE organization_id=_org AND activity=trim(_data->>'activity');
  IF d<=last_date THEN RAISE EXCEPTION 'Nova vigência deve ser posterior à última versão.';END IF;
  UPDATE public.labor_rates SET status='SUPERSEDED',effective_to=d WHERE organization_id=_org AND activity=trim(_data->>'activity') AND status='ACTIVE';
  INSERT INTO public.labor_rates(organization_id,activity,version,hourly_cost,effective_from,reason,created_by) VALUES(_org,trim(_data->>'activity'),coalesce(v,1),(_data->>'hourly_cost')::numeric,d,_data->>'reason',auth.uid()) RETURNING labor_rates.id INTO id;
 ELSIF _kind='overhead' THEN
  SELECT max(version)+1,max(effective_from) INTO v,last_date FROM public.overhead_rules WHERE organization_id=_org;
  IF d<=last_date THEN RAISE EXCEPTION 'Nova vigência deve ser posterior à última versão.';END IF;
  UPDATE public.overhead_rules SET status='SUPERSEDED',effective_to=d WHERE organization_id=_org AND status='ACTIVE';
  INSERT INTO public.overhead_rules(organization_id,name,version,method,rate,effective_from,reason,financial_category_id,cost_center_id,created_by)
  VALUES(_org,_data->>'name',coalesce(v,1),_data->>'method',(_data->>'rate')::numeric,d,_data->>'reason',nullif(_data->>'financial_category_id','')::uuid,nullif(_data->>'cost_center_id','')::uuid,auth.uid()) RETURNING overhead_rules.id INTO id;
 ELSIF _kind='routing' THEN
  INSERT INTO public.cost_routing_steps(organization_id,bom_id,activity,standard_minutes,effective_from,reason,created_by)
  VALUES(_org,(_data->>'bom_id')::uuid,trim(_data->>'activity'),(_data->>'standard_minutes')::numeric,d,_data->>'reason',auth.uid()) RETURNING cost_routing_steps.id INTO id;
 ELSIF _kind='labor_entry' THEN
  IF NOT EXISTS(SELECT 1 FROM public.production_orders WHERE production_orders.id=(_data->>'production_order_id')::uuid AND organization_id=_org AND status IN ('IN_PROGRESS','COMPLETED')) THEN RAISE EXCEPTION 'Ordem inválida para apontamento de mão de obra.';END IF;
  SELECT production_labor_entries.id INTO old_id FROM public.production_labor_entries WHERE organization_id=_org AND idempotency_key=_data->>'idempotency_key';
  IF old_id IS NOT NULL THEN
   IF EXISTS(SELECT 1 FROM public.production_labor_entries e WHERE e.id=old_id AND (e.production_order_id<>(_data->>'production_order_id')::uuid OR e.activity<>_data->>'activity' OR e.minutes<>(_data->>'minutes')::numeric OR e.occurred_at<>(_data->>'occurred_at')::timestamptz)) THEN RAISE EXCEPTION 'Idempotência com conteúdo diferente.';END IF;RETURN old_id;
  END IF;
  INSERT INTO public.production_labor_entries(organization_id,production_order_id,activity,minutes,occurred_at,reason,idempotency_key,created_by)
  VALUES(_org,(_data->>'production_order_id')::uuid,_data->>'activity',(_data->>'minutes')::numeric,(_data->>'occurred_at')::timestamptz,_data->>'reason',_data->>'idempotency_key',auth.uid()) RETURNING production_labor_entries.id INTO id;
 ELSIF _kind='variable_rule' THEN
  INSERT INTO public.pricing_variable_rules(organization_id,channel,store_id,variant_id,effective_from,effective_to,commission_percent,tax_percent,fee_percent,freight_per_unit,other_per_unit,reason,created_by)
  VALUES(_org,_data->>'channel',nullif(_data->>'store_id','')::uuid,nullif(_data->>'variant_id','')::uuid,d,nullif(_data->>'effective_to','')::date,coalesce((_data->>'commission_percent')::numeric,0),coalesce((_data->>'tax_percent')::numeric,0),coalesce((_data->>'fee_percent')::numeric,0),coalesce((_data->>'freight_per_unit')::numeric,0),coalesce((_data->>'other_per_unit')::numeric,0),_data->>'reason',auth.uid()) RETURNING pricing_variable_rules.id INTO id;
 ELSIF _kind='settings' THEN
  INSERT INTO public.profitability_settings(organization_id,low_margin_percent,updated_by) VALUES(_org,nullif(_data->>'low_margin_percent','')::numeric,auth.uid()) ON CONFLICT(organization_id) DO UPDATE SET low_margin_percent=excluded.low_margin_percent,updated_at=now(),updated_by=auth.uid();id:=_org;
 ELSIF _kind='economics' THEN
  INSERT INTO public.sale_economics(organization_id,sale_id,commission_amount,company_shipping_amount,company_discount_amount,marketplace_discount_amount,tax_amount,other_amount,source_reference,created_by)
  VALUES(_org,(_data->>'sale_id')::uuid,(_data->>'commission_amount')::numeric,(_data->>'company_shipping_amount')::numeric,(_data->>'company_discount_amount')::numeric,(_data->>'marketplace_discount_amount')::numeric,(_data->>'tax_amount')::numeric,(_data->>'other_amount')::numeric,_data->>'reason',auth.uid()) RETURNING sale_economics.id INTO id;
 END IF;
 PERFORM public.cost_audit(_org,'cost.input.'||_kind,id,_data);RETURN id;
END $$;

-- Uses registered official conversions, in either direction. No implicit roll sizes or cross-unit guesses.
CREATE FUNCTION public.cost_conversion(_org uuid,_from uuid,_to uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE c record;BEGIN
 IF _from=_to THEN RETURN jsonb_build_object('factor',1);END IF;
 SELECT id,factor INTO c FROM public.unit_conversions WHERE (organization_id=_org OR organization_id IS NULL) AND from_unit_id=_from AND to_unit_id=_to ORDER BY organization_id NULLS LAST,created_at DESC,id LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('id',c.id,'factor',c.factor);END IF;
 SELECT id,factor INTO c FROM public.unit_conversions WHERE (organization_id=_org OR organization_id IS NULL) AND from_unit_id=_to AND to_unit_id=_from ORDER BY organization_id NULLS LAST,created_at DESC,id LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('id',c.id,'factor',1/c.factor);END IF;
 RETURN NULL;
END $$;
CREATE FUNCTION public.cost_compute(_org uuid,_variant uuid,_date date,_order uuid DEFAULT NULL,_overrides jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE b public.bill_of_materials;o public.production_orders;r record;mc public.material_cost_versions;lr public.labor_rates;oh public.overhead_rules;
 sources jsonb:='[]';issues jsonb:='[]';cv jsonb; qty numeric;denom numeric:=1;rate numeric;amount numeric;loss numeric;minutes numeric:=0;
 mat numeric:=0;comp numeric:=0;pack numeric:=0;labor numeric:=0;scrap numeric:=0;overhead numeric:=0;other numeric:=coalesce((_overrides->>'other_cost')::numeric,0);good numeric;total numeric;missing boolean:=false;sc numeric;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.product_variants WHERE id=_variant AND organization_id=_org) THEN RAISE EXCEPTION 'Variante fora da organização.';END IF;
 IF _date IS NULL THEN RAISE EXCEPTION 'Data obrigatória.';END IF;
 IF other<0 OR other>=1e12 OR (other>0 AND nullif(trim(_overrides->>'other_reason'),'') IS NULL) THEN RAISE EXCEPTION 'Outros custos exigem valor válido e origem.';END IF;
 IF _order IS NOT NULL THEN
  SELECT * INTO o FROM public.production_orders WHERE id=_order AND organization_id=_org AND product_variant_id=_variant;
  IF NOT FOUND OR o.status<>'COMPLETED' THEN RAISE EXCEPTION 'Custo real exige ordem concluída da variante.';END IF;
  SELECT * INTO b FROM public.bill_of_materials WHERE id=o.bom_id AND organization_id=_org;
  SELECT sum(po.quantity_good) INTO good FROM public.production_outputs po JOIN public.inventory_movements m ON m.id=po.inventory_movement_id AND m.status='POSTED'
   WHERE po.production_order_id=_order AND po.organization_id=_org AND NOT EXISTS(SELECT 1 FROM public.inventory_movements WHERE reversal_of_id=m.id);
  IF coalesce(good,0)<=0 THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','GOOD_OUTPUT_MISSING','severity','BLOCKING'));missing:=true;ELSE denom:=good;END IF;
 ELSE
  SELECT * INTO b FROM public.bill_of_materials WHERE organization_id=_org AND product_variant_id=_variant AND status IN ('ACTIVE','INACTIVE','ARCHIVED') AND coalesce(effective_from,'-infinity')<=_date::timestamptz AND (effective_to IS NULL OR effective_to>_date::timestamptz) ORDER BY effective_from DESC NULLS LAST,version DESC,id LIMIT 1;
  IF b.id IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','BOM_MISSING','severity','BLOCKING'));missing:=true;END IF;
 END IF;
 FOR r IN
  SELECT i.id,i.component_variant_id variant_id,i.unit_of_measure_id,i.quantity,i.scrap_percentage,false is_loss,_date cost_date,'BOM_ITEM' source_type
  FROM public.bill_of_materials_items i WHERE _order IS NULL AND i.bom_id=b.id AND i.organization_id=_org
  UNION ALL
  SELECT c.id,c.variant_id,u.id,c.quantity,0,false,c.occurred_at::date,'CONSUMPTION' FROM public.production_consumptions c
   JOIN public.inventory_movements m ON m.id=c.inventory_movement_id AND m.status='POSTED'
   LEFT JOIN LATERAL(SELECT id FROM public.units_of_measure WHERE code=c.unit AND (organization_id=_org OR organization_id IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1)u ON true
   WHERE _order IS NOT NULL AND c.production_order_id=_order AND c.organization_id=_org AND NOT EXISTS(SELECT 1 FROM public.inventory_movements WHERE reversal_of_id=m.id)
  UNION ALL
  SELECT l.id,l.variant_id,u.id,l.quantity,0,true,l.occurred_at::date,'LOSS' FROM public.production_losses l
   JOIN public.inventory_movements m ON m.id=l.inventory_movement_id AND m.status='POSTED'
   LEFT JOIN LATERAL(SELECT id FROM public.units_of_measure WHERE code=l.unit AND (organization_id=_org OR organization_id IS NULL) ORDER BY organization_id NULLS LAST LIMIT 1)u ON true
   WHERE _order IS NOT NULL AND l.production_order_id=_order AND l.organization_id=_org AND NOT EXISTS(SELECT 1 FROM public.inventory_movements WHERE reversal_of_id=m.id)
 LOOP
  SELECT * INTO mc FROM public.material_cost_versions WHERE organization_id=_org AND variant_id=r.variant_id AND status IN ('ACTIVE','SUPERSEDED') AND effective_from<=r.cost_date AND (effective_to IS NULL OR effective_to>r.cost_date) ORDER BY effective_from DESC LIMIT 1;
  IF mc.id IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','MATERIAL_COST_MISSING','variant_id',r.variant_id,'severity','BLOCKING'));missing:=true;CONTINUE;END IF;
  cv:=public.cost_conversion(_org,r.unit_of_measure_id,mc.unit_of_measure_id);
  IF cv IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','UNIT_CONVERSION_MISSING','variant_id',r.variant_id,'from',r.unit_of_measure_id,'to',mc.unit_of_measure_id,'severity','BLOCKING'));missing:=true;CONTINUE;END IF;
  rate:=coalesce((_overrides->'materials'->>r.variant_id::text)::numeric,mc.unit_cost);
  sc:=CASE WHEN _order IS NULL THEN coalesce((_overrides->>'scrap_percentage')::numeric,r.scrap_percentage) ELSE 0 END;
  IF rate<0 OR rate>=1e12 OR sc<0 OR sc>=100 THEN RAISE EXCEPTION 'Custo/perda simulados inválidos.';END IF;
  qty:=r.quantity*(cv->>'factor')::numeric;amount:=qty*rate;loss:=amount*sc/100;
  IF r.is_loss THEN scrap:=scrap+amount;
  ELSE
   CASE (SELECT p.item_type FROM public.products p JOIN public.product_variants v ON v.product_id=p.id WHERE v.id=r.variant_id)
    WHEN 'PACKAGING' THEN pack:=pack+amount;
    WHEN 'COMPONENT' THEN comp:=comp+amount;
    ELSE mat:=mat+amount;
   END CASE;
   scrap:=scrap+loss;
  END IF;
  sources:=sources||jsonb_build_array(jsonb_build_object('source_type',r.source_type,'source_id',r.id,'variant_id',r.variant_id,'material_cost_version_id',mc.id,'unit_cost',rate,'quantity',r.quantity,'cost_unit_id',mc.unit_of_measure_id,'conversion',cv,'base_cost',amount,'loss_cost',CASE WHEN r.is_loss THEN amount ELSE loss END,'scrap_percentage',sc));
 END LOOP;
 IF jsonb_array_length(sources)=0 THEN missing:=true;issues:=issues||jsonb_build_array(jsonb_build_object('code','MATERIAL_INPUTS_MISSING','severity','BLOCKING'));END IF;
 FOR r IN
  SELECT x.id,x.activity,x.standard_minutes minutes,_date cost_date,'ROUTING' source_type FROM
   (SELECT DISTINCT ON(activity) * FROM public.cost_routing_steps WHERE organization_id=_org AND bom_id=b.id AND effective_from<=_date ORDER BY activity,effective_from DESC)x WHERE _order IS NULL
  UNION ALL SELECT id,activity,production_labor_entries.minutes,occurred_at::date,'ACTUAL_LABOR' FROM public.production_labor_entries WHERE _order IS NOT NULL AND organization_id=_org AND production_order_id=_order
 LOOP
  minutes:=minutes+r.minutes;
  SELECT * INTO lr FROM public.labor_rates WHERE organization_id=_org AND activity=r.activity AND effective_from<=r.cost_date AND (effective_to IS NULL OR effective_to>r.cost_date) AND status IN ('ACTIVE','SUPERSEDED') ORDER BY effective_from DESC LIMIT 1;
  IF lr.id IS NULL THEN missing:=true;issues:=issues||jsonb_build_array(jsonb_build_object('code','LABOR_RATE_MISSING','activity',r.activity,'severity','BLOCKING'));CONTINUE;END IF;
  rate:=lr.hourly_cost*coalesce((_overrides->>'labor_multiplier')::numeric,1);
  IF rate<0 OR rate>=1e12 THEN RAISE EXCEPTION 'Taxa simulada inválida.';END IF;
  labor:=labor+r.minutes*rate/60;
  sources:=sources||jsonb_build_array(jsonb_build_object('source_type',r.source_type,'source_id',r.id,'labor_rate_id',lr.id,'minutes',r.minutes,'hourly_cost',rate,'cost',r.minutes*rate/60));
 END LOOP;
 IF minutes=0 THEN
  IF _order IS NOT NULL AND EXISTS(SELECT 1 FROM public.cost_routing_steps WHERE bom_id=b.id AND standard_minutes>0) THEN missing:=true;issues:=issues||jsonb_build_array(jsonb_build_object('code','ACTUAL_LABOR_MISSING','severity','BLOCKING'));
  ELSE issues:=issues||jsonb_build_array(jsonb_build_object('code','LABOR_NOT_CONFIGURED','severity','WARNING'));END IF;
 END IF;
 SELECT * INTO oh FROM public.overhead_rules WHERE organization_id=_org AND status IN ('ACTIVE','SUPERSEDED') AND effective_from<=_date AND (effective_to IS NULL OR effective_to>_date) ORDER BY effective_from DESC LIMIT 1;
 IF oh.id IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('code','OVERHEAD_NOT_CONFIGURED','severity','WARNING'));
 ELSE
  rate:=coalesce((_overrides->>'overhead_rate')::numeric,oh.rate);
  IF rate<0 OR rate>=1e12 THEN RAISE EXCEPTION 'Overhead inválido.';END IF;
  overhead:=CASE oh.method WHEN 'PER_UNIT' THEN rate*denom WHEN 'LABOR_HOUR' THEN rate*minutes/60 ELSE (mat+comp+pack+scrap+labor)*rate/100 END;
  sources:=sources||jsonb_build_array(jsonb_build_object('source_type','OVERHEAD','overhead_rule_id',oh.id,'method',oh.method,'rate',rate,'cost',overhead,'financial_category_id',oh.financial_category_id,'cost_center_id',oh.cost_center_id));
 END IF;
 total:=(mat+comp+pack+scrap+labor+overhead+other)/denom;
 RETURN jsonb_build_object('variant_id',_variant,'effective_from',_date,'costing_method',CASE WHEN _order IS NULL THEN 'STANDARD' ELSE 'ACTUAL_PRODUCTION' END,'bom_id',b.id,'bom_version',b.version,'production_order_id',_order,'good_quantity',CASE WHEN _order IS NULL THEN 1 ELSE good END,'planned_quantity',o.planned_quantity,'rejected_quantity',o.rejected_quantity,
 'material_cost',round(mat/denom,6),'component_cost',round(comp/denom,6),'packaging_cost',round(pack/denom,6),'loss_cost',round(scrap/denom,6),'labor_cost',round(labor/denom,6),'overhead_cost',round(overhead/denom,6),'other_cost',round(other/denom,6),'other_reason',_overrides->>'other_reason',
 'total_unit_cost',CASE WHEN missing THEN NULL ELSE round(total,6) END,'known_unit_cost',round(total,6),'completeness',CASE WHEN missing THEN 'INCOMPLETE' ELSE 'COMPLETE' END,'issues',issues,'sources',sources,'methodology','BASE_PLUS_SCRAP; ACTUAL_ABSORBED_BY_GOOD_OUTPUT; BRL');
END $$;
CREATE FUNCTION public.cost_calculate(_org uuid,_data jsonb,_simulate boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE variant uuid;result jsonb;id uuid;run uuid;fingerprint text;version_no integer;outputs jsonb:='[]';processed integer:=0;failed integer:=0;inputs jsonb:=_data->'variants';overrides jsonb:=coalesce(_data->'overrides','{}');
BEGIN
 PERFORM public.cost_require(_org,'costs.read');PERFORM public.cost_require(_org,CASE WHEN _simulate THEN 'costs.simulate' ELSE 'costs.calculate' END);
 IF NOT _simulate AND (overrides-ARRAY['other_cost','other_reason'])<>'{}'::jsonb THEN RAISE EXCEPTION 'Alterações temporárias somente no simulador.';END IF;
 IF jsonb_typeof(inputs) IS DISTINCT FROM 'array' OR jsonb_array_length(inputs) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Selecione de 1 a 100 variantes.';END IF;
 PERFORM public.inventory_lock(_org);
 IF NOT _simulate THEN INSERT INTO public.cost_calculation_runs(organization_id,scope,status,created_by) VALUES(_org,_data,'COMPLETED',auth.uid()) RETURNING cost_calculation_runs.id INTO run;END IF;
 FOR variant IN SELECT DISTINCT value::uuid FROM jsonb_array_elements_text(inputs) LOOP
  BEGIN
   result:=public.cost_compute(_org,variant,(_data->>'effective_from')::date,nullif(_data->>'production_order_id','')::uuid,overrides);
   IF NOT _simulate THEN
    fingerprint:=md5(result::text);
    SELECT c.id INTO id FROM public.product_cost_versions c WHERE c.organization_id=_org AND c.variant_id=variant AND c.input_fingerprint=fingerprint;
    IF id IS NULL THEN
     SELECT coalesce(max(version),0)+1 INTO version_no FROM public.product_cost_versions WHERE organization_id=_org AND variant_id=variant;
     INSERT INTO public.product_cost_versions(organization_id,variant_id,version,costing_method,material_cost,component_cost,packaging_cost,labor_cost,loss_cost,overhead_cost,other_cost,total_unit_cost,effective_from,completeness,bom_id,production_order_id,source_reference,issues,input_fingerprint,calculated_by)
     VALUES(_org,variant,version_no,result->>'costing_method',(result->>'material_cost')::numeric,(result->>'component_cost')::numeric,(result->>'packaging_cost')::numeric,(result->>'labor_cost')::numeric,(result->>'loss_cost')::numeric,(result->>'overhead_cost')::numeric,(result->>'other_cost')::numeric,(result->>'total_unit_cost')::numeric,(_data->>'effective_from')::date,result->>'completeness',(result->>'bom_id')::uuid,(result->>'production_order_id')::uuid,result,result->'issues',fingerprint,auth.uid()) RETURNING product_cost_versions.id INTO id;
    END IF;
    result:=result||jsonb_build_object('id',id);
   END IF;
   outputs:=outputs||jsonb_build_array(result);processed:=processed+1;
   IF result->>'completeness'='INCOMPLETE' THEN failed:=failed+1;END IF;
  EXCEPTION WHEN OTHERS THEN failed:=failed+1;outputs:=outputs||jsonb_build_array(jsonb_build_object('variant_id',variant,'error',SQLERRM,'completeness','INCOMPLETE'));END;
 END LOOP;
 IF NOT _simulate THEN
  UPDATE public.cost_calculation_runs SET status=CASE WHEN failed=0 THEN 'COMPLETED' WHEN processed=0 THEN 'FAILED' ELSE 'PARTIAL' END,completed_at=now(),items_processed=processed,items_failed=failed,results=outputs WHERE cost_calculation_runs.id=run;
  PERFORM public.cost_audit(_org,'cost.calculate',run,jsonb_build_object('processed',processed,'failed',failed));
 END IF;
 RETURN jsonb_build_object('run_id',run,'simulation',_simulate,'results',outputs);
END $$;
CREATE FUNCTION public.cost_version_action(_org uuid,_id uuid,_action text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.product_cost_versions;last_date date;
BEGIN
 IF _action NOT IN ('approve','publish','archive') THEN RAISE EXCEPTION 'Ação inválida.';END IF;
 PERFORM public.cost_require(_org,CASE WHEN _action='approve' THEN 'costs.approve' ELSE 'costs.publish' END);PERFORM public.inventory_lock(_org);
 SELECT * INTO c FROM public.product_cost_versions WHERE id=_id AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Versão não encontrada.';END IF;
 IF _action='approve' THEN
  IF c.status<>'DRAFT' OR c.completeness<>'COMPLETE' THEN RAISE EXCEPTION 'Somente custo completo em rascunho pode ser aprovado.';END IF;
  UPDATE public.product_cost_versions SET approved_by=auth.uid(),approved_at=now() WHERE id=c.id;
 ELSIF _action='publish' THEN
  IF c.status='ACTIVE' THEN RETURN jsonb_build_object('id',c.id,'deduped',true);END IF;
  IF c.status<>'DRAFT' OR c.completeness<>'COMPLETE' OR c.approved_at IS NULL OR c.costing_method<>'STANDARD' THEN RAISE EXCEPTION 'Publicação exige custo padrão completo e aprovado.';END IF;
  SELECT max(effective_from) INTO last_date FROM public.product_cost_versions WHERE organization_id=_org AND variant_id=c.variant_id AND status IN ('ACTIVE','SUPERSEDED');
  IF c.effective_from<=last_date THEN RAISE EXCEPTION 'Publicação não pode reescrever vigência anterior.';END IF;
  UPDATE public.product_cost_versions SET status='SUPERSEDED',effective_to=c.effective_from WHERE organization_id=_org AND variant_id=c.variant_id AND status='ACTIVE';
  UPDATE public.product_cost_versions SET status='ACTIVE' WHERE id=c.id;
 ELSE
  IF c.status<>'DRAFT' THEN RAISE EXCEPTION 'Somente rascunho pode ser arquivado; histórico publicado é preservado.';END IF;
  UPDATE public.product_cost_versions SET status='ARCHIVED' WHERE id=c.id;
 END IF;
 PERFORM public.cost_audit(_org,'cost.'||_action,c.id,jsonb_build_object('version',c.version,'variant_id',c.variant_id));RETURN jsonb_build_object('id',c.id);
END $$;
-- Shared numeric pricing formula. Percentages are inputs, not hardcoded business assumptions.
CREATE FUNCTION public.pricing_math(_cost numeric,_data jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE price numeric;revenue numeric;gross numeric;contribution numeric;perc numeric:=coalesce((_data->>'commission_percent')::numeric,0)+coalesce((_data->>'fee_percent')::numeric,0)+coalesce((_data->>'tax_percent')::numeric,0);
 fixed numeric:=coalesce((_data->>'freight')::numeric,0)+coalesce((_data->>'other')::numeric,0);discount numeric:=coalesce((_data->>'discount_percent')::numeric,0);target numeric:=coalesce((_data->>'target_margin_percent')::numeric,0);mode text:=coalesce(_data->>'mode','MARKUP');k text;
BEGIN
 IF _cost IS NULL OR _cost<0 OR _cost>=1e12 THEN RAISE EXCEPTION 'Custo inválido.';END IF;
 FOREACH k IN ARRAY ARRAY['commission_percent','fee_percent','tax_percent','discount_percent','target_margin_percent'] LOOP IF (_data->>k)::numeric<0 OR (_data->>k)::numeric>=100 THEN RAISE EXCEPTION 'Percentual inválido: %',k;END IF;END LOOP;
 IF fixed<0 OR fixed>=1e12 OR coalesce((_data->>'freight')::numeric,0)<0 OR coalesce((_data->>'other')::numeric,0)<0 THEN RAISE EXCEPTION 'Despesa inválida.';END IF;
 IF mode='MARKUP' THEN price:=_cost*(_data->>'markup')::numeric;
 ELSIF mode='TARGET_MARGIN' THEN IF perc+target>=100 THEN RAISE EXCEPTION 'Margem e deduções inviabilizam o preço.';END IF;price:=(_cost+fixed)/(1-(perc+target)/100)/(1-discount/100);
 ELSIF mode='PRICE' THEN price:=(_data->>'price')::numeric;ELSE RAISE EXCEPTION 'Modo inválido.';END IF;
 IF price IS NULL OR price<=0 OR price>=1e12 THEN RAISE EXCEPTION 'Preço/markup inválido.';END IF;
 price:=ceil(price*100)/100;revenue:=price*(1-discount/100);gross:=revenue-_cost;contribution:=gross-revenue*perc/100-fixed;
 RETURN jsonb_build_object('suggested_price',price,'net_revenue',round(revenue,6),'cost',_cost,'markup',price/nullif(_cost,0),'gross_margin',round(gross,6),'gross_margin_percent',100*gross/nullif(revenue,0),'variable_costs',round(revenue*perc/100+fixed,6),'contribution',round(contribution,6),'contribution_margin_percent',100*contribution/nullif(revenue,0),'inputs',_data,'simulation',true);
END $$;
CREATE FUNCTION public.pricing_simulate(_org uuid,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cost numeric;BEGIN
 PERFORM public.cost_require(_org,'pricing.simulate');PERFORM public.cost_require(_org,'pricing.read');
 IF nullif(_data->>'cost_version_id','') IS NOT NULL THEN
  PERFORM public.cost_require(_org,'costs.read');SELECT total_unit_cost INTO cost FROM public.product_cost_versions WHERE id=(_data->>'cost_version_id')::uuid AND organization_id=_org AND completeness='COMPLETE';
 ELSE cost:=(_data->>'cost')::numeric;END IF;
 RETURN public.pricing_math(cost,_data);
END $$;
REVOKE INSERT,UPDATE,DELETE ON public.price_table_items FROM authenticated;
-- All versions stay in price_table_items; a new price closes the previous inclusive date window.
CREATE FUNCTION public.pricing_publish(_org uuid,_data jsonb) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE id uuid;d date:=coalesce((_data->>'valid_from')::date,current_date);prev date;BEGIN
 PERFORM public.cost_require(_org,'pricing.manage');PERFORM public.cost_require(_org,'pricing.approve');PERFORM public.inventory_lock(_org);
 IF NOT EXISTS(SELECT 1 FROM public.price_tables WHERE price_tables.id=(_data->>'price_table_id')::uuid AND organization_id=_org) OR NOT EXISTS(SELECT 1 FROM public.product_variants WHERE product_variants.id=(_data->>'variant_id')::uuid AND organization_id=_org) THEN RAISE EXCEPTION 'Tabela/variante inválida.';END IF;
 SELECT max(valid_from) INTO prev FROM public.price_table_items WHERE organization_id=_org AND price_table_id=(_data->>'price_table_id')::uuid AND variant_id=(_data->>'variant_id')::uuid;
 IF d IS NULL OR d<=prev THEN RAISE EXCEPTION 'Nova vigência deve ser posterior ao preço anterior.';END IF;
 UPDATE public.price_table_items SET valid_to=d-1 WHERE organization_id=_org AND price_table_id=(_data->>'price_table_id')::uuid AND variant_id=(_data->>'variant_id')::uuid AND (valid_to IS NULL OR valid_to>=d);
 INSERT INTO public.price_table_items(organization_id,price_table_id,variant_id,unit_price,valid_from,minimum_price,approved_by,approved_at)
 VALUES(_org,(_data->>'price_table_id')::uuid,(_data->>'variant_id')::uuid,(_data->>'unit_price')::numeric,d,nullif(_data->>'minimum_price','')::numeric,auth.uid(),now()) RETURNING price_table_items.id INTO id;
 PERFORM public.cost_audit(_org,'pricing.publish',id,jsonb_build_object('table_id',_data->>'price_table_id','variant_id',_data->>'variant_id','date',d));RETURN id;
END $$;
CREATE FUNCTION public.cost_price_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Preço histórico não pode ser excluído.';END IF;
 IF TG_OP='UPDATE' AND (to_jsonb(NEW)-'valid_to')<>(to_jsonb(OLD)-'valid_to') THEN RAISE EXCEPTION 'Preço versionado: publique nova vigência.';END IF;
 IF TG_OP='UPDATE' AND (NEW.valid_to IS NULL OR (OLD.valid_to IS NOT NULL AND NEW.valid_to>OLD.valid_to)) THEN RAISE EXCEPTION 'Vigência não pode ser reaberta.';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cost_price_immutable BEFORE UPDATE OR DELETE ON public.price_table_items FOR EACH ROW EXECUTE FUNCTION public.cost_price_guard();
CREATE FUNCTION public.cost_capture_sale(_org uuid,_sale uuid,_reconciliation uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.marketplace_sales;st public.marketplace_stores;c public.product_cost_versions;e public.sale_economics;rule public.pricing_variable_rules;r public.partner_reconciliations;
 rev numeric;cogs numeric;commission numeric;fees numeric;freight numeric;discount numeric;tax numeric;other numeric;contribution numeric;issues jsonb:='[]';id uuid;key text;v_channel text;origin text;
BEGIN
 SELECT * INTO s FROM public.marketplace_sales WHERE marketplace_sales.id=_sale AND organization_id=_org;
 IF NOT FOUND OR s.status='CANCELED' THEN RAISE EXCEPTION 'Venda inválida.';END IF;
 SELECT * INTO st FROM public.marketplace_stores WHERE marketplace_stores.id=s.store_id AND organization_id=_org;
 v_channel:=CASE WHEN st.ownership_type='PARTNER' THEN 'PARTNER' ELSE 'MARKETPLACE' END;
 IF v_channel='PARTNER' THEN
  SELECT * INTO r FROM public.partner_reconciliations WHERE partner_reconciliations.id=_reconciliation AND organization_id=_org AND status='CLOSED' AND partner_id=st.partner_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operação de parceiro exige reconciliação fechada.';END IF;
  SELECT billable_amount INTO rev FROM public.partner_reconciliation_items WHERE organization_id=_org AND reconciliation_id=r.id AND marketplace_sale_id=s.id AND status='RECONCILED';
  IF rev IS NULL THEN RAISE EXCEPTION 'Item não consolidado.';END IF;
 ELSE
  rev:=s.gross_amount+s.shipping_fee;
  SELECT snap.id INTO id FROM public.sale_cost_snapshots snap WHERE snap.organization_id=_org AND snap.sale_id=s.id AND snap.completeness='COMPLETE' AND snap.reconciliation_id IS NULL ORDER BY snap.created_at DESC LIMIT 1;
  IF id IS NOT NULL THEN RETURN id;END IF;
 END IF;
 SELECT * INTO c FROM public.product_cost_versions WHERE organization_id=_org AND variant_id=s.variant_id AND costing_method='STANDARD' AND status IN ('ACTIVE','SUPERSEDED') AND effective_from<=s.sale_date AND (effective_to IS NULL OR effective_to>s.sale_date) ORDER BY effective_from DESC LIMIT 1;
 IF c.id IS NULL OR s.currency<>'BRL' THEN issues:=issues||jsonb_build_array(CASE WHEN s.currency<>'BRL' THEN 'CURRENCY_NOT_SUPPORTED' ELSE 'PRODUCT_COST_MISSING' END);ELSE cogs:=round(c.total_unit_cost*s.quantity,6);END IF;
 SELECT * INTO e FROM public.sale_economics WHERE organization_id=_org AND sale_id=s.id;
 SELECT * INTO rule FROM public.pricing_variable_rules WHERE organization_id=_org AND pricing_variable_rules.channel=v_channel AND (store_id IS NULL OR store_id=s.store_id) AND (variant_id IS NULL OR variant_id=s.variant_id) AND effective_from<=s.sale_date AND (effective_to IS NULL OR effective_to>s.sale_date) ORDER BY (store_id IS NOT NULL)::integer+(variant_id IS NOT NULL)::integer DESC,effective_from DESC,created_at DESC,pricing_variable_rules.id DESC LIMIT 1;
 IF e.id IS NOT NULL THEN
  commission:=e.commission_amount;freight:=e.company_shipping_amount;discount:=e.company_discount_amount;tax:=e.tax_amount;other:=e.other_amount;origin:='INFORMED';
  fees:=CASE WHEN v_channel='PARTNER' THEN 0 ELSE s.platform_fee END;
 ELSIF rule.id IS NOT NULL THEN
  commission:=rev*rule.commission_percent/100;freight:=rule.freight_per_unit*s.quantity;discount:=CASE WHEN v_channel='PARTNER' THEN 0 WHEN s.discount_amount=0 THEN 0 ELSE NULL END;
  tax:=rev*rule.tax_percent/100;other:=rule.other_per_unit*s.quantity;
  fees:=CASE WHEN v_channel='PARTNER' THEN rev*rule.fee_percent/100 ELSE s.platform_fee END;origin:='CONFIGURED_ESTIMATE';
  IF discount IS NULL THEN issues:=issues||'"DISCOUNT_FUNDING_UNKNOWN"'::jsonb;END IF;
 ELSE issues:=issues||'"VARIABLE_COSTS_UNCONFIRMED"'::jsonb;origin:='INCOMPLETE';END IF;
 contribution:=rev-cogs-commission-fees-freight-discount-tax-other;
 key:=CASE WHEN v_channel='PARTNER' THEN 'rec:'||r.id||':'||r.closed_at::text||':'||s.id ELSE 'sale:'||s.id||':'||coalesce(c.id::text,'missing')||':'||coalesce(e.id::text,rule.id::text,'missing') END;
 INSERT INTO public.sale_cost_snapshots(organization_id,sale_id,reconciliation_id,reconciliation_closed_at,variant_id,store_id,partner_id,product_cost_version_id,sale_date,channel,currency,quantity,revenue,cogs,commission,fees,freight,discount,tax,other_cost,gross_margin,contribution,margin_percent,completeness,source_reference,issues,source_key,created_by)
 VALUES(_org,s.id,r.id,r.closed_at,s.variant_id,s.store_id,st.partner_id,c.id,s.sale_date,v_channel,s.currency,s.quantity,rev,cogs,commission,fees,freight,discount,tax,other,rev-cogs,contribution,100*contribution/nullif(rev,0),CASE WHEN jsonb_array_length(issues)=0 THEN 'COMPLETE' ELSE 'INCOMPLETE' END,
 jsonb_build_object('cost_version_id',c.id,'cost_effective_from',c.effective_from,'economics',to_jsonb(e),'variable_rule',to_jsonb(rule),'deductions_source',origin,'sale',to_jsonb(s),'revenue_basis',CASE WHEN v_channel='PARTNER' THEN 'FACTORY_BILLABLE' ELSE 'GROSS_PLUS_CUSTOMER_SHIPPING' END,'included',ARRAY['COGS','commission','fees','company_shipping','company_discount','tax','other'],'partner_marketplace_fees','NOT_ASSUMED_FACTORY_EXPENSE'),issues,key,auth.uid())
 ON CONFLICT(organization_id,source_key) DO NOTHING RETURNING sale_cost_snapshots.id INTO id;
 IF id IS NULL THEN SELECT sale_cost_snapshots.id INTO id FROM public.sale_cost_snapshots WHERE organization_id=_org AND source_key=key;END IF;
 RETURN id;
END $$;
CREATE FUNCTION public.cost_on_reconciliation_close() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i record;BEGIN
 IF NEW.status='CLOSED' AND (OLD.status<>'CLOSED' OR NEW.closed_at IS DISTINCT FROM OLD.closed_at) THEN
  FOR i IN SELECT marketplace_sale_id FROM public.partner_reconciliation_items WHERE reconciliation_id=NEW.id AND organization_id=NEW.organization_id AND status='RECONCILED' LOOP
   PERFORM public.cost_capture_sale(NEW.organization_id,i.marketplace_sale_id,NEW.id);
  END LOOP;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER cost_reconciliation_snapshot AFTER UPDATE ON public.partner_reconciliations FOR EACH ROW EXECUTE FUNCTION public.cost_on_reconciliation_close();
CREATE FUNCTION public.profitability_capture(_org uuid,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s uuid;r uuid;ids jsonb:='[]';BEGIN
 PERFORM public.cost_require(_org,'profitability.read');PERFORM public.cost_require(_org,'costs.calculate');PERFORM public.inventory_lock(_org);
 IF jsonb_typeof(_data->'sales') IS DISTINCT FROM 'array' OR jsonb_array_length(_data->'sales') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Selecione de 1 a 100 vendas.';END IF;
 FOR s IN SELECT value::uuid FROM jsonb_array_elements_text(_data->'sales') LOOP
  SELECT rc.id INTO r FROM public.partner_reconciliations rc JOIN public.partner_reconciliation_items i ON i.reconciliation_id=rc.id WHERE rc.organization_id=_org AND i.marketplace_sale_id=s AND rc.status='CLOSED' AND i.status='RECONCILED' ORDER BY rc.closed_at DESC LIMIT 1;
  ids:=ids||jsonb_build_array(public.cost_capture_sale(_org,s,r));
 END LOOP;
 PERFORM public.cost_audit(_org,'cost.capture',NULL,jsonb_build_object('snapshot_ids',ids));RETURN ids;
END $$;

CREATE FUNCTION public.cost_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1,_export boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;t text;permission text;BEGIN
 permission:=CASE WHEN _kind IN ('profitability','sales','snapshot') THEN 'profitability.read' WHEN _kind IN ('variable_rules','price_tables','settings','pricing_options') THEN 'pricing.read' ELSE 'costs.read' END;
 PERFORM public.cost_require(_org,permission);
 IF _export THEN PERFORM public.cost_require(_org,'profitability.export');END IF;
 IF _page<1 OR _page>1000000 THEN RAISE EXCEPTION 'Página inválida.';END IF;
 IF _kind IN ('materials','labor','overhead','routing','labor_entries','runs','variable_rules','economics') THEN
  t:=CASE _kind WHEN 'materials' THEN 'material_cost_versions' WHEN 'labor' THEN 'labor_rates' WHEN 'overhead' THEN 'overhead_rules' WHEN 'routing' THEN 'cost_routing_steps' WHEN 'labor_entries' THEN 'production_labor_entries' WHEN 'runs' THEN 'cost_calculation_runs' WHEN 'variable_rules' THEN 'pricing_variable_rules' WHEN 'economics' THEN 'sale_economics' END;
  IF _kind='economics' THEN PERFORM public.cost_require(_org,'profitability.read');END IF;
  EXECUTE format('SELECT jsonb_build_object(''rows'',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM public.%I WHERE organization_id=$1 ORDER BY created_at DESC,id LIMIT 50 OFFSET $2)q),''[]''::jsonb),''total'',(SELECT count(*) FROM public.%I WHERE organization_id=$1))',t,t) INTO result USING _org,(_page-1)*50;
 ELSIF _kind='versions' THEN
  WITH rows AS MATERIALIZED(SELECT c.*,v.sku,v.size,v.color,p.name product_name,
    lag(c.total_unit_cost) OVER(PARTITION BY c.variant_id,c.costing_method ORDER BY c.version) previous_cost,
    EXISTS(SELECT 1 FROM jsonb_array_elements(c.source_reference->'sources') src JOIN public.material_cost_versions m ON m.variant_id=(src->>'variant_id')::uuid AND m.organization_id=_org WHERE m.created_at>c.calculated_at AND m.effective_from<=current_date) recalculation_available
   FROM public.product_cost_versions c JOIN public.product_variants v ON v.id=c.variant_id JOIN public.products p ON p.id=v.product_id WHERE c.organization_id=_org
   AND (nullif(_filters->>'variant_id','') IS NULL OR c.variant_id=(_filters->>'variant_id')::uuid)
   AND (nullif(_filters->>'id','') IS NULL OR c.id=(_filters->>'id')::uuid)
   AND (coalesce(_filters->>'query','')='' OR strpos(lower(p.name||' '||v.sku),lower(_filters->>'query'))>0))
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (SELECT * FROM rows ORDER BY calculated_at DESC,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
 ELSIF _kind IN ('options','pricing_options') THEN
  SELECT jsonb_build_object(
   'variants',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT v.id,v.sku,p.name,p.item_type,v.unit_of_measure_id FROM public.product_variants v JOIN public.products p ON p.id=v.product_id WHERE v.organization_id=_org AND (coalesce(_filters->>'query','')='' OR strpos(lower(v.sku||' '||p.name),lower(_filters->>'query'))>0) ORDER BY v.sku LIMIT 50)q),'[]'::jsonb),
   'units',(SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'code',code)) FROM public.units_of_measure WHERE organization_id=_org OR organization_id IS NULL),
   'boms',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT b.id,b.code,b.product_variant_id,b.version FROM public.bill_of_materials b WHERE organization_id=_org AND status='ACTIVE' ORDER BY code LIMIT 100)q),'[]'::jsonb),
   'orders',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT id,code,product_variant_id,status,produced_quantity FROM public.production_orders WHERE organization_id=_org AND status IN ('COMPLETED','IN_PROGRESS') ORDER BY created_at DESC LIMIT 100)q),'[]'::jsonb),
   'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.financial_categories WHERE organization_id=_org),'[]'::jsonb),
   'centers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM public.cost_centers WHERE organization_id=_org),'[]'::jsonb)) INTO result;
 ELSIF _kind='impact' THEN
  PERFORM public.cost_require(_org,'costs.simulate');
  WITH affected AS MATERIALIZED(SELECT DISTINCT b.product_variant_id FROM public.bill_of_materials b JOIN public.bill_of_materials_items i ON i.bom_id=b.id WHERE b.organization_id=_org AND b.status='ACTIVE' AND i.component_variant_id=(_filters->>'material_id')::uuid),
   page AS(SELECT * FROM affected ORDER BY product_variant_id LIMIT 50 OFFSET (_page-1)*50),
   rows AS(SELECT a.product_variant_id id,v.sku,p.name product_name,
    (SELECT total_unit_cost FROM public.product_cost_versions c WHERE c.organization_id=_org AND c.variant_id=v.id AND c.status IN ('ACTIVE','SUPERSEDED') AND c.effective_from<=current_date AND (c.effective_to IS NULL OR c.effective_to>current_date) ORDER BY c.effective_from DESC LIMIT 1) current_cost,
    public.cost_compute(_org,v.id,current_date,NULL,jsonb_build_object('materials',jsonb_build_object(_filters->>'material_id',(_filters->>'unit_cost')::numeric))) simulation
    FROM page a JOIN public.product_variants v ON v.id=a.product_variant_id JOIN public.products p ON p.id=v.product_id)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(rows)) FROM rows),'[]'::jsonb),'total',(SELECT count(*) FROM affected)) INTO result;
 ELSIF _kind='comparison' THEN
  WITH rows AS MATERIALIZED(SELECT a.id,a.variant_id,v.sku,o.code production_order,a.production_order_id,a.total_unit_cost actual_cost,c.total_unit_cost standard_cost,
   a.total_unit_cost-c.total_unit_cost difference,100*(a.total_unit_cost-c.total_unit_cost)/nullif(c.total_unit_cost,0) difference_percent,
   a.material_cost actual_material,c.material_cost standard_material,a.loss_cost actual_loss,c.loss_cost standard_loss,a.labor_cost actual_labor,c.labor_cost standard_labor,a.overhead_cost actual_overhead,c.overhead_cost standard_overhead,a.completeness
   FROM public.product_cost_versions a JOIN public.product_variants v ON v.id=a.variant_id JOIN public.production_orders o ON o.id=a.production_order_id
   LEFT JOIN LATERAL(SELECT * FROM public.product_cost_versions c WHERE c.organization_id=_org AND c.variant_id=a.variant_id AND c.costing_method='STANDARD' AND c.status IN ('ACTIVE','SUPERSEDED') AND c.effective_from<=a.effective_from AND (c.effective_to IS NULL OR c.effective_to>a.effective_from) ORDER BY c.effective_from DESC LIMIT 1)c ON true
   WHERE a.organization_id=_org AND a.costing_method='ACTUAL_PRODUCTION' AND NOT EXISTS(SELECT 1 FROM public.product_cost_versions n WHERE n.production_order_id=a.production_order_id AND n.version>a.version))
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT * FROM rows ORDER BY production_order,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
 ELSIF _kind='price_tables' THEN
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT * FROM public.price_tables WHERE organization_id=_org ORDER BY name LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM public.price_tables WHERE organization_id=_org)) INTO result;
 ELSIF _kind='settings' THEN SELECT coalesce((SELECT to_jsonb(s) FROM public.profitability_settings s WHERE organization_id=_org),'{}'::jsonb) INTO result;
 ELSIF _kind='dashboard' THEN
  WITH current_cost AS(SELECT DISTINCT ON(variant_id) * FROM public.product_cost_versions WHERE organization_id=_org AND costing_method='STANDARD' AND status IN ('ACTIVE','SUPERSEDED') AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>current_date) ORDER BY variant_id,effective_from DESC)
  SELECT jsonb_build_object('average_unit_cost',(SELECT avg(total_unit_cost) FROM current_cost),
   'products_without_cost',(SELECT count(*) FROM public.product_variants v JOIN public.products p ON p.id=v.product_id WHERE v.organization_id=_org AND p.item_type='FINISHED_GOOD' AND NOT EXISTS(SELECT 1 FROM current_cost c WHERE c.variant_id=v.id)),
   'materials_without_cost',(SELECT count(*) FROM public.product_variants v JOIN public.products p ON p.id=v.product_id WHERE v.organization_id=_org AND p.item_type IN ('RAW_MATERIAL','COMPONENT','PACKAGING') AND NOT EXISTS(SELECT 1 FROM public.material_cost_versions m WHERE m.variant_id=v.id AND m.effective_from<=current_date AND (m.effective_to IS NULL OR m.effective_to>current_date) AND m.status IN ('ACTIVE','SUPERSEDED'))),
   'incomplete_calculations',(SELECT count(*) FROM public.product_cost_versions WHERE organization_id=_org AND completeness='INCOMPLETE'),
   'overhead_configured',EXISTS(SELECT 1 FROM public.overhead_rules WHERE organization_id=_org AND effective_from<=current_date AND (effective_to IS NULL OR effective_to>current_date)),
   'actual_above_standard',(SELECT count(*) FROM public.product_cost_versions a JOIN LATERAL(SELECT total_unit_cost FROM public.product_cost_versions c WHERE c.organization_id=_org AND c.variant_id=a.variant_id AND c.costing_method='STANDARD' AND c.status IN ('ACTIVE','SUPERSEDED') AND c.effective_from<=a.effective_from AND (c.effective_to IS NULL OR c.effective_to>a.effective_from) ORDER BY c.effective_from DESC LIMIT 1)s ON true WHERE a.organization_id=_org AND a.costing_method='ACTUAL_PRODUCTION' AND a.total_unit_cost>s.total_unit_cost)) INTO result;
 ELSIF _kind='sales' THEN
  WITH rows AS MATERIALIZED(SELECT s.id,s.external_order_id,s.sale_date,s.variant_id,s.quantity,s.gross_amount,s.currency,st.name store_name,st.marketplace,st.ownership_type,v.sku,
   (SELECT snap.id FROM public.sale_cost_snapshots snap WHERE snap.sale_id=s.id ORDER BY snap.created_at DESC,snap.id DESC LIMIT 1) snapshot_id
   FROM public.marketplace_sales s JOIN public.marketplace_stores st ON st.id=s.store_id LEFT JOIN public.product_variants v ON v.id=s.variant_id WHERE s.organization_id=_org AND s.status<>'CANCELED'
   AND (coalesce(_filters->>'query','')='' OR strpos(lower(concat_ws(' ',s.external_order_id,v.sku,st.name)),lower(_filters->>'query'))>0))
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT * FROM rows ORDER BY sale_date DESC,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM rows)) INTO result;
 ELSIF _kind='snapshot' THEN
  SELECT to_jsonb(s) INTO result FROM public.sale_cost_snapshots s WHERE organization_id=_org AND id=(_filters->>'id')::uuid;
  IF result IS NULL THEN RAISE EXCEPTION 'Snapshot não encontrado.';END IF;
 ELSIF _kind='profitability' THEN
  WITH latest AS(SELECT DISTINCT ON(s.sale_id) s.* FROM public.sale_cost_snapshots s
   JOIN public.marketplace_sales sale ON sale.id=s.sale_id AND sale.status<>'CANCELED'
   LEFT JOIN public.partner_reconciliations r ON r.id=s.reconciliation_id
   WHERE s.organization_id=_org AND (s.reconciliation_id IS NULL OR (r.status='CLOSED' AND s.reconciliation_closed_at=r.closed_at AND EXISTS(SELECT 1 FROM public.partner_reconciliation_items i WHERE i.reconciliation_id=r.id AND i.marketplace_sale_id=s.sale_id AND i.status='RECONCILED')))
   ORDER BY s.sale_id,s.created_at DESC,s.id DESC), rows AS MATERIALIZED(
   SELECT s.*,p.name product_name,v.sku,v.size,v.color,st.name store_name,st.marketplace,c.legal_name partner_name,p.id product_id,
    s.revenue<s.cogs below_cost,s.margin_percent<(SELECT low_margin_percent FROM public.profitability_settings WHERE organization_id=_org) low_margin
   FROM latest s LEFT JOIN public.product_variants v ON v.id=s.variant_id LEFT JOIN public.products p ON p.id=v.product_id JOIN public.marketplace_stores st ON st.id=s.store_id LEFT JOIN public.partner_profiles pp ON pp.id=s.partner_id LEFT JOIN public.companies c ON c.id=pp.company_id
   WHERE (nullif(_filters->>'from','') IS NULL OR s.sale_date>=(_filters->>'from')::date) AND (nullif(_filters->>'to','') IS NULL OR s.sale_date<=(_filters->>'to')::date)
    AND (nullif(_filters->>'product_id','') IS NULL OR p.id=(_filters->>'product_id')::uuid) AND (nullif(_filters->>'category_id','') IS NULL OR p.category_id=(_filters->>'category_id')::uuid)
    AND (nullif(_filters->>'variant_id','') IS NULL OR s.variant_id=(_filters->>'variant_id')::uuid) AND (nullif(_filters->>'store_id','') IS NULL OR s.store_id=(_filters->>'store_id')::uuid)
    AND (nullif(_filters->>'partner_id','') IS NULL OR s.partner_id=(_filters->>'partner_id')::uuid) AND (coalesce(_filters->>'marketplace','')='' OR st.marketplace=_filters->>'marketplace')
    AND (coalesce(_filters->>'channel','')='' OR s.channel=_filters->>'channel')
    AND (coalesce(_filters->>'query','')='' OR strpos(lower(concat_ws(' ',p.name,v.sku,st.name,c.legal_name)),lower(_filters->>'query'))>0)
  ), grouped AS MATERIALIZED(
   SELECT CASE _filters->>'group' WHEN 'product' THEN product_id::text WHEN 'variant' THEN variant_id::text WHEN 'store' THEN store_id::text WHEN 'partner' THEN partner_id::text WHEN 'marketplace' THEN marketplace ELSE id::text END id,
    CASE _filters->>'group' WHEN 'product' THEN product_name WHEN 'variant' THEN sku WHEN 'store' THEN store_name WHEN 'partner' THEN coalesce(partner_name,'Venda própria') WHEN 'marketplace' THEN marketplace ELSE sku||' · '||sale_date::text END label,
    currency,sum(quantity) units,sum(revenue) revenue,CASE WHEN count(cogs)=count(*) THEN sum(cogs) END cogs,
    CASE WHEN count(commission)=count(*) THEN sum(commission) END commission,CASE WHEN count(fees)=count(*) THEN sum(fees) END fees,
    CASE WHEN count(freight)=count(*) THEN sum(freight) END freight,CASE WHEN count(discount)=count(*) THEN sum(discount) END discount,
    CASE WHEN count(tax)=count(*) THEN sum(tax) END tax,CASE WHEN count(other_cost)=count(*) THEN sum(other_cost) END other_cost,
    CASE WHEN count(gross_margin)=count(*) THEN sum(gross_margin) END gross_margin,
    CASE WHEN count(contribution)=count(*) THEN sum(contribution) END contribution,
    CASE WHEN count(contribution)=count(*) THEN 100*sum(contribution)/nullif(sum(revenue),0) END margin_percent,
    count(*) FILTER(WHERE completeness='INCOMPLETE') incomplete_count,bool_or(below_cost) below_cost,bool_or(low_margin) low_margin
    FROM rows GROUP BY 1,2,3)
  SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT *,contribution/nullif(units,0) contribution_per_unit FROM grouped ORDER BY CASE WHEN _filters->>'sort'='margin' THEN margin_percent WHEN _filters->>'sort'='units' THEN units WHEN _filters->>'sort'='unit_contribution' THEN contribution/nullif(units,0) ELSE contribution END DESC NULLS LAST,id LIMIT 50 OFFSET (_page-1)*50)q),'[]'::jsonb),'total',(SELECT count(*) FROM grouped),'incomplete_sales',(SELECT count(*) FROM rows WHERE completeness='INCOMPLETE')) INTO result;
 ELSE RAISE EXCEPTION 'Consulta inválida.';
 END IF;RETURN result;
END $$;

-- New private helpers cannot be invoked to bypass authorization.
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND (proname LIKE 'cost_%' OR proname IN ('pricing_math','pricing_simulate','pricing_publish','profitability_capture')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
  IF f.proname IN ('cost_save_input','cost_calculate','cost_version_action','cost_query','pricing_simulate','pricing_publish','profitability_capture') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END $$;
-- Keep old catalogue amounts for migration review, without a parallel editable/readable cost API.
DO $$ DECLARE columns text;BEGIN
 SELECT string_agg(quote_ident(column_name),',') INTO columns FROM information_schema.columns WHERE table_schema='public' AND table_name='product_variants' AND column_name<>'cost_price';
 REVOKE SELECT,INSERT,UPDATE ON public.product_variants FROM authenticated;
 EXECUTE 'GRANT SELECT ('||columns||'), INSERT ('||columns||'), UPDATE ('||columns||') ON public.product_variants TO authenticated';
END $$;
-- The existing price editor also uses the same versioned publishing operation.
CREATE OR REPLACE FUNCTION public.price_save_item(_org uuid,_data jsonb,_item_id uuid DEFAULT NULL,_user_id uuid DEFAULT auth.uid()) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.price_table_items;payload jsonb:=_data;BEGIN
 IF _user_id IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Usuário inválido.';END IF;
 IF _item_id IS NOT NULL THEN
  SELECT * INTO old FROM public.price_table_items WHERE id=_item_id AND organization_id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Preço não encontrado.';END IF;
  payload:=jsonb_build_object('price_table_id',old.price_table_id,'variant_id',old.variant_id)||_data;
 END IF;
 RETURN jsonb_build_object('id',public.pricing_publish(_org,payload));
END $$;

COMMIT;
