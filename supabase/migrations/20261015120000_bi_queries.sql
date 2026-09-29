-- =====================================================================
-- LOVABLE MASTER 015 — BI: consultas autorizadas, drill-down, metas,
-- dashboards, exportações e configuração.
--
-- Autorização é server-side, dentro da função. O filtro do frontend é
-- conveniência de uso, nunca controle de acesso: um usuário sem
-- `bi.financial` que chame `bi_query` diretamente recebe as vendas e
-- NÃO os valores financeiros, e a agregação não vaza a existência de
-- nenhum outro tenant (§64, §75, §76).
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. DIMENSÃO AUTORIZADA
--
-- Uma dimensão só é oferecida se o usuário tem a permissão do domínio
-- correspondente. `bi.costs` não aparece para quem só tem `bi.sales`:
-- esconder o botão não basta, a dimensão também não existe.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_dimension_permission(_org uuid,_dimension text) RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT CASE
    WHEN _dimension IN ('PARTNER','STORE','MARKETPLACE') THEN 'bi.partners'
    WHEN _dimension IN ('LOCATION','LOCATION_TYPE') THEN 'bi.inventory'
    WHEN _dimension IN ('VARIANT','PRODUCT','CATEGORY') THEN 'bi.sales'
    WHEN _dimension IN ('REPRESENTATIVE','STAGE') THEN 'bi.crm'
    WHEN _dimension='COMPANY' THEN 'bi.sales'
    WHEN _dimension='SUPPLIER' THEN 'bi.procurement'
    WHEN _dimension='COST_CENTER' THEN 'bi.financial'
    ELSE 'bi.read' END;
$$;

