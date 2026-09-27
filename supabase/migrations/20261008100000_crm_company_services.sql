BEGIN;
CREATE FUNCTION public.company_save_core(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c uuid:=coalesce(_id,gen_random_uuid()); p uuid; loc uuid; doc text; typ text; old_status text;
BEGIN

 PERFORM public.inventory_lock(_org);
 IF jsonb_typeof(coalesce(_data->'roles','["PARTNER"]'))<>'array' OR jsonb_array_length(coalesce(_data->'roles','["PARTNER"]'))=0 THEN RAISE EXCEPTION 'Informe ao menos uma relação comercial.'; END IF;
 typ:=nullif(_data->>'document_type','');doc:=nullif(regexp_replace(upper(_data->>'document_number'),'[. /-]','','g'),'');
 IF doc IS NOT NULL AND (typ IS NULL OR (typ='CPF' AND doc!~'^[0-9]{11}$') OR (typ='CNPJ' AND doc!~'^[A-Z0-9]{12}[0-9]{2}$')) THEN RAISE EXCEPTION 'Formato de documento inválido.'; END IF;
 IF _id IS NOT NULL THEN
  SELECT status INTO old_status FROM public.companies WHERE id=c AND organization_id=_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
 END IF;
 IF _data->>'status'='BLOCKED' OR old_status='BLOCKED' THEN
  PERFORM public.partner_require(_org,'partners.block');
  IF _data->>'status'='BLOCKED' AND nullif(trim(_data->>'blocked_reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo do bloqueio obrigatório.'; END IF;
 END IF;
 INSERT INTO public.companies(id,organization_id,code,legal_name,trade_name,document_type,document_number,state_registration,email,phone,website,status,notes,blocked_reason,blocked_at,blocked_by,created_by,updated_by)
 VALUES(c,_org,trim(_data->>'code'),trim(_data->>'legal_name'),_data->>'trade_name',typ,doc,_data->>'state_registration',_data->>'email',_data->>'phone',_data->>'website',coalesce(_data->>'status','ACTIVE'),_data->>'notes',_data->>'blocked_reason',CASE WHEN _data->>'status'='BLOCKED' THEN now() END,CASE WHEN _data->>'status'='BLOCKED' THEN auth.uid() END,auth.uid(),auth.uid())
 ON CONFLICT(id) DO UPDATE SET code=excluded.code,legal_name=excluded.legal_name,trade_name=excluded.trade_name,document_type=excluded.document_type,document_number=excluded.document_number,state_registration=excluded.state_registration,email=excluded.email,phone=excluded.phone,website=excluded.website,status=excluded.status,notes=excluded.notes,blocked_reason=excluded.blocked_reason,blocked_at=excluded.blocked_at,blocked_by=excluded.blocked_by,updated_by=auth.uid(),updated_at=now();
 -- Papéis são relacionais; remoção não apaga fatos de histórico (registro pode ser reativado).
 INSERT INTO public.company_roles(organization_id,company_id,role) SELECT _org,c,value FROM jsonb_array_elements_text(coalesce(_data->'roles','["PARTNER"]')) ON CONFLICT DO NOTHING;
 SELECT id INTO p FROM public.partner_profiles WHERE company_id=c;
 IF p IS NULL AND EXISTS(SELECT 1 FROM public.company_roles WHERE company_id=c AND role='PARTNER') THEN
  p:=gen_random_uuid();loc:=gen_random_uuid();
  INSERT INTO public.partner_profiles(id,organization_id,company_id,partner_code,settlement_frequency) VALUES(p,_org,c,_data->>'code',coalesce(_data->>'settlement_frequency','MONTHLY'));
  INSERT INTO public.inventory_locations(id,organization_id,code,name,type,partner_id,created_by,updated_by) VALUES(loc,_org,'PARTNER-'||p::text,'Parceiro — '||(_data->>'legal_name'),'PARTNER',p,auth.uid(),auth.uid());
  UPDATE public.partner_profiles SET default_inventory_location_id=loc WHERE id=p;
 END IF;
 UPDATE public.partner_profiles SET operational_status=coalesce(_data->>'status','ACTIVE'),settlement_frequency=coalesce(_data->>'settlement_frequency',settlement_frequency),updated_at=now() WHERE id=p;
 PERFORM public.partner_audit(_org,CASE WHEN _id IS NULL THEN 'partner.company.create' WHEN _data->>'status'='BLOCKED' THEN 'partner.block' ELSE 'partner.company.update' END,'companies',c,_data);
 RETURN c;
END;
$$;
CREATE OR REPLACE FUNCTION public.partner_save_company(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.partner_require(_org,CASE WHEN _id IS NULL THEN 'partners.create' ELSE 'partners.update' END);
 RETURN public.company_save_core(_org,_data,_id);
END $$;
CREATE FUNCTION public.company_detail_core(_org uuid,_company uuid,_kind text,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v uuid:=coalesce(_id,gen_random_uuid());
BEGIN
 IF _kind NOT IN ('contact','address') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;

 PERFORM public.inventory_lock(_org);
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=_company AND organization_id=_org) THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
 IF _kind='contact' THEN
  IF _id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_contacts WHERE id=v AND company_id=_company AND organization_id=_org) THEN RAISE EXCEPTION 'Contato não encontrado.'; END IF;
  IF coalesce((_data->>'is_primary')::boolean,false) THEN UPDATE public.company_contacts SET is_primary=false WHERE company_id=_company; END IF;
  INSERT INTO public.company_contacts(id,organization_id,company_id,name,title,email,phone,whatsapp,is_primary,status,notes)
  VALUES(v,_org,_company,_data->>'name',_data->>'title',_data->>'email',_data->>'phone',_data->>'whatsapp',coalesce((_data->>'is_primary')::boolean,false),coalesce(_data->>'status','ACTIVE'),_data->>'notes')
  ON CONFLICT(id) DO UPDATE SET name=excluded.name,title=excluded.title,email=excluded.email,phone=excluded.phone,whatsapp=excluded.whatsapp,is_primary=excluded.is_primary,status=excluded.status,notes=excluded.notes,updated_at=now();
 ELSE
  IF _id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_addresses WHERE id=v AND company_id=_company AND organization_id=_org) THEN RAISE EXCEPTION 'Endereço não encontrado.'; END IF;
  IF coalesce((_data->>'is_primary')::boolean,false) THEN UPDATE public.company_addresses SET is_primary=false WHERE company_id=_company AND type=coalesce(_data->>'type','SHIPPING'); END IF;
  INSERT INTO public.company_addresses(id,organization_id,company_id,type,postal_code,street,number,complement,district,city,state,country,is_primary)
  VALUES(v,_org,_company,coalesce(_data->>'type','SHIPPING'),_data->>'postal_code',_data->>'street',_data->>'number',_data->>'complement',_data->>'district',_data->>'city',_data->>'state',coalesce(nullif(_data->>'country',''),'BR'),coalesce((_data->>'is_primary')::boolean,false))
  ON CONFLICT(id) DO UPDATE SET type=excluded.type,postal_code=excluded.postal_code,street=excluded.street,number=excluded.number,complement=excluded.complement,district=excluded.district,city=excluded.city,state=excluded.state,country=excluded.country,is_primary=excluded.is_primary,updated_at=now();
 END IF;
 PERFORM public.partner_audit(_org,'partner.'||_kind||'.save',CASE _kind WHEN 'contact' THEN 'company_contacts' ELSE 'company_addresses' END,v,jsonb_build_object('company_id',_company,'data',_data));
 RETURN v;
END;
$$;
CREATE OR REPLACE FUNCTION public.partner_save_detail(_org uuid,_company uuid,_kind text,_data jsonb,_id uuid DEFAULT NULL) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF _kind NOT IN ('contact','address') THEN RAISE EXCEPTION 'Tipo inválido.'; END IF;
 PERFORM public.partner_require(_org,CASE _kind WHEN 'contact' THEN 'partner_contacts.manage' ELSE 'partner_addresses.manage' END);
 RETURN public.company_detail_core(_org,_company,_kind,_data,_id);
END $$;
REVOKE ALL ON FUNCTION public.company_save_core(uuid,jsonb,uuid),public.company_detail_core(uuid,uuid,text,jsonb,uuid) FROM PUBLIC,anon,authenticated;
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
   company:=public.company_save_core(_org,(_data->'company')||jsonb_build_object('roles',jsonb_build_array('CUSTOMER')));
  END IF;
  IF NOT public.crm_company_access(_org,company) OR NOT EXISTS(SELECT 1 FROM companies WHERE id=company AND organization_id=_org) THEN RAISE EXCEPTION 'Empresa fora da carteira.'; END IF;
  INSERT INTO company_roles(organization_id,company_id,role) VALUES(_org,company,'CUSTOMER') ON CONFLICT DO NOTHING;
  INSERT INTO customer_profiles(organization_id,company_id,customer_code,commercial_segment_id,acquisition_source_id,price_table_id,payment_terms_id)
   VALUES(_org,company,coalesce(nullif(_data->>'customer_code',''),(SELECT code FROM companies WHERE id=company)),nullif(_data->>'commercial_segment_id','')::uuid,nullif(_data->>'acquisition_source_id','')::uuid,nullif(_data->>'price_table_id','')::uuid,nullif(_data->>'payment_terms_id','')::uuid)
   ON CONFLICT(organization_id,company_id) DO NOTHING RETURNING id INTO ident;
  SELECT id INTO ident FROM customer_profiles WHERE organization_id=_org AND company_id=company;
  PERFORM public.crm_audit(_org,'customer.link',ident,jsonb_build_object('company_id',company));
  RETURN jsonb_build_object('id',ident,'company_id',company);
 WHEN 'company' THEN
  PERFORM public.crm_require(_org,'customers.update');
  company:=(_data->>'id')::uuid;
  IF NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Empresa fora da carteira.'; END IF;
  SELECT to_jsonb(c) INTO old FROM companies c WHERE organization_id=_org AND id=company;
  IF old IS NULL THEN RAISE EXCEPTION 'Empresa não encontrada.'; END IF;
  SELECT coalesce(jsonb_agg(role),'[]') INTO result FROM company_roles WHERE organization_id=_org AND company_id=company;
  ident:=public.company_save_core(_org,(old||(_data-ARRAY['id','organization_id','roles','status','blocked_reason','blocked_at','blocked_by']))||jsonb_build_object('roles',result),company);
  RETURN jsonb_build_object('id',ident);
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
  SELECT id INTO ident FROM company_merge_requests WHERE organization_id=_org AND source_company_id=(_data->>'source_company_id')::uuid AND target_company_id=(_data->>'target_company_id')::uuid;
  IF FOUND THEN RETURN jsonb_build_object('id',ident); END IF;
  ident:=gen_random_uuid();
  tab:='company_merge_requests';cols:=ARRAY['source_company_id','target_company_id','reason'];
 WHEN 'contact' THEN
  PERFORM public.crm_require(_org,'customers.update');
  company:=(_data->>'company_id')::uuid;
  IF NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Empresa fora da carteira.'; END IF;
  IF _data->>'id' IS NOT NULL THEN
   SELECT to_jsonb(cc) INTO old FROM company_contacts cc WHERE id=(_data->>'id')::uuid AND organization_id=_org AND company_id=company;
   IF old IS NULL THEN RAISE EXCEPTION 'Contato não encontrado.'; END IF;
   _data:=old||_data;
  END IF;
  ident:=public.company_detail_core(_org,company,'contact',_data,nullif(_data->>'id','')::uuid);
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
CREATE OR REPLACE FUNCTION public.crm_action(_org uuid,_kind text,_id uuid,_action text,_data jsonb,_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE perm text; prior public.crm_operation_keys; payload jsonb:=jsonb_build_object('kind',_kind,'id',_id,'action',_action,'data',_data);
 result jsonb; ident uuid; company uuid; contact uuid; lead public.leads; quote public.sales_quotes; opportunity public.sales_opportunities;
 stage public.sales_pipeline_stages; previous_stage jsonb; i jsonb; price jsonb; product jsonb; terms jsonb; financial jsonb;
 qnumber bigint; ver integer:=1; subtotal numeric:=0; discount numeric; total numeric; authority numeric; rep uuid; c public.companies;
BEGIN
 perm:=CASE _kind WHEN 'lead' THEN 'leads.convert' WHEN 'portfolio' THEN 'portfolios.manage' WHEN 'opportunity' THEN CASE WHEN _action='stage' THEN 'opportunities.update' ELSE 'opportunities.close' END
 WHEN 'quote' THEN CASE _action WHEN 'create' THEN 'quotes.create' WHEN 'revise' THEN 'quotes.update' WHEN 'submit' THEN 'quotes.update' WHEN 'approve' THEN 'quotes.approve' WHEN 'send' THEN 'quotes.send' WHEN 'accept' THEN 'quotes.accept' ELSE 'quotes.update' END END;
 IF perm IS NULL OR _key IS NULL THEN RAISE EXCEPTION 'Opération ou clé invalide.'; END IF;
 PERFORM public.crm_require(_org,perm);PERFORM public.inventory_lock(_org);
 SELECT * INTO prior FROM crm_operation_keys WHERE organization_id=_org AND operation_key=_key;
 IF FOUND THEN
  IF prior.payload<>payload OR prior.created_by<>auth.uid() THEN RAISE EXCEPTION 'Chave já utilizada com outro conteúdo ou usuário.'; END IF;
  RETURN prior.result;
 END IF;
 IF _kind='lead' AND _action='convert' THEN
  SELECT * INTO lead FROM leads WHERE organization_id=_org AND id=_id FOR UPDATE;
  IF NOT FOUND OR (public.crm_external(_org) AND lead.assigned_user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'Lead não encontrado.'; END IF;
  IF lead.status='CONVERTED' THEN
   SELECT id INTO ident FROM sales_opportunities WHERE organization_id=_org AND source_type='LEAD' AND source_id=_id;
   result:=jsonb_build_object('company_id',lead.company_id,'opportunity_id',ident);
  ELSE
   IF lead.status<>'QUALIFIED' THEN RAISE EXCEPTION 'Qualifique o lead antes de converter.'; END IF;
   result:=public.crm_save(_org,'customer',_data);
   company:=(result->>'company_id')::uuid;
   SELECT id INTO contact FROM company_contacts WHERE organization_id=_org AND company_id=company AND ((lead.email IS NOT NULL AND lower(email)=lower(lead.email)) OR (lead.phone IS NOT NULL AND regexp_replace(phone,'[^0-9]','','g')=regexp_replace(lead.phone,'[^0-9]','','g'))) ORDER BY created_at LIMIT 1;
   IF contact IS NULL THEN
    contact:=(public.crm_save(_org,'contact',jsonb_build_object('company_id',company,'name',lead.name,'email',lead.email,'phone',lead.phone,'processing_purpose',lead.processing_purpose,'marketing_opt_in',lead.marketing_opt_in))->>'id')::uuid;
   END IF;
   ident:=(public.crm_save(_org,'opportunity',jsonb_build_object('company_id',company,'primary_contact_id',contact,'title',coalesce(_data->>'title','Negociação — '||lead.name),'stage_id',_data->>'stage_id','source_type','LEAD','source_id',_id))->>'id')::uuid;
   UPDATE leads SET status='CONVERTED',company_id=company,converted_at=now(),updated_at=now() WHERE id=_id;
   result:=jsonb_build_object('company_id',company,'contact_id',contact,'opportunity_id',ident);
  END IF;
 ELSIF _kind='portfolio' AND _action='assign' THEN
  IF public.crm_external(_org) THEN RAISE EXCEPTION 'Transferência restrita à equipe interna.'; END IF;
  company:=_id;rep:=(_data->>'representative_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM customer_profiles WHERE organization_id=_org AND company_id=company) OR NOT EXISTS(SELECT 1 FROM sales_representatives WHERE organization_id=_org AND id=rep AND status='ACTIVE') THEN RAISE EXCEPTION 'Cliente ou representante inválido.'; END IF;
  IF nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo obrigatório.'; END IF;
  UPDATE customer_portfolio_assignments SET ended_at=now(),updated_at=now() WHERE organization_id=_org AND company_id=company AND ended_at IS NULL;
  INSERT INTO customer_portfolio_assignments(organization_id,company_id,representative_id,reason) VALUES(_org,company,rep,_data->>'reason') RETURNING id INTO ident;
  result:=jsonb_build_object('id',ident);
 ELSIF _kind='opportunity' THEN
  SELECT * INTO opportunity FROM sales_opportunities WHERE organization_id=_org AND id=_id FOR UPDATE;
  IF NOT FOUND OR NOT public.crm_company_access(_org,opportunity.company_id) THEN RAISE EXCEPTION 'Oportunidade não encontrada.'; END IF;
  IF opportunity.status<>'OPEN' THEN RAISE EXCEPTION 'Oportunidade encerrada.'; END IF;
  IF _action='stage' THEN
   SELECT * INTO stage FROM sales_pipeline_stages WHERE organization_id=_org AND id=(_data->>'stage_id')::uuid AND pipeline_id=opportunity.pipeline_id;
   IF NOT FOUND THEN RAISE EXCEPTION 'Etapa inválida para este pipeline.'; END IF;
   SELECT to_jsonb(s) INTO previous_stage FROM sales_pipeline_stages s WHERE id=opportunity.stage_id;
   UPDATE sales_opportunities SET stage_id=stage.id,probability=stage.probability,updated_at=now() WHERE id=_id;
   INSERT INTO opportunity_stage_history(organization_id,opportunity_id,previous_stage,new_stage,reason) VALUES(_org,_id,previous_stage,to_jsonb(stage),_data->>'reason');
  ELSIF _action IN ('WON','LOST','CANCELED') THEN
   IF _action='LOST' AND NOT EXISTS(SELECT 1 FROM commercial_reasons WHERE organization_id=_org AND id=(_data->>'loss_reason_id')::uuid AND kind='LOSS') THEN RAISE EXCEPTION 'Motivo da perda obrigatório.'; END IF;
   UPDATE sales_opportunities SET status=_action,closed_at=now(),updated_at=now(),loss_reason_id=nullif(_data->>'loss_reason_id','')::uuid WHERE id=_id;
  ELSE RAISE EXCEPTION 'Transição inválida.'; END IF;
  result:=jsonb_build_object('id',_id);
 ELSIF _kind='quote' THEN
  IF _action IN ('create','revise') THEN
   IF _action='revise' THEN
    SELECT * INTO quote FROM sales_quotes WHERE id=_id AND organization_id=_org FOR UPDATE;
    IF NOT FOUND OR NOT public.crm_company_access(_org,quote.company_id) THEN RAISE EXCEPTION 'Proposta não encontrada.'; END IF;
    IF EXISTS(SELECT 1 FROM sales_quotes WHERE organization_id=_org AND quote_number=quote.quote_number AND status='ACCEPTED') THEN RAISE EXCEPTION 'Proposta já aceita.'; END IF;
    company:=quote.company_id;qnumber:=quote.quote_number;
    SELECT max(version)+1 INTO ver FROM sales_quotes WHERE organization_id=_org AND quote_number=qnumber;
    _data:=jsonb_build_object('company_id',company,'price_table_id',quote.price_table_id,'opportunity_id',quote.opportunity_id,'primary_contact_id',quote.primary_contact_id)||_data;
   ELSE
    company:=(_data->>'company_id')::uuid;
    SELECT coalesce(max(quote_number),0)+1 INTO qnumber FROM sales_quotes WHERE organization_id=_org;
   END IF;
   IF NOT public.crm_company_access(_org,company) THEN RAISE EXCEPTION 'Cliente fora da carteira.'; END IF;
   SELECT * INTO c FROM companies WHERE organization_id=_org AND id=company AND status='ACTIVE';
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM customer_profiles WHERE organization_id=_org AND company_id=company AND commercial_status='ACTIVE') THEN RAISE EXCEPTION 'Cliente inativo ou bloqueado.'; END IF;
   IF jsonb_array_length(coalesce(_data->'items','[]'))=0 THEN RAISE EXCEPTION 'Informe itens.'; END IF;
   SELECT representative_id INTO rep FROM customer_portfolio_assignments WHERE organization_id=_org AND company_id=company AND ended_at IS NULL;
   SELECT to_jsonb(p) INTO terms FROM commercial_payment_terms p JOIN customer_profiles cp ON cp.payment_terms_id=p.id WHERE cp.organization_id=_org AND cp.company_id=company;
   ident:=gen_random_uuid();discount:=coalesce((_data->>'discount_percent')::numeric,0);
   -- Totals are calculated before insertion; consolidated quote values never change.
   FOR i IN SELECT value FROM jsonb_array_elements(_data->'items') LOOP
    price:=public.pricing_resolve_table(_org,(_data->>'price_table_id')::uuid,(i->>'variant_id')::uuid,current_date);
    IF price IS NULL THEN RAISE EXCEPTION 'Preço vigente não encontrado.'; END IF;
    IF (i->>'quantity')::numeric<=0 THEN RAISE EXCEPTION 'Quantidade positiva obrigatória.'; END IF;
    subtotal:=subtotal+round((price->>'unit_price')::numeric*(i->>'quantity')::numeric,2);
   END LOOP;
   total:=subtotal-round(subtotal*discount/100,2)+coalesce((_data->>'freight')::numeric,0)+coalesce((_data->>'tax_amount')::numeric,0);
   INSERT INTO sales_quotes(id,organization_id,company_id,representative_id,opportunity_id,price_table_id,primary_contact_id,quote_number,version,valid_until,payment_terms_snapshot,company_snapshot,subtotal,discount_percent,discount_amount,freight,tax_amount,total,notes)
   VALUES(ident,_org,company,rep,nullif(_data->>'opportunity_id','')::uuid,(_data->>'price_table_id')::uuid,nullif(_data->>'primary_contact_id','')::uuid,qnumber,ver,(_data->>'valid_until')::date,coalesce(terms,'{}'),to_jsonb(c),subtotal,discount,round(subtotal*discount/100,2),coalesce((_data->>'freight')::numeric,0),coalesce((_data->>'tax_amount')::numeric,0),total,_data->>'notes');
   FOR i IN SELECT value FROM jsonb_array_elements(_data->'items') LOOP
    SELECT jsonb_build_object('sku',v.sku,'size',v.size,'color',v.color,'name',p.name) INTO product FROM product_variants v JOIN products p ON p.id=v.product_id WHERE v.organization_id=_org AND v.id=(i->>'variant_id')::uuid AND v.status='ACTIVE' AND p.status='ACTIVE';
    IF product IS NULL THEN RAISE EXCEPTION 'Variante inativa ou inválida.'; END IF;
    price:=public.pricing_resolve_table(_org,(_data->>'price_table_id')::uuid,(i->>'variant_id')::uuid,current_date);
    INSERT INTO sales_quote_items(organization_id,quote_id,variant_id,quantity,unit_price,price_snapshot,product_snapshot) VALUES(_org,ident,(i->>'variant_id')::uuid,(i->>'quantity')::numeric,(price->>'unit_price')::numeric,price,product);
   END LOOP;
   result:=jsonb_build_object('id',ident,'number',qnumber,'version',ver,'total',total);
  ELSE
   SELECT * INTO quote FROM sales_quotes WHERE organization_id=_org AND id=_id FOR UPDATE;
   IF NOT FOUND OR NOT public.crm_company_access(_org,quote.company_id) THEN RAISE EXCEPTION 'Proposta não encontrada.'; END IF;
   IF quote.status='ACCEPTED' AND _action='accept' THEN
    result:=jsonb_build_object('id',_id,'status','ACCEPTED');
   ELSE
    IF _action IN ('approve','send','accept') AND quote.valid_until<current_date THEN RAISE EXCEPTION 'Proposta vencida.'; END IF;
    IF _action IN ('approve','send','accept') AND (NOT EXISTS(SELECT 1 FROM companies WHERE id=quote.company_id AND organization_id=_org AND status='ACTIVE') OR NOT EXISTS(SELECT 1 FROM customer_profiles WHERE company_id=quote.company_id AND organization_id=_org AND commercial_status='ACTIVE')) THEN RAISE EXCEPTION 'Cliente inativo ou bloqueado.'; END IF;
    CASE _action
    WHEN 'submit' THEN
     IF quote.status<>'DRAFT' THEN RAISE EXCEPTION 'Submissão apenas do rascunho.'; END IF;
     UPDATE sales_quotes SET status='PENDING_APPROVAL',updated_at=now() WHERE id=_id;
    WHEN 'approve' THEN
     IF quote.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Aprovação exige proposta pendente.'; END IF;
     -- Alcada so e exigida quando existe desconto. Proposta sem desconto nao
     -- depende de autoridade: senao nenhuma organizacao sem alcada cadastrada
     -- conseguiria aprovar proposta alguma.
     IF quote.discount_percent>0 THEN
      SELECT max_discount_percent INTO authority FROM commercial_discount_authorities WHERE organization_id=_org AND user_id=auth.uid();
      IF authority IS NULL OR quote.discount_percent>authority THEN RAISE EXCEPTION 'Desconto excede a alçada configurada.'; END IF;
     END IF;
     IF nullif(trim(_data->>'reason'),'') IS NULL THEN RAISE EXCEPTION 'Motivo da aprovação obrigatório.'; END IF;
     financial:=public.crm_financial_position(_org,quote.company_id);
     IF ((financial->>'block_overdue')::boolean AND (financial->>'overdue_amount')::numeric>0) OR
      ((financial->>'block_over_limit')::boolean AND financial->>'credit_limit' IS NOT NULL AND (financial->>'open_amount')::numeric+quote.total>(financial->>'credit_limit')::numeric) THEN RAISE EXCEPTION 'Política comercial bloqueia aprovação. Consulte responsável financeiro.'; END IF;
     UPDATE sales_quotes SET status='APPROVED',approved_by=auth.uid(),approved_at=now(),updated_at=now() WHERE id=_id;
     INSERT INTO quote_approvals(organization_id,quote_id,decision,reason,values_snapshot) VALUES(_org,_id,'APPROVED',_data->>'reason',jsonb_build_object('total',quote.total,'discount_percent',quote.discount_percent,'authority',authority));
    WHEN 'send' THEN
     IF quote.status<>'APPROVED' THEN RAISE EXCEPTION 'Apenas proposta aprovada pode ser marcada enviada.'; END IF;
     UPDATE sales_quotes SET status='SENT',sent_at=now(),updated_at=now() WHERE id=_id;
    WHEN 'accept' THEN
     IF quote.status<>'SENT' THEN RAISE EXCEPTION 'Aceite exige proposta enviada.'; END IF;
     IF EXISTS(SELECT 1 FROM sales_quotes WHERE organization_id=_org AND quote_number=quote.quote_number AND status='ACCEPTED') THEN RAISE EXCEPTION 'Outra versão já aceita.'; END IF;
     contact:=nullif(_data->>'contact_id','')::uuid;
     IF NOT EXISTS(SELECT 1 FROM company_contacts WHERE organization_id=_org AND company_id=quote.company_id AND id=contact AND status='ACTIVE') THEN RAISE EXCEPTION 'Contato do aceite obrigatório.'; END IF;
     UPDATE sales_quotes SET status='ACCEPTED',accepted_at=now(),accepted_by=auth.uid(),acceptance_contact_id=contact,acceptance_evidence=_data->>'evidence',updated_at=now() WHERE id=_id;
     INSERT INTO domain_events(organization_id,event_type,event_source,event_key,payload)
     VALUES(_org,'SALES_QUOTE_ACCEPTED','CRM','sales_quote_accepted:'||_id,jsonb_build_object('quote_id',_id,'version',quote.version,'company_id',quote.company_id,'total',quote.total,'currency','BRL','schema_version',1))
     ON CONFLICT(organization_id,event_key) DO NOTHING;
    WHEN 'reject' THEN
     IF quote.status<>'SENT' THEN RAISE EXCEPTION 'Rejeição exige proposta enviada.'; END IF;
     UPDATE sales_quotes SET status='REJECTED',updated_at=now() WHERE id=_id;
    WHEN 'cancel' THEN
     IF quote.status IN ('ACCEPTED','CANCELED') THEN RAISE EXCEPTION 'Cancelamento inválido.'; END IF;
     UPDATE sales_quotes SET status='CANCELED',updated_at=now() WHERE id=_id;
    ELSE RAISE EXCEPTION 'Transição inválida.';
    END CASE;
    SELECT jsonb_build_object('id',id,'status',status) INTO result FROM sales_quotes WHERE id=_id;
   END IF;
  END IF;
 ELSE RAISE EXCEPTION 'Operação inválida.';
 END IF;
 INSERT INTO crm_operation_keys(organization_id,operation_key,operation,payload,result) VALUES(_org,_key,_kind||'.'||_action,payload,result);
 PERFORM public.crm_audit(_org,_kind||'.'||_action,coalesce(_id,(result->>'id')::uuid),jsonb_build_object('request',payload,'result',result));
 RETURN result;
END $$;
COMMIT;
