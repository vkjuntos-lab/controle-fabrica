-- MASTER 012 acceptance hardening; keep the original migration unchanged.
BEGIN;
CREATE OR REPLACE FUNCTION public.crm_save(_org uuid,_kind text,_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ident uuid:=coalesce(nullif(_data->>'id','')::uuid,gen_random_uuid()); company uuid; rep uuid; stage public.sales_pipeline_stages;
 old jsonb; result jsonb; tab text; cols text[]; col text; names text:=''; expr text:=''; changes text:=''; perm text; i jsonb; k uuid; amount numeric;
BEGIN
 PERFORM public.crm_require(_org,'crm.read');
 PERFORM public.inventory_lock(_org);
 IF _kind IN ('segment','source','reason','tag','territory','payment_terms','pipeline','stage','discount_authority','commission_plan','commission_rule') THEN
  PERFORM public.crm_require(_org,'crm.configure');
  IF public.crm_external(_org) THEN RAISE EXCEPTION 'Configuração restrita à equipe interna.'; END IF;
 END IF;
 CASE _kind
 WHEN 'segment' THEN tab:='commercial_segments'; cols:=ARRAY['name','status'];
 WHEN 'source' THEN tab:='commercial_sources'; cols:=ARRAY['name','status'];
 WHEN 'reason' THEN tab:='commercial_reasons'; cols:=ARRAY['name','kind'];
 WHEN 'tag' THEN tab:='commercial_tags'; cols:=ARRAY['name'];
 WHEN 'territory' THEN tab:='sales_territories'; cols:=ARRAY['name','region','state','city','segment_id'];
 WHEN 'payment_terms' THEN tab:='commercial_payment_terms'; cols:=ARRAY['name','description','status'];
 WHEN 'pipeline' THEN tab:='sales_pipelines'; cols:=ARRAY['name','status'];
 WHEN 'stage' THEN tab:='sales_pipeline_stages'; cols:=ARRAY['name','pipeline_id','position','probability'];
 WHEN 'discount_authority' THEN tab:='commercial_discount_authorities'; cols:=ARRAY['user_id','max_discount_percent','reason'];
 WHEN 'commission_plan' THEN tab:='commission_plans'; cols:=ARRAY['name','trigger_event','status'];
 WHEN 'commission_rule' THEN tab:='commission_rules'; cols:=ARRAY['plan_id','representative_id','company_id','variant_id','rate_type','rate','effective_from','effective_to'];
 WHEN 'representative' THEN
  PERFORM public.crm_require(_org,'representatives.manage');
  IF public.crm_external(_org) THEN RAISE EXCEPTION 'Gestão restrita à equipe interna.'; END IF;
  tab:='sales_representatives';cols:=ARRAY['representative_code','name','representative_type','user_id','company_id','status','assigned_manager_id'];
 WHEN 'lead' THEN
  PERFORM public.crm_require(_org,CASE WHEN _data->>'id' IS NULL THEN 'leads.create' ELSE 'leads.update' END);
  SELECT to_jsonb(l) INTO old FROM leads l WHERE l.id=ident AND organization_id=_org;
  IF old->>'status'='CONVERTED' THEN RAISE EXCEPTION 'Lead convertido preservado.'; END IF;
  IF public.crm_external(_org) AND (coalesce(nullif(_data->>'assigned_user_id','')::uuid,auth.uid())<>auth.uid() OR (old IS NOT NULL AND old->>'assigned_user_id' IS DISTINCT FROM auth.uid()::text)) THEN RAISE EXCEPTION 'Lead fora da carteira.'; END IF;
  IF _data->>'status'='CONVERTED' THEN RAISE EXCEPTION 'Use a conversão transacional.'; END IF;
  IF _data->>'status'='UNQUALIFIED' AND NOT EXISTS(SELECT 1 FROM commercial_reasons WHERE organization_id=_org AND id=nullif(_data->>'disqualification_reason_id','')::uuid AND kind='LEAD') THEN RAISE EXCEPTION 'Motivo de desqualificação obrigatório.'; END IF;
  IF old IS NULL THEN _data:=jsonb_build_object('assigned_user_id',auth.uid())||_data; END IF;
  tab:='leads'; cols:=ARRAY['name','company_name','email','phone','acquisition_source_id','commercial_segment_id','assigned_user_id','status','notes','disqualification_reason_id','processing_purpose','marketing_opt_in'];
 WHEN 'customer' THEN
  PERFORM public.crm_require(_org,'customers.create');
  company:=nullif(_data->>'company_id','')::uuid;
  IF company IS NULL THEN
   IF public.crm_external(_org) THEN RAISE EXCEPTION 'Solicite cadastro empresarial à equipe interna.'; END IF;
   company:=public.partner_save_company(_org,(_data->'company')||jsonb_build_object('roles',jsonb_build_array('CUSTOMER')));
  END IF;
  IF NOT public.crm_company_access(_org,company) OR NOT EXISTS(SELECT 1 FROM companies WHERE id=company AND organization_id=_org) THEN RAISE EXCEPTION 'Empresa fora da carteira.'; END IF;
  INSERT INTO company_roles(organization_id,company_id,role) VALUES(_org,company,'CUSTOMER') ON CONFLICT DO NOTHING;
  INSERT INTO customer_profiles(organization_id,company_id,customer_code,commercial_segment_id,acquisition_source_id,price_table_id,payment_terms_id)
   VALUES(_org,company,coalesce(nullif(_data->>'customer_code',''),(SELECT code FROM companies WHERE id=company)),nullif(_data->>'commercial_segment_id','')::uuid,nullif(_data->>'acquisition_source_id','')::uuid,nullif(_data->>'price_table_id','')::uuid,nullif(_data->>'payment_terms_id','')::uuid)
   ON CONFLICT(organization_id,company_id) DO NOTHING RETURNING id INTO ident;
  SELECT id INTO ident FROM customer_profiles WHERE organization_id=_org AND company_id=company;
  PERFORM public.crm_audit(_org,'customer.link',ident,jsonb_build_object('company_id',company));
  RETURN jsonb_build_object('id',ident,'company_id',company);
 WHEN 'customer_profile' THEN
  PERFORM public.crm_require(_org,'customers.update');
  SELECT company_id INTO company FROM customer_profiles WHERE id=ident AND organization_id=_org;
  IF company IS NULL OR NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Cliente fora da carteira.'; END IF;
  tab:='customer_profiles';cols:=ARRAY['customer_type','commercial_status','commercial_segment_id','acquisition_source_id','price_table_id','payment_terms_id','notes'];
 WHEN 'credit' THEN
  PERFORM public.crm_require(_org,'crm.configure'); PERFORM public.crm_require(_org,'commercial_sensitive.read');
  PERFORM public.crm_require(_org,'receivables.read');
  IF public.crm_external(_org) THEN RAISE EXCEPTION 'Política restrita à equipe interna.'; END IF;
  tab:='customer_credit_policies';cols:=ARRAY['company_id','credit_limit','block_over_limit','block_overdue','reason'];
 WHEN 'customer_tag' THEN tab:='customer_tags';cols:=ARRAY['company_id','tag_id'];
 WHEN 'customer_territory' THEN tab:='customer_territories';cols:=ARRAY['company_id','territory_id'];
 WHEN 'merge_request' THEN
  PERFORM public.crm_require(_org,'customers.merge');
  IF public.crm_external(_org) THEN RAISE EXCEPTION 'Mesclagem restrita à equipe interna.'; END IF;
  tab:='company_merge_requests';cols:=ARRAY['source_company_id','target_company_id','reason'];
 WHEN 'contact' THEN
  PERFORM public.crm_require(_org,'customers.update');
  company:=(_data->>'company_id')::uuid;
  IF NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Empresa fora da carteira.'; END IF;
  ident:=public.partner_save_detail(_org,company,'contact',_data,nullif(_data->>'id','')::uuid);
  UPDATE company_contacts SET department=_data->>'department',preferred_channel=_data->>'preferred_channel',processing_purpose=_data->>'processing_purpose',
   marketing_opt_in=coalesce((_data->>'marketing_opt_in')::boolean,false),communication_restricted=coalesce((_data->>'communication_restricted')::boolean,false) WHERE id=ident;
  RETURN jsonb_build_object('id',ident);
 WHEN 'opportunity' THEN
  PERFORM public.crm_require(_org,CASE WHEN _data->>'id' IS NULL THEN 'opportunities.create' ELSE 'opportunities.update' END);
  company:=(_data->>'company_id')::uuid;
  IF NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Empresa fora da carteira.'; END IF;
  SELECT to_jsonb(o) INTO old FROM sales_opportunities o WHERE id=ident AND organization_id=_org;
  IF old IS NOT NULL THEN RAISE EXCEPTION 'Use transição para etapa ou encerramento; itens históricos preservados.'; END IF;
  SELECT * INTO stage FROM sales_pipeline_stages WHERE id=(_data->>'stage_id')::uuid AND organization_id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa inválida.'; END IF;
  SELECT representative_id INTO rep FROM customer_portfolio_assignments WHERE organization_id=_org AND company_id=company AND ended_at IS NULL;
  INSERT INTO sales_opportunities(id,organization_id,company_id,representative_id,pipeline_id,stage_id,primary_contact_id,title,description,expected_close_date,probability,source_type,source_id)
  VALUES(ident,_org,company,rep,stage.pipeline_id,stage.id,nullif(_data->>'primary_contact_id','')::uuid,_data->>'title',_data->>'description',nullif(_data->>'expected_close_date','')::date,coalesce((_data->>'probability')::numeric,stage.probability),_data->>'source_type',nullif(_data->>'source_id','')::uuid);
  FOR i IN SELECT value FROM jsonb_array_elements(coalesce(_data->'items','[]')) LOOP
   INSERT INTO opportunity_items(organization_id,opportunity_id,variant_id,estimated_quantity,estimated_unit_price,notes)
   VALUES(_org,ident,(i->>'variant_id')::uuid,(i->>'quantity')::numeric,(i->>'unit_price')::numeric,i->>'notes');
  END LOOP;
  UPDATE sales_opportunities SET estimated_value=coalesce((SELECT sum(estimated_total) FROM opportunity_items WHERE opportunity_id=ident),0) WHERE id=ident;
  INSERT INTO opportunity_stage_history(organization_id,opportunity_id,new_stage) VALUES(_org,ident,to_jsonb(stage));
  PERFORM public.crm_audit(_org,'opportunity.create',ident,jsonb_build_object('company_id',company));
  RETURN jsonb_build_object('id',ident);
 WHEN 'activity' THEN
  PERFORM public.crm_require(_org,'activities.manage');
  SELECT to_jsonb(a) INTO old FROM crm_activities a WHERE id=ident AND organization_id=_org;
  IF old IS NOT NULL AND (NOT public.crm_visible(_org,'crm_activities',old)) THEN RAISE EXCEPTION 'Atividade fora da carteira.'; END IF;
  company:=coalesce(nullif(_data->>'company_id','')::uuid,(old->>'company_id')::uuid);
  IF company IS NOT NULL AND NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Atividade fora da carteira.'; END IF;
  IF public.crm_external(_org) AND coalesce(nullif(_data->>'assigned_user_id','')::uuid,(old->>'assigned_user_id')::uuid,auth.uid())<>auth.uid() THEN RAISE EXCEPTION 'Responsável fora da carteira.'; END IF;
  IF _data->>'status'='COMPLETED' THEN _data:=_data||jsonb_build_object('completed_at',coalesce((old->>'completed_at')::timestamptz,now()));
  ELSIF _data->>'status' IN ('PENDING','CANCELED') THEN _data:=_data||jsonb_build_object('completed_at',NULL); END IF;
  IF old IS NOT NULL AND nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo da alteração obrigatório.'; END IF;
  IF old IS NULL THEN _data:=jsonb_build_object('assigned_user_id',auth.uid())||_data; END IF;
  tab:='crm_activities';cols:=ARRAY['company_id','lead_id','opportunity_id','assigned_user_id','activity_type','subject','description','scheduled_at','status','completed_at','outcome'];
 ELSE RAISE EXCEPTION 'Cadastro desconhecido.';
 END CASE;
 IF _kind IN ('customer_tag','customer_territory') THEN
  PERFORM public.crm_require(_org,'customers.update');
  IF NOT public.crm_company_access(_org,(_data->>'company_id')::uuid) THEN RAISE EXCEPTION 'Cliente fora da carteira.'; END IF;
 END IF;
 IF _data->>'id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_object_keys(_data) f WHERE f<>'id') THEN RAISE EXCEPTION 'Dados obrigatórios.'; END IF;
 EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id=$1 AND organization_id=$2',tab) INTO old USING ident,_org;
 IF old IS NOT NULL AND NOT public.crm_visible(_org,tab,old) THEN RAISE EXCEPTION 'Registro fora da carteira.'; END IF;
 IF _data->>'id' IS NOT NULL AND old IS NULL THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;
  FOREACH col IN ARRAY cols LOOP
   IF NOT (_data ? col) THEN CONTINUE; END IF;
   names:=names||format(',%I',col);expr:=expr||format(',r.%I',col);changes:=changes||CASE WHEN changes='' THEN '' ELSE ',' END||format('%I=r.%I',col,col);
  END LOOP;
  IF names='' THEN RAISE EXCEPTION 'Informe os dados.'; END IF;
  -- Patch semantics: an identified record is updated with the submitted fields only, so omitted
  -- columns keep their stored value and a partial save can never blank or break NOT NULL.
  IF _data->>'id' IS NOT NULL THEN
   EXECUTE format('UPDATE public.%I t SET %s,updated_at=now() FROM jsonb_populate_record(NULL::public.%I,$3)r WHERE t.id=$1 AND t.organization_id=$2 RETURNING to_jsonb(t)',tab,changes,tab) INTO result USING ident,_org,_data;
  ELSE
   EXECUTE format('INSERT INTO public.%I(id,organization_id%s) SELECT $2,$3%s FROM jsonb_populate_record(NULL::public.%I,$1)r RETURNING to_jsonb(%I)',tab,names,expr,tab,tab) INTO result USING _data,ident,_org;
  END IF;
  IF result IS NULL THEN RAISE EXCEPTION 'Registro não encontrado.'; END IF;
 IF _kind='activity' THEN INSERT INTO crm_activity_history(organization_id,activity_id,before_value,after_value,reason) VALUES(_org,ident,old,result,coalesce(_data->>'reason','Criação')); END IF;
 PERFORM public.crm_audit(_org,_kind||'.save',ident,jsonb_build_object('before',old,'after',result));
 RETURN jsonb_build_object('id',ident);
END $$;

-- A linked external identity cannot inherit organization-wide ERP reads from its base role.
-- Catalogue, official on-hand and pricing reads are intentionally shared commercial references.
CREATE OR REPLACE FUNCTION public.has_permission(_organization_id uuid,_permission text,_user_id uuid DEFAULT auth.uid())
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM organization_members m JOIN role_permissions rp ON rp.role=m.role
 WHERE m.organization_id=_organization_id AND m.user_id=_user_id AND m.is_active AND rp.permission=_permission)
 AND (NOT EXISTS(SELECT 1 FROM sales_representatives r WHERE r.organization_id=_organization_id AND r.user_id=_user_id AND r.representative_type IN ('EXTERNAL','COMPANY'))
 OR _permission=ANY(ARRAY['crm.read','crm.dashboard','leads.read','leads.create','leads.update','leads.convert','customers.read','customers.create','customers.update',
 'opportunities.read','opportunities.create','opportunities.update','opportunities.close','quotes.read','quotes.create','quotes.update','quotes.send','quotes.accept',
 'activities.read','activities.manage','representatives.read','crm.export','products.read','pricing.read']));