-- Permissão do domínio de uma métrica: é ela que decide se a tela pode
-- exibir o número, independentemente de a consulta vir do dashboard
-- executivo ou de um painel salvo.
CREATE FUNCTION public.bi_metric_permission(_domain text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _domain WHEN 'FINANCIAL' THEN 'bi.financial' WHEN 'COSTS' THEN 'bi.costs'
    WHEN 'CRM' THEN 'bi.crm' WHEN 'FISCAL' THEN 'bi.fiscal' WHEN 'INVENTORY' THEN 'bi.inventory'
    WHEN 'PRODUCTION' THEN 'bi.production' WHEN 'PROCUREMENT' THEN 'bi.procurement'
    WHEN 'PARTNERS' THEN 'bi.partners' ELSE 'bi.sales' END;
$$;

-- ---------------------------------------------------------------------
-- 2. `bi_aggregate` — transformação analítica pura
--
-- Uma função SQL, sem PL/pgSQL: toda a lógica de agregação fica num
-- lugar só, para que dashboard, drill-down, comparativo e exportação
-- leiam exatamente o mesmo número. Nenhum_branch de tela pode produzir
-- uma métrica diferente da que aparece no relatório.
--
-- `_grain` = DAY | WEEK | MONTH | QUARTER (bucket da série).
-- `_dim`   = dimensão de agrupamento, ou NULL para o total do período.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_aggregate(_org uuid,_metric text,_from date,_to date,
  _dim text DEFAULT NULL,_grain text DEFAULT 'DAY',_scope jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
WITH base AS (
  SELECT f.*,
    date_trunc(_grain::text,f.fact_date)::date bucket,
    CASE _dim
      WHEN 'PARTNER' THEN (SELECT p.partner_code FROM public.partner_profiles p WHERE p.id=f.partner_id)
      WHEN 'STORE' THEN (SELECT st.name FROM public.marketplace_stores st WHERE st.id=f.store_id)
      WHEN 'MARKETPLACE' THEN (SELECT st.marketplace FROM public.marketplace_stores st WHERE st.id=f.store_id)
      WHEN 'VARIANT' THEN (SELECT v.sku FROM public.product_variants v WHERE v.id=f.variant_id)
      WHEN 'PRODUCT' THEN (SELECT p.name FROM public.products p WHERE p.id=f.product_id)
      WHEN 'CATEGORY' THEN (SELECT pc.name FROM public.product_categories pc
                             WHERE pc.id=(SELECT p.category_id FROM public.products p WHERE p.id=f.product_id))
      WHEN 'COMPANY' THEN (SELECT c.legal_name FROM public.companies c WHERE c.id=f.company_id)
      WHEN 'REPRESENTATIVE' THEN (SELECT r.name FROM public.sales_representatives r WHERE r.id=f.representative_id)
      WHEN 'CHANNEL' THEN f.channel
      WHEN 'STATUS' THEN f.status::text
      WHEN 'STAGE' THEN f.extra->>'stage'
      WHEN 'NATURE' THEN f.fact_nature END label,
    CASE _dim WHEN 'VARIANT' THEN f.variant_id WHEN 'PRODUCT' THEN f.product_id
      WHEN 'PARTNER' THEN f.partner_id WHEN 'STORE' THEN f.store_id WHEN 'COMPANY' THEN f.company_id
      WHEN 'REPRESENTATIVE' THEN f.representative_id END dim_id
  FROM public.bi_facts f
  WHERE f.organization_id=_org AND f.fact_date>=_from AND f.fact_date<_to
    -- Escopo do domínio: a métrica declara de qual fato ela é feita.
    AND (CASE _metric
      WHEN 'sales.quantity_reconciled' THEN (f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED')
      WHEN 'sales.quantity_imported' THEN (f.fact_nature='IMPORTED_SALE' AND f.status='IMPORTED')
      WHEN 'sales.billable_revenue' THEN (f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED')
      WHEN 'sales.gross_revenue_collected' THEN (f.fact_nature IN ('IMPORTED_SALE','RECONCILED_SALE') AND f.status<>'CANCELED')
      WHEN 'sales.b2b_order_value' THEN (f.fact_nature='SALES_ORDER' AND f.status<>'CANCELED')
      WHEN 'sales.orders_shipped' THEN (f.fact_nature='SHIPMENT')
      WHEN 'sales.average_price_realized' THEN (f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED')
      WHEN 'sales.margin_industrial' THEN (f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED')
      WHEN 'crm.sales_by_representative' THEN (f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED')
      WHEN 'partners.stock_third_parties' THEN f.domain='INVENTORY'
      WHEN 'partners.shipped_quantity' THEN (f.fact_nature='PARTNER_SHIPMENT' AND f.status='POSTED')
      WHEN 'partners.pending_reconciliation' THEN (f.fact_nature='IMPORTED_SALE' AND f.status='IMPORTED')
      WHEN 'partners.receivable_open' THEN f.domain='FINANCIAL'
      WHEN 'inventory.total_balance' THEN f.domain='INVENTORY'
      WHEN 'inventory.available_balance' THEN f.domain='INVENTORY'
      WHEN 'inventory.turnover' THEN f.domain='INVENTORY'
      WHEN 'inventory.days_of_coverage' THEN f.domain='INVENTORY'
      WHEN 'inventory.days_since_last_movement' THEN f.domain='INVENTORY'
      WHEN 'production.planned_quantity' THEN f.fact_nature='PRODUCTION_ORDER'
      WHEN 'production.produced_quantity' THEN f.fact_nature='PRODUCTION_ORDER'
      WHEN 'production.efficiency' THEN f.fact_nature='PRODUCTION_ORDER'
      WHEN 'production.loss_quantity' THEN f.fact_nature='PRODUCTION_ORDER'
      WHEN 'procurement.ordered_value' THEN (f.fact_nature='PURCHASE_ORDER' AND f.status<>'CANCELED')
      WHEN 'procurement.received_quantity' THEN (f.fact_nature='RECEIPT' AND f.status='POSTED')
      WHEN 'procurement.lead_time_observed' THEN f.domain='PROCUREMENT'
      WHEN 'financial.receivable_open' THEN f.domain='FINANCIAL'
      WHEN 'financial.payable_open' THEN f.domain='FINANCIAL'
      WHEN 'financial.overdue_receivable' THEN f.domain='FINANCIAL'
      WHEN 'financial.cash_in' THEN (f.fact_nature='CASH_MOVEMENT' AND f.net_amount>0)
      WHEN 'financial.cash_out' THEN (f.fact_nature='CASH_MOVEMENT' AND f.net_amount<0)
      WHEN 'financial.cash_flow_projected' THEN f.domain='FINANCIAL'
      WHEN 'financial.inadimplency_rate' THEN f.domain='FINANCIAL'
      WHEN 'crm.leads_total' THEN f.fact_nature='LEAD'
      WHEN 'crm.conversion_rate' THEN f.fact_nature='LEAD'
      WHEN 'crm.pipeline_value' THEN (f.fact_nature='OPPORTUNITY' AND f.status='OPEN')
      WHEN 'crm.quotes_value' THEN (f.fact_nature='QUOTE' AND f.status<>'CANCELED')
      WHEN 'crm.quote_acceptance_rate' THEN f.fact_nature='QUOTE'
      WHEN 'fiscal.documents_prepared' THEN (f.fact_nature='DOCUMENT_FISCAL' AND f.status='OPEN')
      WHEN 'fiscal.documents_authorized' THEN (f.fact_nature='DOCUMENT_FISCAL' AND f.status='POSTED')
      WHEN 'fiscal.pending_issues' THEN f.domain='FISCAL'
      ELSE false END)
    -- Carteira restrita: representante externo só enxerga a própria.
    AND (_scope='{}'::jsonb
         OR f.representative_id=(_scope->>'representative_id')::uuid
         OR f.company_id=(_scope->>'company_id')::uuid)),
calc AS (
  SELECT _dim IS NULL AS is_total,coalesce(label,'__TOTAL__') label,coalesce(dim_id,'00000000-0000-0000-0000-000000000000'::uuid) dim_id,
    bucket,
    CASE _metric
      WHEN 'sales.quantity_reconciled' THEN sum(b.quantity)
      WHEN 'sales.quantity_imported' THEN sum(b.quantity)
      WHEN 'sales.billable_revenue' THEN sum(b.billable_amount)
      WHEN 'sales.gross_revenue_collected' THEN sum(b.gross_amount)
      WHEN 'sales.b2b_order_value' THEN sum(b.net_amount)
      WHEN 'sales.orders_shipped' THEN count(*)
      WHEN 'sales.average_price_realized' THEN sum(b.billable_amount)/nullif(sum(b.quantity),0)
      WHEN 'sales.margin_industrial' THEN sum(b.margin)
      WHEN 'crm.sales_by_representative' THEN sum(b.billable_amount)
      WHEN 'partners.stock_third_parties' THEN sum(b.quantity)
      WHEN 'partners.shipped_quantity' THEN sum(b.quantity)
      WHEN 'partners.pending_reconciliation' THEN sum(b.quantity)
      WHEN 'partners.receivable_open' THEN sum(b.net_amount)
      WHEN 'inventory.total_balance' THEN sum(b.quantity)
      WHEN 'inventory.available_balance' THEN sum(b.quantity)
      WHEN 'inventory.turnover' THEN sum(b.cogs)
      WHEN 'inventory.days_of_coverage' THEN sum(b.quantity)
      WHEN 'inventory.days_since_last_movement' THEN sum(b.quantity)
      WHEN 'production.planned_quantity' THEN sum((b.extra->>'planned_quantity')::numeric)
      WHEN 'production.produced_quantity' THEN sum(b.quantity)
      WHEN 'production.efficiency' THEN sum(b.quantity)/nullif(sum((b.extra->>'planned_quantity')::numeric),0)*100
      WHEN 'production.loss_quantity' THEN sum(coalesce((b.extra->>'loss_quantity')::numeric,0))+sum((b.extra->>'rejected_quantity')::numeric)
      WHEN 'procurement.ordered_value' THEN sum(b.net_amount)
      WHEN 'procurement.received_quantity' THEN sum(b.quantity)
      WHEN 'procurement.lead_time_observed' THEN avg((b.extra->>'lead_time_observed')::numeric)
      WHEN 'financial.receivable_open' THEN sum(b.net_amount)
      WHEN 'financial.payable_open' THEN sum(-b.net_amount)
      WHEN 'financial.overdue_receivable' THEN sum(b.net_amount)
      WHEN 'financial.cash_in' THEN sum(b.net_amount)
      WHEN 'financial.cash_out' THEN -sum(b.net_amount)
      WHEN 'financial.cash_flow_projected' THEN sum(b.net_amount)
      WHEN 'financial.inadimplency_rate' THEN sum(b.net_amount)
      WHEN 'crm.leads_total' THEN count(*)
      WHEN 'crm.conversion_rate' THEN count(*) FILTER (WHERE b.status='POSTED')/nullif(count(*),0)*100
      WHEN 'crm.pipeline_value' THEN sum(b.net_amount)
      WHEN 'crm.quotes_value' THEN sum(b.net_amount)
      WHEN 'crm.quote_acceptance_rate' THEN count(*) FILTER (WHERE b.status='POSTED')/nullif(count(*),0)*100
      WHEN 'fiscal.documents_prepared' THEN count(*)
      WHEN 'fiscal.documents_authorized' THEN count(*)
      WHEN 'fiscal.pending_issues' THEN count(*) END value,
    -- Denominador: o que torna a razão calculável. Sem ele, a métrica é
    -- INDISPONÍVEL — não 0, e não 100%.
    CASE _metric
      WHEN 'sales.average_price_realized' THEN sum(b.quantity)
      WHEN 'production.efficiency' THEN sum((b.extra->>'planned_quantity')::numeric)
      WHEN 'crm.conversion_rate' THEN count(*)
      WHEN 'crm.quote_acceptance_rate' THEN count(*)
      WHEN 'inventory.turnover' THEN sum(b.cogs)
      WHEN 'inventory.days_of_coverage' THEN sum(b.quantity)
      END basis
  FROM base b GROUP BY GROUPING SETS ((_dim IS NULL,label,dim_id,bucket),(_dim IS NULL,label,dim_id))
),
final AS (
  SELECT c.is_total,c.label,c.dim_id,c.bucket,
    c.value,c.basis,
    row_number() OVER (PARTITION BY c.is_total,c.label,c.dim_id,c.bucket ORDER BY c.bucket NULLS FIRST) seq
  FROM calc c)
SELECT coalesce(jsonb_agg(jsonb_build_object(
  'label',label,'id',dim_id,'bucket',bucket,'value',value,
  -- `available=false` é o que a tela traduz por "indisponível".
  'available',(value IS NOT NULL AND (basis IS NULL OR basis<>0)) OR _metric NOT IN
    ('sales.average_price_realized','production.efficiency','crm.conversion_rate',
     'crm.quote_acceptance_rate','inventory.turnover','inventory.days_of_coverage')
  ) ORDER BY bucket,seq),'[]'::jsonb)
FROM final WHERE seq=1;
$$;

-- Valor único do período: o agregado sem bucket.
CREATE FUNCTION public.bi_metric_value(_org uuid,_metric text,_from date,_to date,_scope jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT coalesce((SELECT r FROM public.bi_aggregate(_org,_metric,_from,_to,NULL,'MONTH',_scope) r
                   WHERE r->>'bucket' IS NULL),'{}'::jsonb);
$$;

-- ---------------------------------------------------------------------
-- 3. `bi_query` — leitura analítica autorizada
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_from date; v_to date; v_metric text; v_dim text; v_pf date; v_pt date;
  result jsonb; def record; v_grain text; v_scope jsonb; v_cur jsonb; v_prev jsonb;
  v_curnum numeric; v_prevnum numeric;
BEGIN
  PERFORM public.bi_require(_org,'bi.read');
  v_from := nullif(_filters->>'from','')::date;
  v_to := nullif(_filters->>'to','')::date;
  SELECT p.period_start,p.period_end INTO v_from,v_to
  FROM public.bi_resolve_period(coalesce(nullif(_filters->>'period',''),'LAST_30_DAYS'),v_from,v_to) p;
  v_metric := _filters->>'metric_key';
  v_dim := _filters->>'dimension';
  v_grain := coalesce(nullif(_filters->>'granularity',''),'DAY');
  IF v_grain NOT IN ('DAY','WEEK','MONTH','QUARTER') THEN RAISE EXCEPTION 'Granularidade inválida: %',v_grain; END IF;
  v_scope := coalesce(_filters->'representative_scope','{}'::jsonb);

  IF _kind='metric_catalog' THEN
    RETURN jsonb_build_object(
      'metrics',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.metric_key)
        FROM public.bi_resolve_metric(_org,NULL::text) m),'[]'::jsonb),
      'settings',public.bi_get_settings(_org));

  ELSIF _kind IN ('metric_value','series','dimension') THEN
    IF v_metric IS NULL THEN RAISE EXCEPTION 'Métrica obrigatória.'; END IF;
    -- Definição oficial: a mesma chave para qualquer dashboard (§5).
    SELECT * INTO def FROM public.bi_resolve_metric(_org,v_metric);
    IF def IS NULL THEN RAISE EXCEPTION 'Métrica desconhecida: %',v_metric; END IF;
    PERFORM public.bi_require(_org,public.bi_metric_permission(def.business_domain));
    IF v_dim IS NOT NULL THEN
      PERFORM public.bi_require(_org,public.bi_dimension_permission(_org,v_dim));
      IF NOT (v_dim = ANY(def.compatible_dimensions)) THEN
        RAISE EXCEPTION 'A métrica % não é compatível com a dimensão %.',v_metric,v_dim;
      END IF;
    END IF;
    IF _kind='metric_value' THEN
      v_cur := public.bi_aggregate(_org,v_metric,v_from,v_to,NULL,'MONTH',v_scope);
      RETURN jsonb_build_array(coalesce((SELECT r FROM jsonb_array_elements(v_cur) r
        WHERE r->>'bucket' IS NULL),jsonb_build_object('value',NULL,'available',false)))
        || jsonb_build_object('definition',to_jsonb(def));
    ELSIF _kind='series' THEN
      RETURN public.bi_aggregate(_org,v_metric,v_from,v_to,NULL,v_grain,v_scope);
    ELSE
      RETURN public.bi_aggregate(_org,v_metric,v_from,v_to,v_dim,v_grain,v_scope);
    END IF;

  ELSIF _kind='drill' THEN
    -- §55: da visão consolidada ao registro operacional.
    IF v_metric IS NULL THEN RAISE EXCEPTION 'Métrica obrigatória para drill-down.'; END IF;
    SELECT * INTO def FROM public.bi_resolve_metric(_org,v_metric);
    IF def IS NULL THEN RAISE EXCEPTION 'Métrica desconhecida: %',v_metric; END IF;
    PERFORM public.bi_require(_org,public.bi_metric_permission(def.business_domain));
    IF v_dim IS NOT NULL THEN PERFORM public.bi_require(_org,public.bi_dimension_permission(_org,v_dim)); END IF;
    RETURN jsonb_build_object('records',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id',f.source_id,'table',f.source_table,'nature',f.fact_nature,'date',f.fact_date,'status',f.status,
        'quantity',f.quantity,'gross',f.gross_amount,'billable',f.billable_amount,'cogs',f.cogs,'margin',f.margin,
        'variant_id',f.variant_id,'sku',(SELECT v.sku FROM public.product_variants v WHERE v.id=f.variant_id),
        'product',(SELECT p.name FROM public.products p WHERE p.id=f.product_id),
        'store',(SELECT st.name FROM public.marketplace_stores st WHERE st.id=f.store_id),
        'marketplace',(SELECT st.marketplace FROM public.marketplace_stores st WHERE st.id=f.store_id),
        'partner',(SELECT pc.partner_code FROM public.partner_profiles pc WHERE pc.id=f.partner_id),
        'channel',f.channel,'quality',f.quality,'detail',f.extra,'order',f.fact_date) ORDER BY f.fact_date,f.source_id)
      FROM public.bi_facts f
      WHERE f.organization_id=_org AND f.fact_date>=v_from AND f.fact_date<v_to
        AND (CASE v_metric
          WHEN 'sales.quantity_reconciled' THEN f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED'
          WHEN 'sales.quantity_imported' THEN f.fact_nature='IMPORTED_SALE' AND f.status='IMPORTED'
          WHEN 'sales.billable_revenue' THEN f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED'
          WHEN 'sales.gross_revenue_collected' THEN f.fact_nature IN ('IMPORTED_SALE','RECONCILED_SALE') AND f.status<>'CANCELED'
          WHEN 'sales.b2b_order_value' THEN f.fact_nature='SALES_ORDER' AND f.status<>'CANCELED'
          WHEN 'sales.orders_shipped' THEN f.fact_nature='SHIPMENT'
          WHEN 'sales.margin_industrial' THEN f.fact_nature='RECONCILED_SALE' AND f.status='RECONCILED'
          WHEN 'partners.shipped_quantity' THEN f.fact_nature='PARTNER_SHIPMENT' AND f.status='POSTED'
          WHEN 'partners.pending_reconciliation' THEN f.fact_nature='IMPORTED_SALE' AND f.status='IMPORTED'
          WHEN 'procurement.ordered_value' THEN f.fact_nature='PURCHASE_ORDER' AND f.status<>'CANCELED'
          WHEN 'procurement.received_quantity' THEN f.fact_nature='RECEIPT' AND f.status='POSTED'
          WHEN 'financial.cash_in' THEN f.fact_nature='CASH_MOVEMENT' AND f.net_amount>0
          WHEN 'financial.cash_out' THEN f.fact_nature='CASH_MOVEMENT' AND f.net_amount<0
          WHEN 'crm.pipeline_value' THEN f.fact_nature='OPPORTUNITY' AND f.status='OPEN'
          WHEN 'crm.quotes_value' THEN f.fact_nature='QUOTE' AND f.status<>'CANCELED'
          WHEN 'fiscal.documents_prepared' THEN f.fact_nature='DOCUMENT_FISCAL' AND f.status='OPEN'
          WHEN 'fiscal.documents_authorized' THEN f.fact_nature='DOCUMENT_FISCAL' AND f.status='POSTED'
          ELSE true END)
        AND (nullif(_filters->>'filter_id','') IS NULL OR f.source_id::text=_filters->>'filter_id')
        AND CASE v_dim WHEN 'VARIANT' THEN f.variant_id::text=(_filters->>'variant_id')
                       WHEN 'PRODUCT' THEN f.product_id::text=(_filters->>'product_id')
                       WHEN 'PARTNER' THEN f.partner_id::text=(_filters->>'partner_id')
                       WHEN 'STORE' THEN f.store_id::text=(_filters->>'store_id')
                       WHEN 'COMPANY' THEN f.company_id::text=(_filters->>'company_id')
                       WHEN 'REPRESENTATIVE' THEN f.representative_id::text=(_filters->>'representative_id')
                       WHEN 'CHANNEL' THEN f.channel=(_filters->>'channel')
                       ELSE true END
        AND (v_scope='{}'::jsonb OR f.representative_id=(v_scope->>'representative_id')::uuid
             OR f.company_id=(v_scope->>'company_id')::uuid)
        LIMIT greatest(0,least(5000,coalesce((_filters->>'limit')::int,200)))),'[]'::jsonb),
      'drillable',true);

  ELSIF _kind='compare' THEN
    -- §52: atual versus anterior, MESMO número de dias. A diferença
    -- percentual só existe quando a base anterior é válida.
    IF v_metric IS NULL THEN RAISE EXCEPTION 'Métrica obrigatória.'; END IF;
    SELECT * INTO def FROM public.bi_resolve_metric(_org,v_metric);
    PERFORM public.bi_require(_org,public.bi_metric_permission(def.business_domain));
    SELECT p.period_start,p.period_end INTO v_pf,v_pt
      FROM public.bi_resolve_period('CUSTOM',v_from-(v_to-v_from),v_from-1) p;
    v_cur := (SELECT r FROM jsonb_array_elements(public.bi_aggregate(_org,v_metric,v_from,v_to,NULL,'MONTH',v_scope)) r
              WHERE r->>'bucket' IS NULL);
    v_prev := (SELECT r FROM jsonb_array_elements(public.bi_aggregate(_org,v_metric,v_pf,v_pt,NULL,'MONTH',v_scope)) r
               WHERE r->>'bucket' IS NULL);
    v_curnum := (v_cur->>'value')::numeric; v_prevnum := (v_prev->>'value')::numeric;
    RETURN jsonb_build_object('metric_key',v_metric,
      'current',v_cur,'previous',v_prev,
      'period_current',jsonb_build_object('from',v_from,'to',v_to-1),
      'period_previous',jsonb_build_object('from',v_pf,'to',v_pt-1),
      'delta',CASE WHEN v_curnum IS NOT NULL AND v_prevnum IS NOT NULL
        THEN jsonb_build_object('absolute',v_curnum-v_prevnum,
          'percent',CASE WHEN v_prevnum<>0 THEN (v_curnum-v_prevnum)/abs(v_prevnum)*100 END) END,
      'comparison_available',(v_curnum IS NOT NULL AND v_prevnum IS NOT NULL AND v_prevnum<>0));

  ELSIF _kind='targets' THEN
    PERFORM public.bi_require(_org,'bi.read');
    RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',t.id,'metric_key',t.metric_key,'period',t.period,
      'target',t.target_value,'unit',t.unit,'dimension',t.dimension,'dimension_value',t.dimension_value,
      'achieved',a.value,'achieved_available',a.available,
      'variance',CASE WHEN a.value IS NOT NULL THEN a.value-t.target_value END,
      'attainment_percent',CASE WHEN a.value IS NOT NULL AND t.target_value<>0
        THEN a.value/t.target_value*100 END)
      ORDER BY t.metric_key)
      FROM public.bi_targets t
      LEFT JOIN LATERAL (SELECT (r->>'value')::numeric value, coalesce((r->>'available')::boolean,false) available
        FROM public.bi_aggregate(_org,t.metric_key,t.period_start,t.period_end,NULL,'MONTH') r
        WHERE r->>'bucket' IS NULL) a ON true
      WHERE t.organization_id=_org AND t.status='ACTIVE'
        AND t.period_start<v_to AND t.period_end>=v_from),'[]'::jsonb);

  ELSIF _kind='runs' THEN
    PERFORM public.bi_require(_org,'bi.read');
    RETURN coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.started_at DESC) FROM (
        SELECT r.id,r.domain,r.status,r.mode,r.period_start,r.period_end,r.started_at,r.finished_at,
          r.processed_records,r.error_details
        FROM public.bi_processing_runs r WHERE r.organization_id=_org
        ORDER BY r.started_at DESC LIMIT 20) t),'[]'::jsonb);

  ELSIF _kind='quality' THEN
    PERFORM public.bi_require(_org,'bi.read');
    RETURN coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY array_position(ARRAY['ERROR','WARNING','INFO']::public.bi_severity[],t.severity),t.last_seen_at DESC) FROM (
        SELECT q.check_key,q.domain,q.severity,q.status,q.entity,q.message,q.details,q.last_seen_at
        FROM public.bi_quality_issues q WHERE q.organization_id=_org AND q.status<>'RESOLVED'
        LIMIT 200) t),'[]'::jsonb);

  ELSIF _kind='processing_state' THEN
    -- §14: frescor e atraso. A tela mostra aviso quando o último
    -- processamento não cobriu o período pedido.
    RETURN jsonb_build_object('latest',(SELECT jsonb_build_object('run_id',r.id,'status',r.status,
        'finished_at',r.finished_at,'covered_to',r.period_end,'domain',r.domain,'records',r.processed_records)
        FROM public.bi_processing_runs r WHERE r.organization_id=_org AND r.status IN ('COMPLETED','PARTIAL')
        ORDER BY r.finished_at DESC NULLS LAST LIMIT 1),
      'requested_period',jsonb_build_object('from',v_from,'to',v_to-1),
      'stale',coalesce((SELECT r.period_end<(v_to-1) OR r.status<>'COMPLETED'
        FROM public.bi_processing_runs r WHERE r.organization_id=_org
        ORDER BY r.finished_at DESC NULLS LAST LIMIT 1),true),
      'failed_runs',(SELECT count(*) FROM public.bi_processing_runs
        WHERE organization_id=_org AND status='FAILED' AND started_at>now()-interval '7 days'),
      'open_issues',(SELECT count(*) FROM public.bi_quality_issues
        WHERE organization_id=_org AND status='OPEN' AND severity IN ('WARNING','ERROR')));

  ELSIF _kind='inventory' THEN
    -- §32/§33/§36: saldo na data pedida, a partir do ledger.
    PERFORM public.bi_require(_org,'bi.inventory');
    RETURN jsonb_build_object('rows',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'variant_id',b.variant_id,'sku',v.sku,'product',p.name,'location',l.name,'location_type',b.location_type,
        'partner_code',(SELECT pc.partner_code FROM public.partner_profiles pc WHERE pc.id=b.partner_id),
        'balance',b.balance,'reserved',b.reserved,'available',b.available,'date',b.balance_date,
        'days_since_movement',CASE WHEN b.last_movement_at IS NULL THEN NULL ELSE (v_to-1)-b.last_movement_at::date END,
        'days_since_sale',CASE WHEN b.last_sale_at IS NULL THEN NULL ELSE (v_to-1)-b.last_sale_at::date END)
      ORDER BY b.balance DESC,b.variant_id) FROM public.bi_inventory_daily_balance b
      JOIN public.product_variants v ON v.id=b.variant_id JOIN public.products p ON p.id=v.product_id
      JOIN public.inventory_locations l ON l.id=b.location_id
      WHERE b.organization_id=_org AND b.balance_date=(nullif(_filters->>'date',''))::date),'[]'::jsonb),
      'totals',(SELECT jsonb_build_object('physical',sum(balance),'reserved',sum(reserved),'available',sum(available))
        FROM public.bi_inventory_daily_balance b
        WHERE b.organization_id=_org AND b.balance_date=(nullif(_filters->>'date',''))::date),
      'by_location',coalesce((SELECT jsonb_agg(jsonb_build_object('location',l.name,'type',b.location_type,
          'balance',sum(b.balance)) ORDER BY sum(b.balance) DESC)
        FROM public.bi_inventory_daily_balance b JOIN public.inventory_locations l ON l.id=b.location_id
        WHERE b.organization_id=_org AND b.balance_date=(nullif(_filters->>'date',''))::date
        GROUP BY l.name,b.location_type),'[]'::jsonb),
      'date',(nullif(_filters->>'date',''))::date);

  ELSIF _kind='matrix' THEN
    -- §30: matriz ABC/XYZ. Item sem histórico suficiente fica sem célula,
    -- com a justificativa — nunca "AX" por omissão.
    PERFORM public.bi_require(_org,'bi.inventory');
    RETURN jsonb_build_object(
      'rows',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'variant_id',a.variant_id,'sku',(SELECT v.sku FROM public.product_variants v WHERE v.id=a.variant_id),
        'product',(SELECT p.name FROM public.products p WHERE p.id=a.product_id),
        'abc_class',a.class,'abc_value',a.metric_value,'abc_share',a.share,'abc_cumulative',a.cumulative_share,
        'xyz_class',x.class,'xyz_mean',x.mean_value,'xyz_cv',x.coefficient_of_variation,
        'xyz_observations',x.observations,'xyz_reason',x.reason,
        'cell',CASE WHEN a.class='UNCLASSIFIED' OR x.class IS NULL OR x.class='UNCLASSIFIED' THEN NULL
                    ELSE a.class||x.class END)
      ORDER BY a.cumulative_share DESC) FROM public.bi_abc_classification a
      LEFT JOIN public.bi_xyz_classification x ON x.organization_id=a.organization_id AND x.variant_id=a.variant_id
        AND x.period_start=a.period_start AND x.period_end=a.period_end
      WHERE a.organization_id=_org AND a.period_start=v_from AND a.period_end=v_to
        AND a.metric_key=coalesce(v_metric,'sales.quantity_reconciled')),'[]'::jsonb),
      'distribution',coalesce((SELECT jsonb_object_agg(cell,n),'{}') FROM (
        SELECT (CASE WHEN a.class='UNCLASSIFIED' OR x.class IS NULL OR x.class='UNCLASSIFIED' THEN 'UNCLASSIFIED'
                     ELSE a.class||x.class END) cell,count(*) n
        FROM public.bi_abc_classification a
        LEFT JOIN public.bi_xyz_classification x ON x.organization_id=a.organization_id
          AND x.variant_id=a.variant_id AND x.period_start=a.period_start AND x.period_end=a.period_end
        WHERE a.organization_id=_org AND a.period_start=v_from AND a.period_end=v_to
          AND a.metric_key=coalesce(v_metric,'sales.quantity_reconciled') GROUP BY 1) t),
      'abc_parameters',(SELECT parameters FROM public.bi_abc_classification
        WHERE organization_id=_org AND period_start=v_from AND period_end=v_to
          AND metric_key=coalesce(v_metric,'sales.quantity_reconciled') LIMIT 1),
      'xyz_parameters',(SELECT parameters FROM public.bi_xyz_classification
        WHERE organization_id=_org AND period_start=v_from AND period_end=v_to LIMIT 1));

  ELSIF _kind='financial' THEN
    -- §42/§44: realizado vem do ledger; projetado vem dos títulos. Os dois
    -- aparecem em campos separados e nunca são somados.
    PERFORM public.bi_require(_org,'bi.financial');
    RETURN jsonb_build_object(
      'receivable',(SELECT jsonb_build_object('open',sum(open_amount),
          'overdue',sum(open_amount) FILTER (WHERE due_date<v_to AND open_amount>0),
          'upcoming',sum(open_amount) FILTER (WHERE due_date>=v_to AND open_amount>0),'count',count(*))
        FROM public.account_receivables WHERE organization_id=_org
          AND status IN ('OPEN','PARTIALLY_PAID','OVERDUE') AND due_date<v_to),
      'payable',(SELECT jsonb_build_object('open',sum(open_amount),
          'overdue',sum(open_amount) FILTER (WHERE due_date<v_to AND open_amount>0),
          'upcoming',sum(open_amount) FILTER (WHERE due_date>=v_to AND open_amount>0),'count',count(*))
        FROM public.account_payables WHERE organization_id=_org
          AND status IN ('OPEN','SCHEDULED','PARTIALLY_PAID','OVERDUE') AND due_date<v_to),
      'cash',(SELECT jsonb_build_object('in',sum(net_amount) FILTER (WHERE net_amount>0),
          'out',-sum(net_amount) FILTER (WHERE net_amount<0),'realized',sum(net_amount))
        FROM public.bi_facts WHERE organization_id=_org AND domain='FINANCIAL' AND fact_nature='CASH_MOVEMENT'
          AND fact_date>=v_from AND fact_date<v_to),
      'projected',(SELECT jsonb_build_object('in',sum(in_amount),'out',sum(out_amount))
        FROM (SELECT sum(open_amount) FILTER (WHERE due_date>=v_to) in_amount,
                     sum(open_amount) FILTER (WHERE due_date>=v_to) out_amount
              FROM (SELECT due_date,open_amount FROM public.account_receivables
                    WHERE organization_id=_org AND open_amount>0 AND status IN ('OPEN','PARTIALLY_PAID','OVERDUE')
                    UNION ALL SELECT due_date,open_amount FROM public.account_payables
                    WHERE organization_id=_org AND open_amount>0 AND status IN ('OPEN','SCHEDULED','PARTIALLY_PAID','OVERDUE')) x) y),
      'inadimplency',(SELECT round((sum(open_amount) FILTER (WHERE due_date<v_to AND open_amount>0)
          / nullif(sum(original_amount),0))*100,2) FROM public.account_receivables
        WHERE organization_id=_org AND original_amount>0),
      'receivables_by_company',coalesce((SELECT jsonb_agg(jsonb_build_object('company',c.legal_name,
          'open',sum(r.open_amount),'overdue',sum(r.open_amount) FILTER (WHERE r.due_date<v_to)) ORDER BY sum(r.open_amount) DESC)
        FROM public.account_receivables r JOIN public.companies c ON c.id=r.company_id AND c.organization_id=r.organization_id
        WHERE r.organization_id=_org AND r.status IN ('OPEN','PARTIALLY_PAID','OVERDUE') AND r.open_amount>0
        GROUP BY c.legal_name LIMIT 20),'[]'::jsonb));

  ELSIF _kind='crm' THEN
    PERFORM public.bi_require(_org,'bi.crm');
    -- §48: funil com valores que NÃO se somam entre si.
    RETURN jsonb_build_object(
      'leads',(SELECT jsonb_build_object('total',sum(n),'converted',sum(n) FILTER (WHERE status='CONVERTED'),
          'by_status',coalesce(jsonb_object_agg(status,n),'{}'))
        FROM (SELECT status,count(*) n FROM public.leads
              WHERE organization_id=_org AND created_at::date>=v_from AND created_at::date<v_to GROUP BY status) s),
      'opportunities',(SELECT jsonb_build_object('count',count(*),
          'estimated_open',sum(estimated_value) FILTER (WHERE status='OPEN'),
          'won',count(*) FILTER (WHERE status='WON'),'lost',count(*) FILTER (WHERE status='LOST'))
        FROM public.sales_opportunities
        WHERE organization_id=_org AND created_at::date>=v_from AND created_at::date<v_to),
      'quotes',(SELECT jsonb_build_object('count',sum(n),'value',sum(v),
          'by_status',coalesce(jsonb_object_agg(status,n),'{}'))
        FROM (SELECT status,count(*) n,sum(total) v FROM public.sales_quotes
              WHERE organization_id=_org AND issue_date>=v_from AND issue_date<v_to GROUP BY status) t),
      'orders',(SELECT jsonb_build_object('count',count(*),'value',sum(total_amount) FILTER (WHERE status<>'CANCELED'))
        FROM public.sales_orders WHERE organization_id=_org AND order_date>=v_from AND order_date<v_to),
      'representatives',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'name',r.name,
          'opportunities',coalesce(o.cnt,0),'quotes',coalesce(q.cnt,0),'orders',coalesce(od.cnt,0),
          'realized',coalesce(od.value,0)) ORDER BY r.name)
        FROM public.sales_representatives r
        LEFT JOIN (SELECT representative_id,count(*) cnt FROM public.sales_opportunities
                   WHERE organization_id=_org AND created_at::date>=v_from AND created_at::date<v_to GROUP BY 1) o ON o.representative_id=r.id
        LEFT JOIN (SELECT representative_id,count(*) cnt FROM public.sales_quotes
                   WHERE organization_id=_org AND issue_date>=v_from AND issue_date<v_to GROUP BY 1) q ON q.representative_id=r.id
        LEFT JOIN (SELECT b.representative_id,count(DISTINCT b.source_id) cnt,sum(b.billable_amount) value
                   FROM public.bi_facts b WHERE b.organization_id=_org AND b.fact_nature='RECONCILED_SALE'
                     AND b.status='RECONCILED' AND b.fact_date>=v_from AND b.fact_date<v_to GROUP BY 1) od ON od.representative_id=r.id
        WHERE r.organization_id=_org AND r.status='ACTIVE'),'[]'::jsonb),
      'activities',(SELECT count(*) FROM public.crm_activities
        WHERE organization_id=_org AND scheduled_at::date>=v_from AND scheduled_at::date<v_to),
      'by_stage',coalesce((SELECT jsonb_agg(jsonb_build_object('stage',s.name,'count',count(*),
          'value',sum(o.estimated_value)) ORDER BY s.position)
        FROM public.sales_opportunities o JOIN public.sales_pipeline_stages s ON s.id=o.stage_id AND s.organization_id=o.organization_id
        WHERE o.organization_id=_org AND o.created_at::date>=v_from AND o.created_at::date<v_to
        GROUP BY s.name,s.position),'[]'::jsonb));

  ELSIF _kind='fiscal' THEN
    PERFORM public.bi_require(_org,'bi.fiscal');
    RETURN jsonb_build_object(
      'documents',(SELECT coalesce(jsonb_object_agg(status,n),'{}') FROM (
        SELECT status,count(*) n FROM public.fiscal_documents
        WHERE organization_id=_org AND issue_date>=v_from AND issue_date<v_to GROUP BY status) t),
      'authorized',(SELECT count(*) FROM public.fiscal_documents
        WHERE organization_id=_org AND issue_date>=v_from AND issue_date<v_to
          AND status='AUTHORIZED' AND authorization_protocol IS NOT NULL),
      'rejected',(SELECT count(*) FROM public.fiscal_documents
        WHERE organization_id=_org AND issue_date>=v_from AND issue_date<v_to AND status IN ('DENIED','CANCELED')),
      'inbound',(SELECT count(*) FROM public.inbound_fiscal_documents
        WHERE organization_id=_org AND issue_date>=v_from AND issue_date<v_to),
      'pending',(SELECT count(*) FROM public.fiscal_exceptions
        WHERE organization_id=_org AND status<>'RESOLVED'));

  ELSIF _kind='procurement' THEN
    PERFORM public.bi_require(_org,'bi.procurement');
    RETURN jsonb_build_object(
      'orders',(SELECT jsonb_build_object('count',count(*),'value',sum(total_amount) FILTER (WHERE status<>'CANCELED'))
        FROM public.purchase_orders WHERE organization_id=_org AND issue_date>=v_from AND issue_date<v_to),
      'receipts',(SELECT jsonb_build_object('count',count(*),'accepted',sum(total_accepted),
          'rejected',sum(total_received-total_accepted)) FROM public.goods_receipts
        WHERE organization_id=_org AND received_at>=v_from AND received_at<v_to),
      'open',(SELECT count(*) FROM public.purchase_orders
        WHERE organization_id=_org AND status IN ('APPROVED','SENT','RECEIVING') AND issue_date<v_to),
      'late',coalesce((SELECT jsonb_agg(jsonb_build_object('order_id',o.id,'supplier',c.legal_name,
          'days_late',(v_to-1)-o.expected_delivery_date) ORDER BY o.expected_delivery_date)
        FROM public.purchase_orders o
        JOIN public.supplier_profiles sp ON sp.id=o.supplier_id AND sp.organization_id=o.organization_id
        JOIN public.companies c ON c.id=sp.company_id
        WHERE o.organization_id=_org AND o.status IN ('APPROVED','SENT','RECEIVING')
          AND o.expected_delivery_date IS NOT NULL AND o.expected_delivery_date<(v_to-1)),'[]'::jsonb),
      'suppliers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'name',c.legal_name,
          'orders',o.cnt,'value',o.value,'rejected',coalesce(g.rejected,0)) ORDER BY o.value DESC)
        FROM public.purchase_orders o
        JOIN public.supplier_profiles sp ON sp.id=o.supplier_id AND sp.organization_id=o.organization_id
        JOIN public.companies c ON c.id=sp.company_id
        LEFT JOIN (SELECT supplier_id,count(*) cnt,sum(total_amount) value FROM public.purchase_orders
                   WHERE organization_id=_org AND issue_date>=v_from AND issue_date<v_to
                     AND status<>'CANCELED' GROUP BY 1) o ON o.supplier_id=c.id
        LEFT JOIN (SELECT sp2.id supplier,sum(gr.total_received-gr.total_accepted) rejected
                   FROM public.goods_receipts gr JOIN public.supplier_profiles sp2 ON sp2.id=gr.supplier_id
                   WHERE gr.organization_id=_org AND gr.received_at>=v_from AND gr.received_at<v_to GROUP BY 1) g
          ON g.supplier=c.id
        WHERE c.organization_id=_org AND o.cnt IS NOT NULL),'[]'::jsonb));

  ELSIF _kind='production' THEN
    PERFORM public.bi_require(_org,'bi.production');
    RETURN jsonb_build_object(
      'orders',(SELECT jsonb_build_object('open',count(*) FILTER (WHERE status NOT IN ('COMPLETED','CLOSED','CANCELED')),
          'completed',count(*) FILTER (WHERE status IN ('COMPLETED','CLOSED')),
          'planned',sum(planned_quantity),'produced',sum(produced_quantity),'rejected',sum(rejected_quantity))
        FROM public.production_orders
        WHERE organization_id=_org AND created_at::date>=v_from AND created_at::date<v_to),
      'consumption',(SELECT jsonb_build_object('quantity',sum(quantity)) FROM public.production_consumptions
        WHERE organization_id=_org AND occurred_at::date>=v_from AND occurred_at::date<v_to),
      'losses',(SELECT jsonb_build_object('quantity',sum(quantity),'by_reason',coalesce(jsonb_object_agg(r.reason,n),'{}')) FROM (
        SELECT coalesce(lr.name,'Não classificada') reason,sum(l.quantity) n
        FROM public.production_losses l LEFT JOIN public.production_loss_reasons lr ON lr.id=l.loss_reason_id
        WHERE l.organization_id=_org AND l.occurred_at::date>=v_from AND l.occurred_at::date<v_to
        GROUP BY 1) t),
      'cost_variation',coalesce((SELECT jsonb_agg(jsonb_build_object('order',o.code,
          'standard',(o.extra->>'standard_cost')::numeric,'actual',NULL,
          'cost_missing',o.quality='INCOMPLETE') ORDER BY o.code)
        FROM public.bi_facts o WHERE o.organization_id=_org AND o.domain='PRODUCTION'
          AND o.fact_nature='PRODUCTION_ORDER' AND o.fact_date>=v_from AND o.fact_date<v_to),'[]'::jsonb));

  ELSE
    RAISE EXCEPTION 'Consulta analítica desconhecida: %',_kind;
  END IF;
  RETURN result;
