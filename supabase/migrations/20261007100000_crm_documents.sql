BEGIN;
CREATE TABLE public.crm_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),organization_id uuid NOT NULL REFERENCES public.organizations,
 company_id uuid NOT NULL, name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 200),
 mime_type text NOT NULL CHECK(mime_type IN ('application/pdf','image/jpeg','image/png')),
 size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
 storage_path text NOT NULL UNIQUE, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','READY')),
 purpose text NOT NULL CHECK(length(trim(purpose))>0),
 created_by uuid NOT NULL REFERENCES public.profiles,created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,company_id) REFERENCES public.companies(organization_id,id)
);
CREATE INDEX crm_document_company ON public.crm_documents(organization_id,company_id,created_at DESC);
ALTER TABLE public.crm_documents ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON public.crm_documents TO authenticated;
CREATE POLICY crm_document_read ON public.crm_documents FOR SELECT TO authenticated
 USING(public.has_permission(organization_id,'customers.read') AND public.crm_company_access(organization_id,company_id));
CREATE TRIGGER crm_document_integrity BEFORE INSERT OR UPDATE OR DELETE ON public.crm_documents FOR EACH ROW EXECUTE FUNCTION public.crm_guard();
INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('crm-documents','crm-documents',false,10485760,ARRAY['application/pdf','image/jpeg','image/png'])
 ON CONFLICT(id) DO NOTHING;
CREATE FUNCTION public.crm_document_access(_path text,_write boolean DEFAULT false) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM crm_documents d WHERE storage_path=_path
 AND public.crm_company_access(organization_id,company_id)
 AND public.has_permission(organization_id,CASE WHEN _write THEN 'customers.update' ELSE 'customers.read' END)
 AND CASE WHEN _write THEN created_by=auth.uid() AND status='PENDING' ELSE status='READY' END);
$$;
CREATE POLICY crm_storage_read ON storage.objects FOR SELECT TO authenticated
 USING(bucket_id='crm-documents' AND public.crm_document_access(name,false));
CREATE POLICY crm_storage_insert ON storage.objects FOR INSERT TO authenticated
 WITH CHECK(bucket_id='crm-documents' AND public.crm_document_access(name,true));