$$;

CREATE FUNCTION public.crm_relation_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE parent_company uuid; parent_user uuid; j jsonb:=to_jsonb(NEW);
BEGIN
 IF TG_TABLE_NAME='crm_activities' THEN
  IF NEW.opportunity_id IS NOT NULL THEN
   SELECT company_id INTO parent_company FROM sales_opportunities WHERE id=NEW.opportunity_id AND organization_id=NEW.organization_id;
   IF NEW.company_id IS DISTINCT FROM parent_company OR NOT public.crm_company_access(NEW.organization_id,parent_company) THEN RAISE EXCEPTION 'Atividade deve pertencer à empresa da oportunidade autorizada.'; END IF;
  END IF;
  IF NEW.lead_id IS NOT NULL THEN
   SELECT assigned_user_id,company_id INTO parent_user,parent_company FROM leads WHERE id=NEW.lead_id AND organization_id=NEW.organization_id;
   IF (public.crm_external(NEW.organization_id) AND parent_user IS DISTINCT FROM auth.uid()) OR (parent_company IS NOT NULL AND NEW.company_id IS DISTINCT FROM parent_company) THEN RAISE EXCEPTION 'Lead da atividade fora da carteira.'; END IF;
  END IF;
 END IF;
 IF TG_TABLE_NAME='leads' AND NEW.status='UNQUALIFIED' AND NOT EXISTS(SELECT 1 FROM commercial_reasons WHERE organization_id=NEW.organization_id AND id=(j->>'disqualification_reason_id')::uuid AND kind='LEAD') THEN RAISE EXCEPTION 'Motivo de desqualificação obrigatório.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_activity_relation BEFORE INSERT OR UPDATE ON public.crm_activities FOR EACH ROW EXECUTE FUNCTION public.crm_relation_guard();
CREATE TRIGGER crm_lead_reason BEFORE INSERT OR UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.crm_relation_guard();
REVOKE ALL ON FUNCTION public.crm_relation_guard() FROM PUBLIC,anon,authenticated;
-- Sensitive credit policy cannot bypass the finance permission through direct SELECT.
CREATE POLICY crm_credit_finance ON public.customer_credit_policies AS RESTRICTIVE FOR SELECT TO authenticated
 USING(public.has_permission(organization_id,'receivables.read'));
COMMIT;