END $$;

-- ---------------------------------------------------------------------
-- 4. EXPORTAÇÃO (§56)
--
-- CSV e XLSX (SpreadsheetML, que o Excel e o LibreOffice abrem sem
-- biblioteca externa). A exportação roda a MESMA consulta autorizada:
-- um usuário sem `bi.financial` exporta vendas, não financeiro.
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_export(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_format text DEFAULT 'CSV')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE raw jsonb; rows jsonb; headers text; line text; out text; i integer; r jsonb;
BEGIN
  PERFORM public.bi_require(_org,'bi.exports');
  IF _format NOT IN ('CSV','XLSX') THEN RAISE EXCEPTION 'Formato inválido: %',_format; END IF;
  raw := public.bi_query(_org,_kind,_filters);
  rows := CASE WHEN jsonb_typeof(raw)='array' THEN raw
               WHEN raw ? 'records' THEN raw->'records' ELSE '[]'::jsonb END;
  IF jsonb_array_length(rows)=0 THEN RAISE EXCEPTION 'Nada a exportar para o filtro informado.'; END IF;
  SELECT string_agg(k,',') INTO headers FROM (SELECT string_agg(e.key,',' ORDER BY e.key) k
    FROM jsonb_object_keys(rows->0) e) s;
  out := '';
  IF _format='CSV' THEN
    out := headers||E'\n';
    FOR r IN SELECT * FROM jsonb_array_elements(rows) LOOP
      line := '';
      FOR i IN 1..array_length(string_to_array(headers,','),1) LOOP
        line := line||CASE WHEN i>1 THEN ';' ELSE '' END||
          coalesce(replace(replace(r->>split_part(headers,',',i),';',','),E'\n',' '),'');
      END LOOP;
      out := out||line||E'\n';
    END LOOP;
  ELSE
    out := '<?xml version="1.0"?>'||E'\n'||
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" '||
      'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">'||E'\n'||'<Worksheet ss:Name="BI"><Table>'||E'\n';
    FOR r IN SELECT * FROM jsonb_array_elements(rows) LOOP
      out := out||'<Row>';
      FOR i IN 1..array_length(string_to_array(headers,','),1) LOOP
        out := out||'<Cell><Data ss:Type="String">'||
          xmlelement(name x, value coalesce(r->>split_part(headers,',',i),''))::text||'</Data></Cell>';
      END LOOP;
      out := out||'</Row>'||E'\n';
    END LOOP;
    out := out||'</Table></Worksheet></Workbook>';
  END IF;
  -- Exportação sensível fica auditada com período, métrica e volume (§65).
  PERFORM public.bi_audit(_org,'bi.export','bi_query',_kind,
    jsonb_build_object('format',_format,'filters',_filters,'rows',jsonb_array_length(rows)));
  RETURN jsonb_build_object('format',_format,'filename','bi-'||_kind||'-'||current_date||'.'||lower(_format),
    'content',out,'rows',jsonb_array_length(rows));