CREATE FUNCTION public.crm_document(_org uuid,_action text,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE doc public.crm_documents; ident uuid; company uuid:=nullif(_data->>'company_id','')::uuid; meta jsonb;
BEGIN
 PERFORM public.crm_require(_org,CASE WHEN _action='download' THEN 'customers.read' ELSE 'customers.update' END);
 IF _action='prepare' THEN
  IF company IS NULL OR NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Cliente não autorizado.'; END IF;
  ident:=(_data->>'key')::uuid;
  PERFORM public.inventory_lock(_org);
  SELECT * INTO doc FROM crm_documents WHERE id=ident;
  IF FOUND THEN
   IF doc.organization_id<>_org OR doc.company_id<>company OR doc.created_by<>auth.uid() OR doc.name<>_data->>'name' OR doc.size_bytes<>(_data->>'size_bytes')::int OR doc.mime_type<>_data->>'mime_type' THEN RAISE EXCEPTION 'Chave de documento já utilizada.'; END IF;
   RETURN to_jsonb(doc);
  END IF;
  INSERT INTO crm_documents(id,organization_id,company_id,name,mime_type,size_bytes,purpose,storage_path,created_by)
   VALUES(ident,_org,company,_data->>'name',_data->>'mime_type',(_data->>'size_bytes')::int,_data->>'purpose',_org||'/'||company||'/'||ident,auth.uid()) RETURNING * INTO doc;
 ELSIF _action IN ('complete','download') THEN
  SELECT * INTO doc FROM crm_documents WHERE id=(_data->>'id')::uuid AND organization_id=_org FOR UPDATE;
  IF NOT FOUND OR NOT public.crm_company_access(_org,doc.company_id) THEN RAISE EXCEPTION 'Documento não autorizado.'; END IF;
  IF _action='complete' THEN
   IF doc.created_by<>auth.uid() THEN RAISE EXCEPTION 'Somente autor pode concluir upload.'; END IF;
   SELECT to_jsonb(o)->'metadata' INTO meta FROM storage.objects o WHERE bucket_id='crm-documents' AND name=doc.storage_path;
   IF meta IS NULL OR (meta->>'size')::bigint IS DISTINCT FROM doc.size_bytes OR meta->>'mimetype' IS DISTINCT FROM doc.mime_type THEN RAISE EXCEPTION 'Arquivo ausente ou metadados divergentes.'; END IF;
   UPDATE crm_documents SET status='READY' WHERE id=doc.id RETURNING * INTO doc;
  ELSIF doc.status<>'READY' THEN RAISE EXCEPTION 'Upload não concluído.'; END IF;
 ELSE RAISE EXCEPTION 'Ação de documento inválida.'; END IF;
 PERFORM public.crm_audit(_org,'document.'||_action,doc.id,jsonb_build_object('company_id',doc.company_id,'name',doc.name,'size',doc.size_bytes));
 RETURN to_jsonb(doc);
END $$;
REVOKE ALL ON FUNCTION public.crm_document(uuid,text,jsonb),public.crm_document_access(text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_document(uuid,text,jsonb),public.crm_document_access(text,boolean) TO authenticated;
CREATE OR REPLACE FUNCTION public.crm_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}',_page integer DEFAULT 1,_export boolean DEFAULT false) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tab text; perm text; scope text; result jsonb; cnt integer; offst integer:=greatest(0,_page-1)*50; company uuid:=nullif(_filters->>'company_id','')::uuid; ident uuid:=nullif(_filters->>'id','')::uuid; p jsonb; cost numeric; sumcost numeric; quote public.sales_quotes;
BEGIN
 PERFORM public.crm_require(_org,'crm.read');
 IF _export THEN PERFORM public.crm_require(_org,'crm.export'); END IF;
 IF _page<1 OR _page>100000 THEN RAISE EXCEPTION 'Página inválida.'; END IF;

 IF _kind='approvers' THEN
  PERFORM public.crm_require(_org,'quotes.read');
  SELECT * INTO quote FROM sales_quotes WHERE organization_id=_org AND id=ident;
  IF NOT FOUND OR NOT public.crm_company_access(_org,quote.company_id) THEN RAISE EXCEPTION 'Proposta não autorizada.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.user_id,'name',coalesce(p.full_name,p.email))),'[]') INTO result
  FROM commercial_discount_authorities a JOIN profiles p ON p.id=a.user_id
  WHERE a.organization_id=_org AND a.max_discount_percent>=quote.discount_percent AND public.has_permission(_org,'quotes.approve',a.user_id);
  RETURN jsonb_build_object('rows',result);
 END IF;
 IF _kind='documents' THEN
  PERFORM public.crm_require(_org,'customers.read');
  IF company IS NULL OR NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Cliente não autorizado.'; END IF;
  SELECT count(*) INTO cnt FROM crm_documents WHERE organization_id=_org AND company_id=company AND status='READY';
  SELECT coalesce(jsonb_agg(x),'[]') INTO result FROM(SELECT d.* FROM crm_documents d WHERE organization_id=_org AND company_id=company AND status='READY' ORDER BY created_at DESC LIMIT 50 OFFSET offst)x;
  RETURN jsonb_build_object('rows',result,'total',cnt);
 ELSIF _kind='timeline' THEN
  PERFORM public.crm_require(_org,'customers.read');
  IF company IS NULL OR NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Cliente não autorizado.'; END IF;
  WITH facts AS(
   SELECT id,created_at,'CONTACT' kind,name title,('/comercial/clientes/'||company) href FROM company_contacts WHERE organization_id=_org AND company_id=company
   UNION ALL SELECT id,coalesce(converted_at,created_at),'LEAD',name,'/comercial/leads' FROM leads WHERE organization_id=_org AND company_id=company AND public.has_permission(_org,'leads.read') AND public.crm_visible(_org,'leads',to_jsonb(leads))
   UNION ALL SELECT id,created_at,'OPPORTUNITY',title,'/comercial/oportunidades/'||id FROM sales_opportunities WHERE organization_id=_org AND company_id=company AND public.has_permission(_org,'opportunities.read')
   UNION ALL SELECT id,created_at,'QUOTE','Proposta '||quote_number||' / v'||version,'/comercial/propostas/'||id FROM sales_quotes WHERE organization_id=_org AND company_id=company AND public.has_permission(_org,'quotes.read')
   UNION ALL SELECT id,created_at,'ACTIVITY',subject,'/comercial/atividades' FROM crm_activities WHERE organization_id=_org AND company_id=company AND public.has_permission(_org,'activities.read') AND public.crm_visible(_org,'crm_activities',to_jsonb(crm_activities))
   UNION ALL SELECT id,created_at,'RECEIVABLE',document_number,'/financeiro/receber/'||id FROM account_receivables WHERE organization_id=_org AND company_id=company AND public.has_permission(_org,'receivables.read') AND public.has_permission(_org,'commercial_sensitive.read')
   UNION ALL SELECT s.id,s.created_at,'RECEIPT','Recebimento','/financeiro/receber/'||s.receivable_id FROM receivable_settlements s JOIN account_receivables r ON r.id=s.receivable_id WHERE s.organization_id=_org AND r.company_id=company AND public.has_permission(_org,'receivables.read') AND public.has_permission(_org,'commercial_sensitive.read')
  ), counted AS(SELECT *,count(*)OVER() total FROM facts)
  SELECT coalesce(jsonb_agg(x),'[]'),coalesce(max(x.total),0) INTO result,cnt FROM(SELECT * FROM counted ORDER BY created_at DESC,id LIMIT 50 OFFSET offst)x;
  RETURN jsonb_build_object('rows',result,'total',cnt);
 ELSIF _kind='availability' THEN
  PERFORM public.crm_require(_org,'planning.read');PERFORM public.crm_require(_org,'inventory.read');
  SELECT coalesce(jsonb_agg(x),'[]') INTO result FROM(
   SELECT p.id,p.bucket_date,p.scheduled_receipts,p.planned_receipts,p.projected_quantity,p.projected_without_plans,r.id run_id,r.completed_at
   FROM planning_projections p JOIN planning_runs r ON r.id=p.planning_run_id
   WHERE p.organization_id=_org AND p.variant_id=ident AND p.planning_run_id=(SELECT id FROM planning_runs WHERE organization_id=_org AND status IN ('COMPLETED','COMPLETED_WITH_WARNINGS') AND NOT simulated ORDER BY completed_at DESC LIMIT 1)
   AND p.bucket_date>=current_date ORDER BY p.bucket_date LIMIT 50 OFFSET offst)x;
  RETURN jsonb_build_object('rows',result,'promise_of_delivery',false,'historical_snapshot',true);
 END IF;

 IF _kind='members' THEN
  -- Lista de nomes da própria organização, usada por responsáveis, alçadas e
  -- gestores. Não exige `users.read` (permissão de administration de usuários):
  -- exibir o nome de um colega da mesma organização não é administrar usuários,
  -- e exigir a permissão de usuários esconderia o responsável de um lead.
  PERFORM public.crm_require(_org,'crm.read');
  IF NOT public.is_org_member(_org) THEN RAISE EXCEPTION 'Organização não autorizada.'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.full_name,p.email,m.user_id::text))),'[]') INTO result
  FROM organization_members m LEFT JOIN profiles p ON p.id=m.user_id
  WHERE m.organization_id=_org AND m.is_active
   AND (nullif(_filters->>'q','') IS NULL OR coalesce(p.full_name,p.email,'') ILIKE '%'||(_filters->>'q')||'%');
  RETURN jsonb_build_object('rows',result,'total',jsonb_array_length(result));
 ELSIF _kind='finance' THEN
  PERFORM public.crm_require(_org,'commercial_sensitive.read');PERFORM public.crm_require(_org,'receivables.read');
  IF company IS NULL OR NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Empresa não autorizada.'; END IF;
  RETURN public.crm_financial_position(_org,company);
 ELSIF _kind='margin' THEN
  PERFORM public.crm_require(_org,'commercial_sensitive.read');PERFORM public.crm_require(_org,'costs.read');
  SELECT * INTO quote FROM sales_quotes WHERE id=ident AND organization_id=_org;
  IF NOT FOUND OR NOT public.crm_company_access(_org,quote.company_id) THEN RAISE EXCEPTION 'Proposta não autorizada.'; END IF;
  SELECT sum(i.quantity*c.total_unit_cost),count(*) FILTER(WHERE c.id IS NULL) INTO sumcost,cnt FROM sales_quote_items i LEFT JOIN LATERAL(
   SELECT id,total_unit_cost FROM product_cost_versions WHERE organization_id=_org AND variant_id=i.variant_id AND status IN ('ACTIVE','SUPERSEDED') AND effective_from<=quote.issue_date AND (effective_to IS NULL OR effective_to>quote.issue_date) ORDER BY effective_from DESC LIMIT 1)c ON true WHERE i.quote_id=ident;
  RETURN jsonb_build_object('status',CASE WHEN cnt>0 THEN 'INCOMPLETE' ELSE 'ESTIMATE' END,'cost',CASE WHEN cnt=0 THEN sumcost END,'gross_margin',CASE WHEN cnt=0 THEN quote.subtotal-quote.discount_amount-sumcost END,'historical_cogs',false);
 ELSIF _kind='stock' THEN
  PERFORM public.crm_require(_org,'inventory.read');
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'type',l.type,'on_hand',public.inventory_get_balance(_org,ident,l.id,NULL))),'[]') INTO result FROM inventory_locations l WHERE organization_id=_org AND status='ACTIVE';
  RETURN jsonb_build_object('rows',result,'reserved','NOT_IMPLEMENTED','promise_of_delivery',false);
 ELSIF _kind='commission' THEN
  PERFORM public.crm_require(_org,'commercial_sensitive.read');
  SELECT * INTO quote FROM sales_quotes WHERE id=ident AND organization_id=_org;
  IF NOT FOUND OR NOT public.crm_company_access(_org,quote.company_id) THEN RAISE EXCEPTION 'Proposta não autorizada.'; END IF;
  SELECT coalesce(jsonb_agg(x),'[]') INTO result FROM (
   SELECT r.id,pl.name,pl.trigger_event,sum(CASE r.rate_type WHEN 'PERCENT' THEN i.total*(1-quote.discount_percent/100)*r.rate/100 ELSE i.quantity*r.rate END) estimated_commission
   FROM commission_rules r JOIN commission_plans pl ON pl.id=r.plan_id JOIN sales_quote_items i ON i.quote_id=quote.id AND (r.variant_id IS NULL OR r.variant_id=i.variant_id)
   WHERE r.organization_id=_org AND pl.status='ACTIVE' AND (r.company_id IS NULL OR r.company_id=quote.company_id) AND (r.representative_id IS NULL OR r.representative_id=quote.representative_id)
    AND r.effective_from<=quote.issue_date AND (r.effective_to IS NULL OR r.effective_to>=quote.issue_date) GROUP BY r.id,pl.name,pl.trigger_event)x;
  RETURN jsonb_build_object('rows',result,'method','INDEPENDENT_RULE_SCENARIOS_NOT_ADDITIVE','payable',false);
 ELSIF _kind='dashboard' THEN
  PERFORM public.crm_require(_org,'crm.dashboard');
  SELECT jsonb_build_object('leads',count(*),'qualified',count(*)FILTER(WHERE status='QUALIFIED'),'converted',count(*)FILTER(WHERE status='CONVERTED'),
   'conversion_percent',round(100.0*count(*)FILTER(WHERE status='CONVERTED')/nullif(count(*)FILTER(WHERE status<>'ARCHIVED'),0),2))
  INTO result FROM leads l WHERE organization_id=_org AND public.crm_visible(_org,'leads',to_jsonb(l))
   AND (_filters->>'from' IS NULL OR created_at>=(_filters->>'from')::date) AND (_filters->>'to' IS NULL OR created_at<(_filters->>'to')::date+1)
   AND (_filters->>'assigned_user_id' IS NULL OR assigned_user_id=(_filters->>'assigned_user_id')::uuid);
  SELECT result||jsonb_build_object('open_opportunities',count(*),'estimated_value',coalesce(sum(estimated_value),0),'weighted_estimate',coalesce(sum(estimated_value*probability/100),0)) INTO result
   FROM sales_opportunities o WHERE organization_id=_org AND status='OPEN' AND public.crm_visible(_org,'sales_opportunities',to_jsonb(o))
    AND (_filters->>'from' IS NULL OR created_at>=(_filters->>'from')::date) AND (_filters->>'to' IS NULL OR created_at<(_filters->>'to')::date+1)
    AND (_filters->>'assigned_user_id' IS NULL OR representative_id IN(SELECT id FROM sales_representatives WHERE organization_id=_org AND user_id=(_filters->>'assigned_user_id')::uuid));
  SELECT result||jsonb_build_object('sent',count(*)FILTER(WHERE sent_at IS NOT NULL),'accepted',count(*)FILTER(WHERE status='ACCEPTED'),
   'acceptance_percent',round(100.0*count(*)FILTER(WHERE status='ACCEPTED')/nullif(count(*)FILTER(WHERE status IN ('ACCEPTED','REJECTED')),0),2)) INTO result FROM sales_quotes q
   WHERE organization_id=_org AND public.crm_visible(_org,'sales_quotes',to_jsonb(q)) AND (_filters->>'from' IS NULL OR created_at>=(_filters->>'from')::date) AND (_filters->>'to' IS NULL OR created_at<(_filters->>'to')::date+1)
    AND (_filters->>'assigned_user_id' IS NULL OR representative_id IN(SELECT id FROM sales_representatives WHERE organization_id=_org AND user_id=(_filters->>'assigned_user_id')::uuid));
  SELECT result||jsonb_build_object('pending_activities',count(*),'overdue_activities',count(*)FILTER(WHERE scheduled_at<now())) INTO result FROM crm_activities a WHERE organization_id=_org AND status='PENDING' AND public.crm_visible(_org,'crm_activities',to_jsonb(a))
   AND (_filters->>'from' IS NULL OR created_at>=(_filters->>'from')::date) AND (_filters->>'to' IS NULL OR created_at<(_filters->>'to')::date+1)
   AND (_filters->>'assigned_user_id' IS NULL OR assigned_user_id=(_filters->>'assigned_user_id')::uuid);

  SELECT result||jsonb_build_object('stage_breakdown',coalesce(jsonb_agg(x),'[]')) INTO result FROM(
   SELECT s.id,s.name,count(*) count,sum(o.estimated_value) value FROM sales_opportunities o JOIN sales_pipeline_stages s ON s.id=o.stage_id
   WHERE o.organization_id=_org AND o.status='OPEN' AND public.crm_visible(_org,'sales_opportunities',to_jsonb(o))
   AND (_filters->>'from' IS NULL OR o.created_at>=(_filters->>'from')::date) AND (_filters->>'to' IS NULL OR o.created_at<(_filters->>'to')::date+1)
   AND (_filters->>'assigned_user_id' IS NULL OR o.representative_id IN(SELECT id FROM sales_representatives WHERE organization_id=_org AND user_id=(_filters->>'assigned_user_id')::uuid))
   GROUP BY s.id,s.name)x;
  SELECT result||jsonb_build_object('representative_breakdown',coalesce(jsonb_agg(x),'[]')) INTO result FROM(
   SELECT r.id,coalesce(r.name,'Não atribuído') name,count(*) count,sum(o.estimated_value) value FROM sales_opportunities o LEFT JOIN sales_representatives r ON r.id=o.representative_id
   WHERE o.organization_id=_org AND o.status='OPEN' AND public.crm_visible(_org,'sales_opportunities',to_jsonb(o))
   AND (_filters->>'from' IS NULL OR o.created_at>=(_filters->>'from')::date) AND (_filters->>'to' IS NULL OR o.created_at<(_filters->>'to')::date+1)
   AND (_filters->>'assigned_user_id' IS NULL OR r.user_id=(_filters->>'assigned_user_id')::uuid)
   GROUP BY r.id,r.name)x;
  RETURN result;
 END IF;
 CASE _kind
 WHEN 'credit_policies' THEN tab:='customer_credit_policies';perm:='commercial_sensitive.read';
 WHEN 'customers' THEN tab:='customer_profiles';perm:='customers.read';
 WHEN 'companies' THEN tab:='companies';perm:='customers.read';
 WHEN 'contacts' THEN tab:='company_contacts';perm:='customers.read';
 WHEN 'leads' THEN tab:='leads';perm:='leads.read';
 WHEN 'opportunities' THEN tab:='sales_opportunities';perm:='opportunities.read';
 WHEN 'opportunity_items' THEN tab:='opportunity_items';perm:='opportunities.read';
 WHEN 'stage_history' THEN tab:='opportunity_stage_history';perm:='opportunities.read';
 WHEN 'quotes' THEN tab:='sales_quotes';perm:='quotes.read';
 WHEN 'quote_items' THEN tab:='sales_quote_items';perm:='quotes.read';
 WHEN 'approvals' THEN tab:='quote_approvals';perm:='quotes.read';
 WHEN 'activities' THEN tab:='crm_activities';perm:='activities.read';
 WHEN 'activity_history' THEN tab:='crm_activity_history';perm:='activities.read';
 WHEN 'representatives' THEN tab:='sales_representatives';perm:='representatives.read';
 WHEN 'portfolios' THEN tab:='customer_portfolio_assignments';perm:='customers.read';
 WHEN 'segments' THEN tab:='commercial_segments';perm:='crm.read';
 WHEN 'sources' THEN tab:='commercial_sources';perm:='crm.read';
 WHEN 'reasons' THEN tab:='commercial_reasons';perm:='crm.read';
 WHEN 'tags' THEN tab:='commercial_tags';perm:='customers.read';
 WHEN 'customer_tags' THEN tab:='customer_tags';perm:='customers.read';
 WHEN 'territories' THEN tab:='sales_territories';perm:='representatives.read';
 WHEN 'payment_terms' THEN tab:='commercial_payment_terms';perm:='crm.read';
 WHEN 'pipelines' THEN tab:='sales_pipelines';perm:='opportunities.read';
 WHEN 'stages' THEN tab:='sales_pipeline_stages';perm:='opportunities.read';
 WHEN 'authorities' THEN tab:='commercial_discount_authorities';perm:='commercial_sensitive.read';
 WHEN 'commission_plans' THEN tab:='commission_plans';perm:='commercial_sensitive.read';
 WHEN 'commission_rules' THEN tab:='commission_rules';perm:='commercial_sensitive.read';
 WHEN 'variants' THEN tab:='product_variants';perm:='products.read';
 WHEN 'price_tables' THEN tab:='price_tables';perm:='pricing.read';
 WHEN 'merge_requests' THEN tab:='company_merge_requests';perm:='customers.merge';
 ELSE RAISE EXCEPTION 'Consulta desconhecida.';
 END CASE;
 PERFORM public.crm_require(_org,perm);
 IF _kind='credit_policies' THEN PERFORM public.crm_require(_org,'receivables.read'); END IF;
 scope:='organization_id=$1 AND public.crm_visible($1,'||quote_literal(tab)||',to_jsonb(t))';
 IF ident IS NOT NULL THEN scope:=scope||' AND id='||quote_literal(ident)||'::uuid'; END IF;
 -- Filter only whitelisted JSON keys; field absence cannot accidentally match.
 FOR p IN SELECT jsonb_build_object('key',key,'value',value) FROM jsonb_each_text(_filters) WHERE key IN ('company_id','quote_number','status','representative_id','commercial_segment_id','acquisition_source_id','opportunity_id','quote_id','pipeline_id','activity_id','assigned_user_id') LOOP
  IF _kind='customers' AND p->>'key'='representative_id' THEN
   scope:=scope||format(' AND EXISTS(SELECT 1 FROM customer_portfolio_assignments a WHERE a.organization_id=$1 AND a.company_id=t.company_id AND a.ended_at IS NULL AND a.representative_id=%L::uuid)',p->>'value');
  ELSE
   scope:=scope||format(' AND to_jsonb(t)->>%L=%L',CASE WHEN _kind='customers' AND p->>'key'='status' THEN 'commercial_status' ELSE p->>'key' END,p->>'value');
  END IF;
 END LOOP;
 IF _kind='customers' AND nullif(_filters->>'q','') IS NOT NULL THEN
  scope:=scope||format(' AND (t.customer_code ILIKE %1$L OR EXISTS(SELECT 1 FROM companies c WHERE c.id=t.company_id AND c.organization_id=$1 AND (c.legal_name ILIKE %1$L OR c.trade_name ILIKE %1$L OR c.document_number ILIKE %1$L)))','%'||(_filters->>'q')||'%');
 ELSIF nullif(_filters->>'q','') IS NOT NULL THEN scope:=scope||format(' AND (coalesce(to_jsonb(t)->>''name'','''')||'' ''||coalesce(to_jsonb(t)->>''title'','''')||'' ''||coalesce(to_jsonb(t)->>''legal_name'','''')||'' ''||coalesce(to_jsonb(t)->>''company_name'','''')||'' ''||coalesce(to_jsonb(t)->>''sku'','''')||'' ''||coalesce(to_jsonb(t)->>''email'','''')||'' ''||coalesce(to_jsonb(t)->>''document_number'','''')) ILIKE %L','%'||(_filters->>'q')||'%'); END IF;
 IF _kind='customers' THEN
  IF _filters->>'tag_id' IS NOT NULL THEN scope:=scope||format(' AND EXISTS(SELECT 1 FROM customer_tags ct WHERE ct.organization_id=$1 AND ct.company_id=t.company_id AND ct.tag_id=%L::uuid)',_filters->>'tag_id'); END IF;
  IF _filters->>'territory_id' IS NOT NULL THEN scope:=scope||format(' AND EXISTS(SELECT 1 FROM customer_territories ct WHERE ct.organization_id=$1 AND ct.company_id=t.company_id AND ct.territory_id=%L::uuid)',_filters->>'territory_id'); END IF;
 END IF;
 IF _filters->>'from' IS NOT NULL THEN scope:=scope||format(' AND created_at>=%L::date',_filters->>'from'); END IF;
 IF _filters->>'to' IS NOT NULL THEN scope:=scope||format(' AND created_at<%L::date+1',_filters->>'to'); END IF;
 EXECUTE format('SELECT count(*) FROM public.%I t WHERE %s',tab,scope) INTO cnt USING _org;
 EXECUTE format('SELECT coalesce(jsonb_agg(x),''[]'') FROM (SELECT t.* FROM public.%I t WHERE %s ORDER BY created_at DESC,id LIMIT 50 OFFSET %s)x',tab,scope,offst) INTO result USING _org;
 RETURN jsonb_build_object('rows',result,'total',cnt);
END $$;
COMMIT;