END $$;

-- ---------------------------------------------------------------------
-- 5. CONFIGURAÇÃO: métricas, metas, dashboards, preferências
-- ---------------------------------------------------------------------
CREATE FUNCTION public.bi_save_metric(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE id uuid;
BEGIN
  PERFORM public.bi_require(_org,'bi.metrics.manage');
  IF nullif(trim(_data->>'metric_key'),'') IS NULL OR nullif(trim(_data->>'formula'),'') IS NULL THEN
    RAISE EXCEPTION 'Chave e fórmula da métrica são obrigatórias.';
  END IF;
  INSERT INTO public.bi_metric_definitions(organization_id,metric_key,metric_name,description,business_domain,
    formula,unit,aggregation_method,date_dimension,source_description,available_filters,compatible_dimensions,
    periodicity,granularity,limitations,status,created_by)
  VALUES (_org,_data->>'metric_key',_data->>'metric_name',coalesce(_data->>'description',''),
    (_data->>'business_domain')::public.bi_domain,_data->>'formula',
    coalesce(_data->>'unit','COUNT'),coalesce(_data->>'aggregation_method','SUM'),
    coalesce(_data->>'date_dimension','fact_date'),coalesce(_data->>'source_description','A definir'),
    coalesce((SELECT array_agg(jsonb_array_elements_text(_data->'available_filters')),'{}'::text[]),
    coalesce((SELECT array_agg(jsonb_array_elements_text(_data->'compatible_dimensions')),'{}'::text[]),
    coalesce(_data->>'periodicity','DAILY'),coalesce(_data->>'granularity','DAY'),
    coalesce(_data->>'limitations',''),coalesce(_data->>'status','ACTIVE'),auth.uid())
  ON CONFLICT (organization_id,metric_key,version) DO UPDATE SET
    metric_name=EXCLUDED.metric_name,description=EXCLUDED.description,formula=EXCLUDED.formula,
    unit=EXCLUDED.unit,available_filters=EXCLUDED.available_filters,
    compatible_dimensions=EXCLUDED.compatible_dimensions,limitations=EXCLUDED.limitations,
    status=EXCLUDED.status,updated_at=now(),updated_by=auth.uid()
  RETURNING id INTO id;
  PERFORM public.bi_audit(_org,'bi.metric.save','bi_metric_definitions',id,
    jsonb_build_object('metric_key',_data->>'metric_key','formula',_data->>'formula'));
  RETURN jsonb_build_object('id',id);
END $$;

CREATE FUNCTION public.bi_save_target(_org uuid,_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE id uuid; v_def record;
BEGIN
  PERFORM public.bi_require(_org,'bi.targets.manage');
  -- Meta sem métrica oficial não é meta: é um número solto (§53).
  SELECT * INTO v_def FROM public.bi_resolve_metric(_org,_data->>'metric_key');
  IF v_def IS NULL THEN RAISE EXCEPTION 'Métrica inexistente: %',_data->>'metric_key'; END IF;
  INSERT INTO public.bi_targets(organization_id,metric_key,dimension,dimension_value,period,period_start,
    period_end,target_value,unit,status,note,created_by)
  VALUES (_org,_data->>'metric_key',coalesce(_data->>'dimension','ORGANIZATION'),_data->>'dimension_value',
    _data->>'period',(_data->>'period_start')::date,(_data->>'period_end')::date,
    (_data->>'target_value')::numeric,coalesce(_data->>'unit',v_def.unit),
    coalesce(_data->>'status','ACTIVE'),coalesce(_data->>'note',''),auth.uid())
  ON CONFLICT (organization_id,metric_key,dimension,dimension_value,period,version) DO UPDATE SET
    target_value=EXCLUDED.target_value,status=EXCLUDED.status,note=EXCLUDED.note,updated_at=now()
  RETURNING id INTO id;
  PERFORM public.bi_audit(_org,'bi.target.save','bi_targets',id,
    jsonb_build_object('metric_key',_data->>'metric_key','value',_data->>'target_value'));
  RETURN jsonb_build_object('id',id);
END $$;

CREATE FUNCTION public.bi_save_dashboard(_org uuid,_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE id uuid; w record;
BEGIN
  PERFORM public.bi_require(_org,'bi.dashboards.manage');
  INSERT INTO public.bi_dashboards(organization_id,name,description,visibility,is_default,default_filters,owner_id,created_by)
  VALUES (_org,_data->>'name',coalesce(_data->>'description',''),
    coalesce(_data->>'visibility','PRIVATE'),coalesce((_data->>'is_default')::boolean,false),
    coalesce(_data->'default_filters','{}'::jsonb),coalesce(_data->>'owner_id',auth.uid())::uuid,auth.uid())
  ON CONFLICT (organization_id,name) DO UPDATE SET
    description=EXCLUDED.description,visibility=EXCLUDED.visibility,default_filters=EXCLUDED.default_filters,
    is_default=EXCLUDED.is_default,updated_at=now()
  RETURNING id INTO id;
  IF coalesce((_data->>'is_default')::boolean,false) THEN
    UPDATE public.bi_dashboards SET is_default=false WHERE organization_id=_org AND id<>id;
  END IF;
  -- Componente só é aceito se a métrica existe: um painel não pode
  -- exibir indicador inexistente nem redefinir fórmula (§5).
  FOR w IN SELECT * FROM jsonb_array_elements(coalesce(_data->'widgets','[]'::jsonb)) LOOP
    IF NOT EXISTS(SELECT 1 FROM public.bi_resolve_metric(_org,w->>'metric_key')) THEN
      RAISE EXCEPTION 'Métrica inexistente no componente: %',w->>'metric_key';
    END IF;
  END LOOP;
  DELETE FROM public.bi_dashboard_widgets WHERE organization_id=_org AND dashboard_id=id;
  INSERT INTO public.bi_dashboard_widgets(organization_id,dashboard_id,widget_key,metric_key,domain,title,
    position,width,chart,dimension,filters)
  SELECT _org,id,w->>'widget_key',w->>'metric_key',coalesce(w->>'title',w->>'metric_key'),
    coalesce((w->>'position')::int,0),coalesce(w->>'width','FULL'),coalesce(w->>'chart','KPI'),
    w->>'dimension',coalesce(w->'filters','{}'::jsonb)
  FROM jsonb_array_elements(coalesce(_data->'widgets','[]'::jsonb)) w;
  PERFORM public.bi_audit(_org,'bi.dashboard.save','bi_dashboards',id,
    jsonb_build_object('name',_data->>'name','visibility',_data->>'visibility'));
  RETURN jsonb_build_object('id',id);
END $$;

CREATE FUNCTION public.bi_save_settings(_org uuid,_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  PERFORM public.bi_require(_org,'bi.dashboards.manage');
  IF (_data ? 'abc_a_limit' OR _data ? 'abc_b_limit') THEN
    IF coalesce((_data->>'abc_a_limit')::numeric,0)>=coalesce((_data->>'abc_b_limit')::numeric,1)
       AND (_data ? 'abc_b_limit') THEN
      RAISE EXCEPTION 'O limite B deve ser maior que o limite A.';
    END IF;
  END IF;
  INSERT INTO public.bi_settings(organization_id,timezone,period_end_exclusive,default_period,abc_a_limit,
    abc_b_limit,xyz_x_limit,xyz_y_limit,xyz_min_observations,updated_by)
  VALUES (_org,coalesce(_data->>'timezone','America/Sao_Paulo'),
    coalesce((_data->>'period_end_exclusive')::boolean,true),
    coalesce(_data->>'default_period','LAST_30_DAYS'),
    coalesce((_data->>'abc_a_limit')::numeric,.80),coalesce((_data->>'abc_b_limit')::numeric,.95),
    coalesce((_data->>'xyz_x_limit')::numeric,.50),coalesce((_data->>'xyz_y_limit')::numeric,2.00),
    coalesce((_data->>'xyz_min_observations')::int,3),auth.uid())
  ON CONFLICT (organization_id) DO UPDATE SET
    timezone=EXCLUDED.timezone,period_end_exclusive=EXCLUDED.period_end_exclusive,
    default_period=EXCLUDED.default_period,abc_a_limit=EXCLUDED.abc_a_limit,abc_b_limit=EXCLUDED.abc_b_limit,
    xyz_x_limit=EXCLUDED.xyz_x_limit,xyz_y_limit=EXCLUDED.xyz_y_limit,
    xyz_min_observations=EXCLUDED.xyz_min_observations,updated_at=now(),updated_by=auth.uid();
  PERFORM public.bi_audit(_org,'bi.settings.save','bi_settings',_org::text,
    jsonb_build_object('abc',jsonb_build_array(_data->>'abc_a_limit',_data->>'abc_b_limit'),
      'xyz',jsonb_build_array(_data->>'xyz_x_limit',_data->>'xyz_y_limit',_data->>'xyz_min_observations')));
  RETURN public.bi_get_settings(_org);
END $$;

-- Personalização: período, unidades, canais, favoritos e ordem. NÃO toca
-- em fórmula nem em permissão (§16).
CREATE FUNCTION public.bi_save_preferences(_org uuid,_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE id uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sem permissão: bi.read'; END IF;
  IF NOT public.has_permission(_org,'bi.read') THEN RAISE EXCEPTION 'Sem permissão: bi.read'; END IF;
  INSERT INTO public.bi_user_preferences(organization_id,user_id,default_period,default_location_ids,
    default_channels,favorite_metric_keys,widget_order)
  VALUES (_org,auth.uid(),_data->>'default_period',
    coalesce((SELECT array_agg(x::uuid) FROM jsonb_array_elements_text(coalesce(_data->'default_location_ids','[]')) x),'{}'::uuid[]),
    coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(_data->'default_channels','[]')) x),'{}'::text[]),
    coalesce((SELECT array_agg(x) FROM jsonb_array_elements_text(coalesce(_data->>'favorite_metric_keys','[]')) x),'{}'::text[]),
    coalesce(_data->'widget_order','{}'::jsonb))
  ON CONFLICT (organization_id,user_id) DO UPDATE SET
    default_period=EXCLUDED.default_period,default_location_ids=EXCLUDED.default_location_ids,
    default_channels=EXCLUDED.default_channels,favorite_metric_keys=EXCLUDED.favorite_metric_keys,
    widget_order=EXCLUDED.widget_order,updated_at=now()
  RETURNING id INTO id;
  RETURN jsonb_build_object('id',id);
END $$;

-- Dashboards visíveis ao usuário, com componentes validados.
CREATE FUNCTION public.bi_dashboards(_org uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.bi_require(_org,'bi.read');
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'name',d.name,'description',d.description,
    'visibility',d.visibility,'is_default',d.is_default,'filters',d.default_filters,
    'owner_id',d.owner_id,'widgets',coalesce((SELECT jsonb_agg(jsonb_build_object('key',w.widget_key,
      'metric_key',w.metric_key,'title',w.title,'domain',w.domain,'position',w.position,'width',w.width,
      'chart',w.chart,'dimension',w.dimension) ORDER BY w.position) FROM public.bi_dashboard_widgets w
      WHERE w.dashboard_id=d.id),'[]'::jsonb)) ORDER BY d.is_default DESC,d.name),'[]'::jsonb)
  INTO result FROM public.bi_dashboards d
  WHERE d.organization_id=_org AND (d.visibility='ORGANIZATION' OR d.owner_id=auth.uid()
    OR public.has_permission(_org,'bi.dashboards.manage'));
  RETURN result;
END $$;

-- ---------------------------------------------------------------------
-- 6. PERMISSÕES
--
-- `bi.costs` é separada de `bi.sales` de propósito: quem vê venda não
-- vê custo industrial nem margem. `bi.financial` também é separada: a
-- carteira de recebíveis não acompanha o relatório comercial.
-- ---------------------------------------------------------------------
INSERT INTO public.bi_channel_rules(organization_id,fact_nature,store_ownership_type,partner_bound,channel,description,priority)
VALUES
 (NULL,'RECONCILED_SALE','PARTNER',true,'PARTNER','Venda em loja de parceiro: receita da fábrica é o valor faturável.',10),
 (NULL,'RECONCILED_SALE',NULL,false,'OWN_MARKETPLACE','Venda em loja própria: o valor faturável é da fábrica.',20),
 (NULL,'IMPORTED_SALE','PARTNER',true,'PARTNER','Venda importada de loja de parceiro, ainda não reconciliada.',10),
 (NULL,'IMPORTED_SALE',NULL,false,'OWN_MARKETPLACE','Venda importada de loja própria.',20),
 (NULL,'SALES_ORDER',NULL,false,'B2B','Pedido comercial para cliente direto.',10),
 (NULL,'SHIPMENT',NULL,false,'B2B','Mercadoria expedida de pedido para cliente direto.',10),
 (NULL,'PARTNER_SHIPMENT',NULL,false,'PARTNER','Remessa para estoque de parceiro: não é venda.',10);

INSERT INTO public.role_permissions(role,permission)
SELECT r,p FROM unnest(ARRAY['admin','gestor']::public.app_role[]) r CROSS JOIN unnest(ARRAY[
  'bi.read','bi.executive','bi.sales','bi.partners','bi.inventory','bi.production','bi.procurement',
  'bi.financial','bi.crm','bi.fiscal','bi.costs','bi.targets.manage','bi.dashboards.manage',
  'bi.exports','bi.reprocess','bi.metrics.manage']) p ON CONFLICT DO NOTHING;

-- Financeiro vê resultado financeiro; não necessariamente o custo industrial
-- nem a operação de fábrica.
INSERT INTO public.role_permissions(role,permission)
SELECT 'financeiro',p FROM unnest(ARRAY[
  'bi.read','bi.executive','bi.sales','bi.financial','bi.fiscal','bi.exports']) p ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role,permission)
SELECT 'comercial',p FROM unnest(ARRAY['bi.read','bi.sales','bi.crm','bi.exports']) p ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role,permission)
SELECT 'marketplace',p FROM unnest(ARRAY['bi.read','bi.sales','bi.partners','bi.exports']) p ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role,permission)
SELECT 'estoque',p FROM unnest(ARRAY['bi.read','bi.inventory','bi.production','bi.exports']) p ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role,permission)
SELECT 'producao',p FROM unnest(ARRAY['bi.read','bi.production','bi.inventory']) p ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions(role,permission)
SELECT 'fiscal',p FROM unnest(ARRAY['bi.read','bi.fiscal']) p ON CONFLICT DO NOTHING;

-- A falsa simetria seria dar `bi.costs` ao comercial para "ver margem".
-- Margem e custo ficam com quem responde por custo e por financeiro.
COMMIT;
