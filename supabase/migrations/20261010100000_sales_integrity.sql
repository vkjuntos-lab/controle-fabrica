-- MASTER 013: preserve original migration; repair conversion and secure RPC boundaries.
BEGIN;

CREATE OR REPLACE FUNCTION public.sales_convert_quote(_org uuid,_quote uuid,_data jsonb DEFAULT '{}',_key uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.sales_order_operation_keys; q public.sales_quotes; payload jsonb;
 result jsonb; it public.sales_quote_items; items jsonb:='[]'::jsonb;
 v_profile uuid; v_status text; v_order_id uuid; v_number text; v_subtotal numeric:=0; v_discount numeric:=0;
 v_tax numeric:=0; v_freight numeric; v_table uuid; v_addr_id uuid; v_bill_id uuid; v_addr jsonb:='{}'::jsonb;
 v_profile_table uuid; v_terms_id uuid; v_term text; v_rep uuid; v_snapshot jsonb;
BEGIN
 PERFORM public.sales_require(_org,'sales_orders.create');
 IF _key IS NULL THEN RAISE EXCEPTION 'Chave de operação é obrigatória.'; END IF;
 payload:=jsonb_build_object('quote_id',_quote,'data',coalesce(_data,'{}'::jsonb));
 PERFORM public.inventory_lock(_org);
 SELECT * INTO prior FROM public.sales_order_operation_keys WHERE organization_id=_org AND operation_key=_key;
 IF FOUND THEN
  IF prior.payload<>payload OR prior.created_by IS DISTINCT FROM auth.uid() THEN
   RAISE EXCEPTION 'Chave já utilizada com outro conteúdo ou usuário.';
  END IF;
  RETURN prior.result;
 END IF;

 SELECT * INTO q FROM public.sales_quotes WHERE id=_quote AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada.'; END IF;
 IF q.status<>'ACCEPTED' THEN RAISE EXCEPTION 'Somente proposta aceita pode virar pedido.'; END IF;

 -- Conversao repetida devolve o MESMO pedido. Nunca um segundo.
 SELECT id,order_number,status INTO v_order_id,v_number,v_status FROM public.sales_orders
  WHERE organization_id=_org AND sales_quote_id=_quote;
 IF v_order_id IS NOT NULL THEN
  result:=jsonb_build_object('id',v_order_id,'order_number',v_number,'status',v_status,'deduped',true);
 ELSE
  SELECT p.id,p.commercial_status,p.price_table_id,p.payment_terms_id
   INTO v_profile,v_status,v_profile_table,v_terms_id
   FROM public.customer_profiles p WHERE p.organization_id=_org AND p.company_id=q.company_id;
  IF v_profile IS NULL THEN RAISE EXCEPTION 'Empresa da proposta não possui perfil de cliente.'; END IF;
  IF v_status<>'ACTIVE' THEN RAISE EXCEPTION 'Cliente não está ativo para novas vendas (%s).',v_status; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=q.company_id AND organization_id=_org AND status='ACTIVE') THEN
   RAISE EXCEPTION 'Empresa inativa ou bloqueada.';
  END IF;
  v_table:=q.price_table_id; v_rep:=q.representative_id; v_freight:=round(coalesce(q.freight,0),2);
  SELECT id INTO v_addr_id FROM public.company_addresses
   WHERE organization_id=_org AND company_id=q.company_id AND type='SHIPPING' AND is_primary LIMIT 1;
  IF v_addr_id IS NOT NULL THEN SELECT to_jsonb(a) INTO v_addr FROM public.company_addresses a WHERE a.id=v_addr_id; END IF;
  SELECT id INTO v_bill_id FROM public.company_addresses
   WHERE organization_id=_org AND company_id=q.company_id AND type='BILLING' AND is_primary LIMIT 1;
  SELECT name INTO v_term FROM public.commercial_payment_terms WHERE id=nullif(q.payment_terms_snapshot->>'id','')::uuid AND organization_id=_org;
  IF v_term IS NULL AND nullif(q.payment_terms_snapshot->>'name','') IS NOT NULL THEN
   -- A condição do aceite pode ser um texto livre que não existe mais no
   -- catálogo. Ela é preservada como texto, sem inventar um cadastro.
   v_term:=q.payment_terms_snapshot->>'name';
  END IF;

  -- Precos, quantidades e condições vem da VERSÃO ACEITA, congelados.
  FOR it IN SELECT * FROM public.sales_quote_items WHERE organization_id=_org AND quote_id=q.id ORDER BY created_at LOOP
   v_subtotal:=v_subtotal+it.total;
   items:=items||jsonb_build_object(
    'product_variant_id',it.variant_id,'sku_snapshot',coalesce(it.product_snapshot->>'sku',''),
    'description_snapshot',coalesce(it.product_snapshot->>'description',it.product_snapshot->>'name',''),
    'unit_snapshot',coalesce(it.product_snapshot->>'unit','un'),
    'ordered_quantity',it.quantity,'unit_price',it.unit_price,'discount_amount',0,
    'tax_amount',0,'line_total',it.total,'price_snapshot',it.price_snapshot,
    'expected_delivery_date',null);
  END LOOP;
  IF jsonb_array_length(items)<1 THEN RAISE EXCEPTION 'Proposta aceita não possui itens.'; END IF;
  v_subtotal:=round(coalesce(q.subtotal,v_subtotal),2);
  v_discount:=round(coalesce(q.discount_amount,0),2); v_tax:=round(coalesce(q.tax_amount,0),2);

  v_number:=public.sales_next_number(_org,'order');
  v_snapshot:=jsonb_build_object('quote_number',q.quote_number,'quote_version',q.version,'quote_total',q.total,
      'discount_percent',q.discount_percent,'discount_amount',q.discount_amount,
      'accepted_at',q.accepted_at,'accepted_by',q.accepted_by,'acceptance_contact_id',q.acceptance_contact_id,
      'contact_name',(SELECT name FROM public.company_contacts WHERE id=q.acceptance_contact_id),
      'payment_terms',q.payment_terms_snapshot,'items',items);
  INSERT INTO public.sales_orders(organization_id,order_number,company_id,customer_profile_id,
   sales_quote_id,sales_quote_version,sales_opportunity_id,representative_id,price_table_id,
   source_type,order_date,payment_terms_id,payment_terms_snapshot,shipping_address_id,billing_address_id,
   address_snapshot,company_snapshot,price_snapshot,created_by)
  VALUES(_org,v_number,q.company_id,v_profile,q.id,q.version,q.opportunity_id,v_rep,v_table,
   'QUOTE_CONVERSION',current_date,v_terms_id,coalesce(q.payment_terms_snapshot->>'description',v_term),v_addr_id,v_bill_id,
   v_addr,(SELECT to_jsonb(c) FROM public.companies c WHERE c.id=q.company_id),v_snapshot,auth.uid())
  RETURNING id INTO v_order_id;
  INSERT INTO public.sales_order_items(organization_id,sales_order_id,product_variant_id,
    sku_snapshot,description_snapshot,unit_snapshot,price_snapshot,ordered_quantity,
    unit_price,discount_amount,tax_amount,line_total,created_by)
  SELECT _org,v_order_id,x.product_variant_id,
    coalesce(nullif(x.sku_snapshot,''),v.sku),
    coalesce(nullif(x.description_snapshot,''),pr.name||' — '||v.sku),
    x.unit_snapshot,coalesce(x.price_snapshot,'{}'::jsonb),x.ordered_quantity,x.unit_price,
    x.discount_amount,x.tax_amount,x.line_total,auth.uid()
  FROM jsonb_to_recordset(items) AS x(product_variant_id uuid,sku_snapshot text,description_snapshot text,
    unit_snapshot text,price_snapshot jsonb,ordered_quantity numeric,unit_price numeric,
    discount_amount numeric,tax_amount numeric,line_total numeric)
  JOIN public.product_variants v ON v.id=x.product_variant_id
  JOIN public.products pr ON pr.id=v.product_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Itens da proposta não conferem com o catálogo.'; END IF;

  UPDATE public.sales_orders SET subtotal=v_subtotal,discount_total=v_discount,tax_amount=v_tax,
   freight_amount=v_freight,total_amount=round(v_subtotal-v_discount+v_tax+v_freight,2)
  WHERE id=v_order_id;
  result:=jsonb_build_object('id',v_order_id,'order_number',v_number,'status','DRAFT','deduped',false);
  PERFORM public.sales_audit(_org,'sales_order.quote_converted','sales_orders',v_order_id,
    jsonb_build_object('sales_quote_id',q.id,'version',q.version,'total',q.total,'order_number',v_number));
  PERFORM public.sales_emit(_org,'SALES_ORDER_CREATED','sales_order_created:'||v_order_id,
    jsonb_build_object('sales_order_id',v_order_id,'order_number',v_number,
      'company_id',q.company_id,'source_type','QUOTE_CONVERSION','sales_quote_id',q.id));
 END IF;
 INSERT INTO public.sales_order_operation_keys(organization_id,operation_key,operation,payload,result,created_by)
 VALUES(_org,_key,'sales_convert_quote',payload,result,auth.uid());
 RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_validate_order(_org uuid,_order uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; cfg jsonb; i jsonb; it public.sales_order_items; issues jsonb:='[]'::jsonb; v_pct numeric;
 v_discount_pct numeric; v_auth numeric; v_sep boolean; v_credit jsonb; v_contact uuid;
BEGIN
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 cfg:=public.sales_settings(_org);

 -- Cliente ativo.
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=o.company_id AND organization_id=_org AND status='ACTIVE')
    OR NOT EXISTS(SELECT 1 FROM public.customer_profiles
       WHERE organization_id=_org AND company_id=o.company_id AND commercial_status='ACTIVE') THEN
  issues:=issues||jsonb_build_object('code','CUSTOMER_INACTIVE','message','Cliente inativo ou bloqueado.');
 END IF;
 -- Itens: variante valida e quantidade positiva ja garantidas na criacao.
 IF NOT EXISTS(SELECT 1 FROM public.sales_order_items WHERE organization_id=_org AND sales_order_id=_order) THEN
  issues:=issues||jsonb_build_object('code','NO_ITEMS','message','Pedido sem itens.');
 END IF;
 FOR it IN SELECT * FROM public.sales_order_items WHERE organization_id=_org AND sales_order_id=_order LOOP
  IF NOT EXISTS(SELECT 1 FROM public.product_variants
     WHERE id=it.product_variant_id AND organization_id=_org AND status='ACTIVE') THEN
   issues:=issues||jsonb_build_object('code','VARIANT_INVALID','variant_id',it.product_variant_id,
     'blocking',true,'message',format('A variante %s está inativa ou descontinuada.',it.sku_snapshot));
  END IF;
  IF it.unit_price<0 THEN
   issues:=issues||jsonb_build_object('code','PRICE_INVALID','variant_id',it.product_variant_id,'message','Preço inválido.');
  END IF;
  -- Preço abaixo do mínimo vigente da tabela exige autorização específica.
  IF coalesce((it.price_snapshot->>'below_minimum')::boolean,false) THEN
   IF cfg->>'price_override_policy'='BLOCK' THEN
    issues:=issues||jsonb_build_object('code','PRICE_BELOW_MINIMUM','variant_id',it.product_variant_id,
      'message',format('Preço abaixo do mínimo da tabela em %s.',it.sku_snapshot),'blocking',true);
   ELSE
    issues:=issues||jsonb_build_object('code','PRICE_BELOW_MINIMUM','variant_id',it.product_variant_id,
      'message',format('Preço abaixo do mínimo em %s exige autorização.',it.sku_snapshot),'requires_authorization',true);
   END IF;
  END IF;
 END LOOP;
 -- Desconto acima da alçada. A alcada oficial é a do MASTER 012.
 v_discount_pct:=CASE WHEN o.subtotal>0 THEN round(o.discount_total/o.subtotal*100,2) ELSE 0 END;
 v_pct:=nullif(cfg->>'max_discount_percent','')::numeric;
 IF v_pct IS NULL THEN
  SELECT a.max_discount_percent INTO v_auth FROM public.commercial_discount_authorities a
   WHERE a.organization_id=_org AND a.user_id=o.created_by;
 END IF;
 v_pct:=coalesce(v_pct,v_auth);
 IF v_discount_pct>0 AND (v_pct IS NULL OR v_discount_pct>v_pct) THEN
  issues:=issues||jsonb_build_object('code','DISCOUNT_ABOVE_AUTHORITY','message',
    format('Desconto de %s%% excede o limite de %s%%.',v_discount_pct::text,v_pct::text),'blocking',true);
 END IF;
 -- Condição de pagamento e endereço de entrega.
 IF o.payment_terms_snapshot IS NULL THEN
  issues:=issues||jsonb_build_object('code','PAYMENT_TERMS_MISSING','message','Condição de pagamento não definida.');
 END IF;
 IF coalesce((cfg->>'require_shipping_address')::boolean,true) AND o.shipping_address_id IS NULL THEN
  issues:=issues||jsonb_build_object('code','SHIPPING_ADDRESS_MISSING','message','Endereço de entrega é obrigatório.','blocking',true);
 END IF;
 -- Contato do aceite: a proposta aceita ja exigiu um, mas o pedido manual nao.
 IF o.sales_quote_id IS NOT NULL THEN
  SELECT q.acceptance_contact_id INTO v_contact FROM public.sales_quotes q WHERE q.id=o.sales_quote_id;
  IF v_contact IS NULL THEN
   issues:=issues||jsonb_build_object('code','ACCEPTANCE_CONTACT_MISSING','message','Proposta aceita sem contato de aceite.');
  END IF;
 END IF;
 v_sep:=coalesce((cfg->>'approval_segregation')::boolean,true) AND o.created_by=auth.uid();
 IF v_sep THEN
  issues:=issues||jsonb_build_object('code','SEGREGATION_OF_DUTIES','requires_authorization',true,
    'message','Segregação de funções: não é permitido aprovar pedido criado por você.');
 END IF;
 v_credit:=public.sales_credit_check(_org,o.company_id,o.total_amount,o.id);
 IF (v_credit->>'blocked')::boolean THEN
  issues:=issues||jsonb_build_object('code','CREDIT_BLOCKED','blocking',true,
    'message','Crédito insuficiente: '||(SELECT string_agg(value,'; ') FROM jsonb_array_elements_text(v_credit->'blocked_reasons')),
    'credit',v_credit);
 END IF;
 RETURN jsonb_build_object('valid',NOT EXISTS(SELECT 1 FROM jsonb_array_elements(issues) x
    WHERE x->>'blocking'='true' OR x->>'requires_authorization'='true'),
   'issues',issues,'credit',v_credit,
   'discount_percent',v_discount_pct);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_order_action(_org uuid,_order uuid,_action text,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; v_new text; v_check jsonb; v_now timestamptz:=now();
 v_perm text; v_reason text; v_policy jsonb; v_cfg jsonb; v_item jsonb;
BEGIN
 v_perm:=CASE _action
  WHEN 'submit' THEN 'sales_orders.update' WHEN 'approve' THEN 'sales_orders.approve'
  WHEN 'cancel' THEN 'sales_orders.cancel' WHEN 'close' THEN 'sales_orders.update'
  WHEN 'reopen' THEN 'sales_orders.update' ELSE NULL END;
 IF v_perm IS NULL THEN RAISE EXCEPTION 'Ação inválida.'; END IF;
 PERFORM public.sales_require(_org,v_perm);
 PERFORM public.inventory_lock(_org);
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 v_reason:=nullif(trim(coalesce(_data->>'reason','')),'');
 v_cfg:=public.sales_settings(_org);

 IF _action='submit' THEN
  IF o.status<>'DRAFT' THEN RAISE EXCEPTION 'Somente rascunhos podem ser submetidos.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.sales_order_items WHERE organization_id=_org AND sales_order_id=_order) THEN
   RAISE EXCEPTION 'Pedido sem itens.';
  END IF;
  -- A validação comercial roda no submit: o pedido só entra na fila se o
  -- mínimo comercial está presente. Bloqueios duros ficam para a aprovação.
  v_check:=public.sales_validate_order(_org,_order);
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_check->'issues') x WHERE x->>'blocking'='true'
      AND x->>'code'<>'CREDIT_BLOCKED') THEN
   RAISE EXCEPTION 'Pedido não atende aos requisitos comerciais: %',
    (SELECT string_agg(x->>'message','; ') FROM jsonb_array_elements(v_check->'issues') x
     WHERE x->>'blocking'='true' AND x->>'code'<>'CREDIT_BLOCKED');
  END IF;
  v_new:='PENDING_APPROVAL';

 ELSIF _action='approve' THEN
  IF o.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Somente pedidos pendentes podem ser aprovados.'; END IF;
  -- A consulta de credito e refeita e PRESERVADA no instante da aprovacao.
  v_check:=public.sales_validate_order(_org,_order);
  v_policy:=jsonb_build_object('issues',v_check->'issues','credit',v_check->'credit',
    'settings',jsonb_build_object('approval_segregation',v_cfg->>'approval_segregation',
      'max_discount_percent',v_cfg->>'max_discount_percent','price_override_policy',v_cfg->>'price_override_policy'),
    'decision','APPROVED');
  IF (v_check->'credit'->>'blocked')::boolean THEN
   v_policy:=v_policy||jsonb_build_object('decision','BLOCKED');
   INSERT INTO public.sales_credit_checks(organization_id,sales_order_id,company_id,evaluated_amount,
     credit_limit,open_receivables,overdue_amount,open_order_exposure,exposure_policy,decision,
     blocked_reasons,result,created_by)
   VALUES(_org,_order,o.company_id,o.total_amount,
     nullif(v_check->'credit'->>'credit_limit','')::numeric,
     coalesce((v_check->'credit'->>'open_receivables')::numeric,0),
     coalesce((v_check->'credit'->>'overdue_amount')::numeric,0),
     coalesce((v_check->'credit'->>'open_order_exposure')::numeric,0),
     v_check->'credit'->>'exposure_policy','BLOCKED',
     ARRAY(SELECT jsonb_array_elements_text(v_check->'credit'->'blocked_reasons')),
     v_check->'credit',auth.uid());
   RAISE EXCEPTION 'Crédito insuficiente: %',(SELECT string_agg(value,'; ') FROM jsonb_array_elements_text(v_check->'credit'->'blocked_reasons'));
  END IF;
  INSERT INTO public.sales_credit_checks(organization_id,sales_order_id,company_id,evaluated_amount,
    credit_limit,open_receivables,overdue_amount,open_order_exposure,exposure_policy,decision,
    blocked_reasons,result,created_by)
  VALUES(_org,_order,o.company_id,o.total_amount,
    nullif(v_check->'credit'->>'credit_limit','')::numeric,
    coalesce((v_check->'credit'->>'open_receivables')::numeric,0),
    coalesce((v_check->'credit'->>'overdue_amount')::numeric,0),
    coalesce((v_check->'credit'->>'open_order_exposure')::numeric,0),
    v_check->'credit'->>'exposure_policy','APPROVED','{}'::text[],v_check->'credit',auth.uid());
  -- Excecoes exigem autorizacao especifica e motivo registrado.
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_check->'issues') x
      WHERE x->>'requires_authorization'='true' OR x->>'blocking'='true') THEN
   IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A aprovação exige motivo: %',(SELECT string_agg(x->>'message','; ')
     FROM jsonb_array_elements(v_check->'issues') x
     WHERE x->>'requires_authorization'='true' OR x->>'blocking'='true');
   END IF;
   IF NOT public.has_permission(_org,'commercial_sensitive.read') THEN
    RAISE EXCEPTION 'Exceção comercial exige autorização de alçada (commercial_sensitive.read).';
   END IF;
   v_policy:=v_policy||jsonb_build_object('decision','OVERRIDDEN','overrides',v_check->'issues','reason',v_reason);
  END IF;
  v_new:='APPROVED';
  UPDATE public.sales_orders SET status=v_new,approved_by=auth.uid(),approved_at=v_now,
   credit_check_result=v_check->'credit',credit_checked_at=v_now,approval_policy=v_policy,
   submitted_at=coalesce(o.submitted_at,v_now),updated_at=v_now WHERE id=_order;
  -- Quantidade aprovada e a quantidade ordenada; a aprovacao nao corta linha.
  UPDATE public.sales_order_items SET approved_quantity=ordered_quantity,updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order;
  -- Demanda confirmada para o planejamento (MASTER 011). Dupla contagem e
  -- marcada quando a mesma demanda ja estava em previsao comercial.
  INSERT INTO public.sales_demands(organization_id,sales_order_id,sales_order_item_id,variant_id,
    requested_quantity,required_date,source_type,already_in_forecast,status,created_at,updated_at)
  SELECT _org,_order,it.id,it.product_variant_id,it.approved_quantity,
    coalesce(it.expected_delivery_date,o.expected_delivery_date,o.order_date),
    CASE WHEN it.sourcing_type='MAKE_TO_ORDER' THEN 'MAKE_TO_ORDER' ELSE 'SALES_ORDER' END,
    coalesce((SELECT true FROM public.sales_opportunities op
      WHERE op.organization_id=_org AND op.company_id=o.company_id AND op.status='OPEN'
        AND EXISTS(SELECT 1 FROM public.opportunity_items oi
                   WHERE oi.organization_id=_org AND oi.opportunity_id=op.id AND oi.variant_id=it.product_variant_id)
      LIMIT 1),false),'OPEN',v_now,v_now
  FROM public.sales_order_items it WHERE it.organization_id=_org AND it.sales_order_id=_order
  ON CONFLICT(organization_id,sales_order_item_id) DO NOTHING;
  -- O gatilho financeiro é configurável. Aprovação só gera título quando a
  -- política explicitamente diz ON_APPROVAL. O padrão é a expedição.
  IF v_cfg->>'receivable_trigger'='ON_APPROVAL' THEN
   PERFORM public.sales_create_receivables(_org,_order,'ON_APPROVAL');
  END IF;
  PERFORM public.sales_emit(_org,'SALES_ORDER_APPROVED','sales_order_approved:'||_order,
   jsonb_build_object('sales_order_id',_order,'order_number',o.order_number,'company_id',o.company_id,
     'total',o.total_amount,'currency',o.currency,'approved_by',auth.uid(),'credit',v_check->'credit'));

 ELSIF _action='cancel' THEN
  IF o.status IN ('CANCELED','CLOSED') THEN RAISE EXCEPTION 'Pedido já encerrado.'; END IF;
  IF v_reason IS NULL THEN RAISE EXCEPTION 'Motivo do cancelamento é obrigatório.'; END IF;
  -- Expedição existente NUNCA e apagada: movimentos físicos são fato.
  IF EXISTS(SELECT 1 FROM public.shipments WHERE organization_id=_org AND sales_order_id=_order
      AND status NOT IN ('DRAFT','CANCELED')) THEN
   RAISE EXCEPTION 'Pedido com expedição não pode ser cancelado. Cancele apenas o saldo pendente.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.account_receivables WHERE organization_id=_org AND source_type='SALE' AND source_id=_order::text AND status<>'CANCELED') THEN RAISE EXCEPTION 'Regularize a obrigação financeira antes de cancelar o pedido.'; END IF;
  v_new:='CANCELED';
  -- Reserva liberada: reserva cancelada nao volta a ser disponibilidad.
  UPDATE public.inventory_reservations SET status='CANCELED',released_quantity=quantity,
   released_at=v_now,release_reason=coalesce(v_reason,'Pedido cancelado'),updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND status IN ('ACTIVE','PARTIALLY_CONSUMED');
  UPDATE public.sales_order_items SET status='CANCELED',reserved_quantity=0,updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND status<>'FULFILLED';
  UPDATE public.sales_demands SET status='CANCELED',updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND status<>'CLOSED';
  UPDATE public.fulfillment_orders SET status='CANCELED',cancel_reason=v_reason,updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND status IN ('DRAFT','READY_FOR_PICKING','PICKING','PICKED','PACKING');
  UPDATE public.picking_tasks SET status='CANCELED',updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND status IN ('PENDING','IN_PROGRESS','PICKED');
  UPDATE public.sales_orders SET status=v_new,canceled_at=v_now,cancel_reason=v_reason,
   stock_status='NOT_EVALUATED',updated_at=v_now WHERE id=_order;

 ELSIF _action='close' THEN
  IF o.status NOT IN ('FULFILLED','PARTIALLY_FULFILLED') THEN
   RAISE EXCEPTION 'Somente pedido com expedição pode ser fechado.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.shipments WHERE organization_id=_org AND sales_order_id=_order
      AND status IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED')) THEN
   RAISE EXCEPTION 'Há expedições em trânsito. Feche apenas após a entrega.';
  END IF;
  IF EXISTS(SELECT 1 FROM public.sales_order_items WHERE sales_order_id=_order AND fulfilled_quantity<approved_quantity AND status<>'CANCELED') THEN RAISE EXCEPTION 'Pedido possui saldo pendente.'; END IF;
  v_new:='CLOSED';
  UPDATE public.sales_orders SET status=v_new,closed_at=v_now,updated_at=v_now WHERE id=_order;
  UPDATE public.sales_demands SET status='CLOSED',updated_at=v_now
   WHERE organization_id=_org AND sales_order_id=_order AND pending_quantity<=0;
 ELSIF v_new IS NULL THEN RAISE EXCEPTION 'Transição inválida.'; END IF;

 IF _action<>'approve' THEN
  UPDATE public.sales_orders SET status=v_new,updated_at=v_now
   WHERE id=_order AND status<>v_new;
  IF _action='submit' THEN UPDATE public.sales_orders SET submitted_at=v_now WHERE id=_order; END IF;
 END IF;
 INSERT INTO public.sales_order_status_history(organization_id,sales_order_id,previous_status,new_status,reason,details,created_by)
 VALUES(_org,_order,o.status,v_new,v_reason,coalesce(_data,'{}'::jsonb),auth.uid());
 PERFORM public.sales_audit(_org,'sales_order.'||_action,'sales_orders',_order,
   jsonb_build_object('from',o.status,'to',v_new,'reason',v_reason));
 IF _action='cancel' THEN
  PERFORM public.sales_emit(_org,'SALES_ORDER_CANCELED','sales_order_canceled:'||_order||':'||extract(epoch from v_now)::bigint,
   jsonb_build_object('sales_order_id',_order,'order_number',o.order_number,'reason',v_reason));
 END IF;
 RETURN jsonb_build_object('id',_order,'status',v_new);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_credit_check(_org uuid,_company uuid,_amount numeric,_order uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE pos jsonb; cfg jsonb; v_limit numeric; v_open numeric; v_overdue numeric;
 v_policy text; v_orders numeric; v_exposure numeric; v_available numeric; v_blocked text[]:='{}'::text[];
 v_decision text;
BEGIN
 pos:=public.crm_financial_position(_org,_company);
 cfg:=public.sales_settings(_org); v_policy:=cfg->>'credit_exposure_policy';
 v_limit:=(pos->>'credit_limit')::numeric;
 v_open:=coalesce((pos->>'open_amount')::numeric,0);
 v_overdue:=coalesce((pos->>'overdue_amount')::numeric,0);
 -- Exclusao do proprio pedido: um pedido reavaliado nao conta a si mesmo.
 v_orders:=coalesce((SELECT sum(greatest(0,o.total_amount-public.sales_receivable_total(_org,o.id))) FROM public.sales_orders o
   WHERE o.organization_id=_org AND o.company_id=_company AND o.status IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT','PARTIALLY_FULFILLED')
     AND (_order IS NULL OR o.id<>_order)),0);
 v_exposure:=v_open+CASE WHEN v_policy='OPEN_RECEIVABLES_PLUS_OPEN_ORDERS' THEN v_orders ELSE 0 END;
 v_available:=CASE WHEN v_limit IS NULL THEN NULL ELSE v_limit-v_exposure-coalesce(_amount,0) END;

 IF coalesce((pos->>'block_overdue')::boolean,false) AND v_overdue>0 THEN
   v_blocked:=v_blocked||format('Cliente possui %s em atraso.',v_overdue::text);
 END IF;
 IF v_limit IS NOT NULL AND coalesce((pos->>'block_over_limit')::boolean,false) AND v_available<0 THEN
   v_blocked:=array_append(v_blocked,'Política do cliente bloqueia operação acima do limite.');
 END IF;

 v_decision:=CASE WHEN cardinality(v_blocked)>0 THEN 'BLOCKED' ELSE 'APPROVED' END;
 RETURN jsonb_build_object(
  'company_id',_company,'evaluated_amount',coalesce(_amount,0),
  'credit_limit',v_limit,'open_receivables',v_open,'overdue_amount',v_overdue,
  'open_order_exposure',CASE WHEN v_policy='OPEN_RECEIVABLES_PLUS_OPEN_ORDERS' THEN v_orders ELSE 0 END,
  'exposure',v_exposure,'exposure_policy',v_policy,'credit_available',v_available,
  'blocked',v_decision='BLOCKED','blocked_reasons',to_jsonb(v_blocked),
  'decision',v_decision,'evaluated_at',now(),
  'sources',jsonb_build_object('receivables','account_receivables','credit_policy','customer_credit_policies','open_orders','sales_orders'),
  'note','Propostas e oportunidades não são dívida: não contam como exposição.');
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_shipment_dispatch(_org uuid,_shipment uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sh public.shipments; o public.sales_orders; cfg jsonb; si record; v_now timestamptz:=now();
 v_key text; v_mov jsonb; v_mov_id uuid; v_res uuid; v_consumed numeric; v_out jsonb:='[]'::jsonb;
 v_deduped boolean; v_fin_trigger text; v_fin_created integer:=0; v_total numeric:=0;
 v_ord_status text; v_ord_ful text; v_req numeric; v_fulfilled numeric; v_ful uuid;
 v_carrier uuid; v_tracking text; v_expected timestamptz;
BEGIN
 PERFORM public.sales_require(_org,'shipments.dispatch');
 -- Baixa de estoque e uma operacao de inventario: exige as duas permissoes.
 PERFORM public.sales_require(_org,'inventory.move');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO sh FROM public.shipments WHERE id=_shipment AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expedição não encontrada.'; END IF;
 IF sh.status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','PARTIALLY_DELIVERED') THEN
  -- Reenvio da mesma expedicao nunca duplica a baixa.
  IF _data->>'dispatch_key' IS NULL OR _data->>'dispatch_key'=sh.dispatch_key THEN
   RETURN jsonb_build_object('id',_shipment,'shipment_number',sh.shipment_number,'status',sh.status,
     'deduped',true,'movements',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'sales_order_item_id',sit.sales_order_item_id,'quantity',sit.quantity,
       'inventory_movement_id',sit.inventory_movement_id))
       FROM public.shipment_items sit WHERE sit.organization_id=_org AND sit.shipment_id=_shipment),'[]'::jsonb));
  END IF;
  RAISE EXCEPTION 'Expedição % já despachada; use uma nova expedição para o saldo restante.',sh.shipment_number;
 END IF;
 IF sh.status NOT IN ('DRAFT','READY') THEN
  RAISE EXCEPTION 'Somente expedição em DRAFT ou READY pode ser despachada (status: %).',sh.status;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shipment_items
    WHERE organization_id=_org AND shipment_id=_shipment AND quantity>0) THEN
  RAISE EXCEPTION 'Expedição sem itens para despachar.';
 END IF;
 SELECT * INTO o FROM public.sales_orders WHERE id=sh.sales_order_id AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.status IN ('CANCELED','CLOSED') THEN RAISE EXCEPTION 'Pedido % não pode ser expedido.',o.status; END IF;

 v_carrier:=coalesce(nullif(_data->>'carrier_id','')::uuid,sh.carrier_id);
 v_tracking:=coalesce(nullif(trim(coalesce(_data->>'tracking_code','')),''),sh.tracking_code);
 v_expected:=coalesce(nullif(_data->>'expected_delivery_at','')::timestamptz,sh.expected_delivery_at);
 v_key:=coalesce(nullif(_data->>'dispatch_key','')::text,'sales:dispatch:'||_shipment);
 v_ful:=sh.fulfillment_order_id;
 cfg:=public.sales_settings(_org);

 -- Uma baixa por item. A chave do movimento e derivada da expedicao, do item
 -- e do lote: repetir a chamada NUNCA cria uma segunda baixa.
 FOR si IN SELECT * FROM public.shipment_items
   WHERE organization_id=_org AND shipment_id=_shipment AND quantity>0 ORDER BY sku_snapshot LOOP
  v_mov:=public.inventory_post_movement(
    _org,si.variant_id,sh.source_location_id,'SALE',si.quantity,
    'Venda direta '||sh.shipment_number,now(),'un','SALE_SHIPMENT',_shipment,si.batch_id,
    'sales:dispatch:'||_shipment||':'||si.sales_order_item_id||':'||coalesce(si.batch_id::text,'*'),
    'OUT',auth.uid(),false);
  v_mov_id:=nullif(v_mov->>'movement_id','')::uuid;
  v_deduped:=coalesce((v_mov->>'deduped')::boolean,false);
  IF v_mov_id IS NULL THEN
   RAISE EXCEPTION 'Falha ao registrar a baixa de estoque do item %.',si.sku_snapshot;
  END IF;
  IF NOT v_deduped AND si.inventory_movement_id IS NOT NULL AND si.inventory_movement_id<>v_mov_id THEN
   RAISE EXCEPTION 'Item % já possui baixa %s. Expedição inconsistente.',si.sku_snapshot,si.inventory_movement_id;
  END IF;
  UPDATE public.shipment_items SET inventory_movement_id=v_mov_id WHERE id=si.id;
  -- Consome a reserva vinculada. Reserva eje LOWA FISICA: nao altera saldo.
  v_res:=si.reservation_id;
  IF v_res IS NOT NULL THEN
   UPDATE public.inventory_reservations SET fulfilled_quantity=fulfilled_quantity+si.quantity,
     status=CASE WHEN fulfilled_quantity+si.quantity>=quantity THEN 'CONSUMED' ELSE 'PARTIALLY_CONSUMED' END,
     consumed_at=CASE WHEN fulfilled_quantity+si.quantity>=quantity THEN v_now ELSE consumed_at END,
     updated_at=v_now
   WHERE id=v_res AND status IN ('ACTIVE','PARTIALLY_CONSUMED')
     AND fulfilled_quantity+si.quantity<=quantity;
   IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva do item % insuficiente para a expedição.',si.sku_snapshot;
   END IF;
  END IF;
  v_out:=v_out||jsonb_build_object('sales_order_item_id',si.sales_order_item_id,'sku',si.sku_snapshot,
    'quantity',si.quantity,'batch_id',si.batch_id,'inventory_movement_id',v_mov_id,
    'reservation_id',v_res,'deduped',v_deduped);
  v_total:=v_total+si.quantity;
 END LOOP;

 UPDATE public.shipments SET status='DISPATCHED',dispatch_key=v_key,dispatched_at=coalesce(dispatched_at,v_now),
   carrier_id=v_carrier,tracking_code=v_tracking,
   tracking_source=coalesce(nullif(_data->>'tracking_source',''),sh.tracking_source,'MANUAL'),
   expected_delivery_at=v_expected,updated_at=v_now WHERE id=_shipment;
 IF v_ful IS NOT NULL THEN
  UPDATE public.fulfillment_orders SET status='SHIPPED',completed_at=coalesce(completed_at,v_now),updated_at=v_now
   WHERE id=v_ful AND status<>'CANCELED';
 END IF;
 -- Item do pedido: expedido e o que saiu do estoque.
 UPDATE public.sales_order_items i SET fulfilled_quantity=i.fulfilled_quantity+shi.quantity,
   reserved_quantity=greatest(0,i.reserved_quantity-shi.quantity),
   status=CASE WHEN i.fulfilled_quantity+shi.quantity>=coalesce(NULLIF(i.approved_quantity,0),i.ordered_quantity)
     THEN 'FULFILLED' ELSE 'PARTIALLY_FULFILLED' END,
   updated_at=v_now
 FROM public.shipment_items shi
 WHERE shi.organization_id=_org AND shi.shipment_id=_shipment AND shi.sales_order_item_id=i.id;
 UPDATE public.sales_order_items i SET reserved_quantity=coalesce((
    SELECT sum(greatest(0,r.quantity-r.fulfilled_quantity-r.released_quantity))
    FROM public.inventory_reservations r WHERE r.sales_order_item_id=i.id
      AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')),0),updated_at=v_now
  WHERE i.organization_id=_org AND i.sales_order_id=o.id;
 -- Estado do pedido: tudo expedido ou parcial?
 SELECT coalesce(sum(fulfilled_quantity),0),coalesce(sum(coalesce(NULLIF(approved_quantity,0),ordered_quantity)),0)
  INTO v_fulfilled,v_req FROM public.sales_order_items
  WHERE organization_id=_org AND sales_order_id=o.id AND status<>'CANCELED';
 v_ord_status:=CASE WHEN v_fulfilled>=v_req THEN 'FULFILLED' ELSE 'PARTIALLY_FULFILLED' END;
 v_ord_ful:=CASE WHEN v_fulfilled>=v_req THEN 'COMPLETE' ELSE 'PARTIAL' END;
 UPDATE public.sales_orders SET status=CASE WHEN o.status IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT')
     THEN v_ord_status WHEN o.status='PARTIALLY_FULFILLED' THEN v_ord_status ELSE o.status END,
   fulfillment_status=v_ord_ful,updated_at=v_now WHERE id=o.id;

 -- Financeiro: gatilho ON_DISPATCH gera titulo apenas do saldo expedido.
 v_fin_trigger:=coalesce(cfg->>'receivable_trigger','ON_DISPATCH');
 IF v_fin_trigger='ON_DISPATCH' THEN
  v_fin_created:=public.sales_create_receivables(_org,o.id,'ON_DISPATCH');
 END IF;

 PERFORM public.sales_emit(_org,'SHIPMENT_DISPATCHED','shipment:'||_shipment,
   jsonb_build_object('shipment_id',_shipment,'shipment_number',sh.shipment_number,'sales_order_id',o.id,
     'tracking_code',v_tracking,'carrier_id',v_carrier,'quantity',v_total,'expected_delivery_at',v_expected));
 PERFORM public.sales_emit(_org,'SALES_ORDER_STATUS_CHANGED','sales_order:'||o.id,
   jsonb_build_object('sales_order_id',o.id,'status',v_ord_status,'fulfillment_status',v_ord_ful));
 PERFORM public.sales_audit(_org,'shipment.dispatched','shipments',_shipment,
   jsonb_build_object('sales_order_id',o.id,'dispatch_key',v_key,'movements',v_out,
     'tracking_code',v_tracking,'carrier_id',v_carrier,'expected_delivery_at',v_expected,
     'receivable_trigger',v_fin_trigger,'receivables_created',v_fin_created));
 RETURN jsonb_build_object('id',_shipment,'shipment_number',sh.shipment_number,'status','DISPATCHED',
   'dispatch_key',v_key,'movements',v_out,'quantity',v_total,
   'sales_order_status',v_ord_status,'fulfillment_status',v_ord_ful,
   'receivables_created',v_fin_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_exception_action(_org uuid,_exception uuid,_action text,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ex public.logistics_exceptions; v_new text; v_resolution text; v_assigned uuid;
 v_status text; v_notes text;
BEGIN
 -- Ler ocorrencia e livre; tratar ocorrencia exige permissao propria.
 PERFORM public.sales_require(_org,'logistics.exceptions');
 SELECT * INTO ex FROM public.logistics_exceptions WHERE id=_exception AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ocorrência não encontrada.'; END IF;
 IF ex.status IN ('RESOLVED','IGNORED') AND _action NOT IN ('reopen') THEN
  RETURN jsonb_build_object('id',_exception,'status',ex.status,'deduped',true);
 END IF;
 v_resolution:=nullif(trim(coalesce(_data->>'resolution',_data->>'notes','')),'');
 v_assigned:=nullif(_data->>'assigned_to','')::uuid;
 v_status:=coalesce(nullif(_data->>'status',''),_action);
 IF _action='assign' THEN
  IF v_assigned IS NULL THEN RAISE EXCEPTION 'Informe o responsável.'; END IF;
  v_new:=CASE WHEN ex.status='OPEN' THEN 'IN_REVIEW' ELSE ex.status END;
  UPDATE public.logistics_exceptions SET assigned_to=v_assigned,status=v_new,updated_at=now() WHERE id=_exception;
 ELSIF _action IN ('resolve','ignore') THEN
  IF v_resolution IS NULL THEN RAISE EXCEPTION 'Descreva a resolução.'; END IF;
  v_new:=CASE WHEN _action='resolve' THEN 'RESOLVED' ELSE 'IGNORED' END;
  UPDATE public.logistics_exceptions SET status=v_new,resolution=v_resolution,
   resolved_at=now(),updated_at=now() WHERE id=_exception;
 ELSIF _action='reopen' THEN
  v_new:='OPEN';
  UPDATE public.logistics_exceptions SET status=v_new,resolution=NULL,resolved_at=NULL,updated_at=now() WHERE id=_exception;
 ELSE
  v_new:=v_status;
  IF v_new NOT IN ('OPEN','IN_REVIEW','RESOLVED','IGNORED') THEN RAISE EXCEPTION 'Situação inválida.'; END IF;
  UPDATE public.logistics_exceptions SET status=v_new,resolution=coalesce(v_resolution,resolution),
   resolved_at=CASE WHEN v_new IN ('RESOLVED','IGNORED') THEN now() ELSE NULL END,updated_at=now() WHERE id=_exception;
 END IF;
 PERFORM public.sales_audit(_org,'logistics_exception.'||_action,'logistics_exceptions',_exception,
   jsonb_build_object('from',ex.status,'to',v_new,'assigned_to',v_assigned,'resolution',v_resolution));
 RETURN jsonb_build_object('id',_exception,'status',v_new,'assigned_to',v_assigned);
END;
$$;

INSERT INTO public.role_permissions(role,permission) SELECT r,'logistics.exceptions' FROM unnest(ARRAY['admin','gestor']::public.app_role[]) r ON CONFLICT DO NOTHING;

DO $permissions$ DECLARE f record; BEGIN FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'sales_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon',f.signature); IF f.proname=ANY(ARRAY['sales_audit','sales_emit','sales_ensure_settings','sales_next_number','sales_prepare_item','sales_insert_order','sales_validate_order','sales_receivable_total','sales_create_receivables','sales_open_exception','sales_credit_check','sales_settings','sales_guard_relations','sales_immutable']) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated',f.signature); END IF; END LOOP; END $permissions$;

CREATE OR REPLACE FUNCTION public.sales_on_hand(_org uuid,_variant uuid,_location uuid DEFAULT NULL,_batch uuid DEFAULT NULL) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.sales_require(_org,'sales_orders.read');
 RETURN (
 -- Saldo VENDIVEL: mesma regra de local da reserva. Quarentena, inspecao e
 -- estoque de parceiro existem no ledger, mas nao sao estoque a vender. Para o
 -- saldo fisico de um local especifico use public.inventory_get_balance.
 SELECT coalesce(sum(CASE WHEN m.direction='IN' THEN m.quantity ELSE -m.quantity END),0)
 FROM public.inventory_movements m
 JOIN public.inventory_locations l ON l.id=m.location_id AND l.organization_id=m.organization_id
 WHERE m.organization_id=_org AND m.variant_id=_variant AND m.status='POSTED'
 AND l.status='ACTIVE' AND l.partner_id IS NULL AND l.type<>'TRANSIT'
 AND coalesce(l.operational_purpose,'NORMAL')='NORMAL'
 AND (_location IS NULL OR m.location_id=_location)
 AND (_batch IS NULL OR m.batch_id=_batch));
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_reserved(_org uuid,_variant uuid,_location uuid DEFAULT NULL,_batch uuid DEFAULT NULL) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.sales_require(_org,'sales_orders.read');
 RETURN (
 SELECT coalesce(sum(r.quantity-r.fulfilled_quantity-r.released_quantity),0)
 FROM public.inventory_reservations r
 JOIN public.inventory_locations l ON l.id=r.inventory_location_id
 WHERE r.organization_id=_org AND r.variant_id=_variant
 AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')
 AND l.operational_purpose='NORMAL'
 AND l.partner_id IS NULL
 AND (_location IS NULL OR r.inventory_location_id=_location)
 AND (_batch IS NULL OR r.batch_id=_batch));
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_available(_org uuid,_variant uuid,_location uuid DEFAULT NULL,_batch uuid DEFAULT NULL) RETURNS numeric
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.sales_require(_org,'sales_orders.read');
 RETURN (
 SELECT public.sales_on_hand(_org,_variant,_location,_batch) - public.sales_reserved(_org,_variant,_location,_batch));
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_company_activity(_org uuid,_company uuid,_limit integer DEFAULT 50) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM public.sales_require(_org,'sales_orders.read');
 RETURN (
 SELECT jsonb_build_object(
  'orders',coalesce((SELECT jsonb_agg(to_jsonb(o) ORDER BY o.created_at DESC,o.order_number DESC)
    FROM (SELECT so.id,so.order_number,so.status,so.stock_status,so.fulfillment_status,so.order_date,
      so.expected_delivery_date,so.total_amount,so.currency,so.source_type,so.created_at,
      (SELECT coalesce(sum(si.delivered_quantity),0) FROM public.shipment_items si
       JOIN public.shipments s ON s.id=si.shipment_id
       WHERE s.organization_id=_org AND s.sales_order_id=so.id) AS delivered_amount
    FROM public.sales_orders so
    WHERE so.organization_id=_org AND so.company_id=_company
    ORDER BY so.created_at DESC,so.order_number DESC LIMIT greatest(1,least(_limit,200))) o),'[]'::jsonb),
  'shipments',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.created_at DESC,s.shipment_number DESC)
    FROM (SELECT sh.id,sh.shipment_number,sh.status,sh.shipping_method,sh.tracking_code,sh.dispatched_at,
      sh.expected_delivery_at,sh.delivered_quantity,sh.exception_notes,sh.created_at
    FROM public.shipments sh JOIN public.sales_orders o ON o.id=sh.sales_order_id
    WHERE sh.organization_id=_org AND o.company_id=_company
    ORDER BY sh.created_at DESC,sh.shipment_number DESC LIMIT greatest(1,least(_limit,200))) s),'[]'::jsonb),
  'returns',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.requested_at DESC,r.return_number DESC)
    FROM (SELECT cr.id,cr.return_number,cr.status,cr.reason,cr.requested_at,cr.received_at,
      cr.financial_action,cr.financial_requested_at,cr.created_at
    FROM public.customer_returns cr WHERE cr.organization_id=_org AND cr.company_id=_company
    ORDER BY cr.requested_at DESC,cr.return_number DESC LIMIT greatest(1,least(_limit,200))) r),'[]'::jsonb),
  'totals',jsonb_build_object(
      'orders',(SELECT count(*) FROM public.sales_orders so
        WHERE so.organization_id=_org AND so.company_id=_company AND so.status NOT IN ('CANCELED')),
      'amount',(SELECT coalesce(sum(so.total_amount),0) FROM public.sales_orders so
        WHERE so.organization_id=_org AND so.company_id=_company AND so.status NOT IN ('CANCELED')),
      'delivered_amount',(SELECT coalesce(sum(si.delivered_quantity),0)
        FROM public.shipment_items si JOIN public.shipments sh ON sh.id=si.shipment_id
        JOIN public.sales_orders so ON so.id=sh.sales_order_id
        WHERE si.organization_id=_org AND so.company_id=_company
          AND sh.status IN ('DELIVERED','PARTIALLY_DELIVERED'))),
  'note','Dados sempre das tabelas oficiais. Nada é recalculado nem estimado aqui.'));
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_availability(_org uuid,_order uuid,_location uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; it public.sales_order_items; v_json jsonb:='[]'::jsonb;
 v_need numeric; v_reserved numeric; v_onhand numeric; v_avail numeric; v_pend numeric;
 v_mto boolean; loc record; v_here numeric; v_best uuid; v_best_qty numeric:=0; v_best_reserved numeric;
 v_mto_total numeric:=0; v_total_need numeric:=0; v_total_reserved numeric:=0; v_total_avail numeric:=0;
 v_sufficient boolean:=true;
BEGIN
 PERFORM public.sales_require(_org,'sales_orders.read');
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 v_mto:=coalesce((public.sales_settings(_org)->>'make_to_order_enabled')::boolean,true);
 FOR it IN SELECT * FROM public.sales_order_items
   WHERE organization_id=_org AND sales_order_id=_order AND status<>'CANCELED' ORDER BY created_at LOOP
  v_need:=CASE WHEN it.approved_quantity>0 THEN it.approved_quantity ELSE it.ordered_quantity END;
  v_reserved:=it.reserved_quantity;
  v_pend:=greatest(0,v_need-v_reserved);
  v_total_need:=v_total_need+v_need;
  v_total_reserved:=v_total_reserved+v_reserved;
  -- Melhor localizacao autorizada: maior disponivel.
  v_best:=NULL; v_best_qty:=0;
  FOR loc IN SELECT l.id FROM public.inventory_locations l
    WHERE l.organization_id=_org AND l.status='ACTIVE' AND l.operational_purpose='NORMAL'
      AND l.partner_id IS NULL AND (_location IS NULL OR l.id=_location)
      AND l.type<>'TRANSIT' ORDER BY l.name LOOP
   v_here:=public.sales_available(_org,it.product_variant_id,loc.id,NULL);
   IF v_here>v_best_qty THEN v_best_qty:=v_here; v_best:=loc.id; END IF;
  END LOOP;
  v_onhand:=0; v_avail:=0;
  IF v_best IS NOT NULL THEN
   v_onhand:=public.sales_on_hand(_org,it.product_variant_id,v_best,NULL);
   v_avail:=greatest(v_best_qty,0);
  END IF;
  v_total_avail:=v_total_avail+least(v_avail,v_pend);
  IF v_pend>v_avail THEN
   v_sufficient:=false;
   -- Sem estoque e sem ordem de produção: a necessidade pode virar MTO.
   IF v_mto AND it.sourcing_type='STOCK' THEN
    v_mto_total:=v_mto_total+(v_pend-v_avail);
   END IF;
  END IF;
  v_json:=v_json||jsonb_build_object('sales_order_item_id',it.id,'variant_id',it.product_variant_id,
   'sku',it.sku_snapshot,'description',it.description_snapshot,
   'required_quantity',v_need,'reserved_quantity',v_reserved,'pending_quantity',v_pend,
   'suggested_location_id',v_best,'on_hand',v_onhand,'available',v_avail,
   'sufficient',v_pend<=v_avail,'sourcing_type',it.sourcing_type,
   'make_to_order_suggested',v_mto AND it.sourcing_type='STOCK' AND v_pend>v_avail,
   'make_to_order_quantity',CASE WHEN v_mto AND it.sourcing_type='STOCK' THEN greatest(0,v_pend-v_avail) ELSE 0 END);
 END LOOP;
 RETURN jsonb_build_object('sales_order_id',_order,'items',v_json,
  'required_quantity',v_total_need,'reserved_quantity',v_total_reserved,
  'pending_quantity',greatest(0,v_total_need-v_total_reserved),
  'make_to_order_quantity',v_mto_total,
  'sufficient',v_sufficient AND v_mto_total<=0,
  'formula','DISPONÍVEL = SALDO FÍSICO - RESERVAS ATIVAS',
  'checked_at',now());
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_order_detail(_org uuid,_order uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; v_json jsonb; v_perm text;
BEGIN
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 PERFORM public.sales_require(_org,'sales_orders.read');
 SELECT jsonb_build_object(
  'order',to_jsonb(o)-'credit_check_result'-'approval_policy',
  'company',(SELECT to_jsonb(co) FROM public.companies co WHERE co.id=o.company_id),
  'customer_profile',NULL,
  'quote',(SELECT jsonb_build_object('id',q.id,'number',q.quote_number,'version',q.version,'status',q.status)
     FROM public.sales_quotes q WHERE q.id=o.sales_quote_id),
  'representative',(SELECT to_jsonb(r) FROM public.sales_representatives r WHERE r.id=o.representative_id),
  'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.created_at),'[]'::jsonb)
     FROM public.sales_order_items i WHERE i.sales_order_id=o.id),
  'history',(SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.created_at),'[]'::jsonb)
     FROM public.sales_order_status_history h WHERE h.sales_order_id=o.id),
  'reservations',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.reserved_at),'[]'::jsonb)
     FROM public.inventory_reservations r WHERE r.sales_order_id=o.id),
  'fulfillments',(SELECT coalesce(jsonb_agg(to_jsonb(f) ORDER BY f.created_at),'[]'::jsonb)
     FROM public.fulfillment_orders f WHERE f.sales_order_id=o.id),
  'picking_tasks',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at),'[]'::jsonb)
     FROM public.picking_tasks t WHERE t.sales_order_id=o.id),
  'picking_items',(SELECT coalesce(jsonb_agg(to_jsonb(ti) ORDER BY ti.created_at),'[]'::jsonb)
     FROM public.picking_task_items ti WHERE ti.organization_id=_org
       AND ti.picking_task_id IN (SELECT id FROM public.picking_tasks WHERE sales_order_id=o.id)),
  'packings',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.packed_at),'[]'::jsonb)
     FROM public.packing_records p WHERE p.sales_order_id=o.id),
  'shipments',(SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.created_at),'[]'::jsonb)
     FROM public.shipments s WHERE s.sales_order_id=o.id),
  'shipment_items',(SELECT coalesce(jsonb_agg(to_jsonb(si) ORDER BY si.sku_snapshot),'[]'::jsonb)
     FROM public.shipment_items si WHERE si.organization_id=_org
       AND si.shipment_id IN (SELECT id FROM public.shipments WHERE sales_order_id=o.id)),
  'delivery_proofs',(SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.occurred_at),'[]'::jsonb)
     FROM public.shipment_delivery_proofs p WHERE p.organization_id=_org
       AND p.shipment_id IN (SELECT id FROM public.shipments WHERE sales_order_id=o.id)),
  'returns',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.requested_at),'[]'::jsonb)
     FROM public.customer_returns r WHERE r.sales_order_id=o.id),
  'return_items',(SELECT coalesce(jsonb_agg(to_jsonb(ri) ORDER BY ri.created_at),'[]'::jsonb)
     FROM public.customer_return_items ri WHERE ri.organization_id=_org
       AND ri.customer_return_id IN (SELECT id FROM public.customer_returns WHERE sales_order_id=o.id)),
  'exceptions',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at),'[]'::jsonb)
     FROM public.logistics_exceptions e WHERE e.sales_order_id=o.id),
  'receivables',CASE WHEN public.has_permission(_org,'receivables.read') AND public.has_permission(_org,'sales_credit.read') THEN (SELECT coalesce(jsonb_agg(to_jsonb(ar) ORDER BY ar.installment_number),'[]'::jsonb)
     FROM public.account_receivables ar WHERE ar.organization_id=_org
       AND ar.source_type='SALE' AND ar.source_id=o.id::text) ELSE '[]'::jsonb END,
  'movements',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.occurred_at),'[]'::jsonb)
     FROM public.inventory_movements m WHERE m.organization_id=_org
       AND m.reference_type IN ('SALE_SHIPMENT','CUSTOMER_RETURN')
       AND m.reference_id IN (SELECT id FROM public.shipments WHERE sales_order_id=o.id
         UNION SELECT id FROM public.customer_returns WHERE sales_order_id=o.id)),
  'availability',public.sales_availability(_org,o.id),
  'financial_position',CASE WHEN public.has_permission(_org,'receivables.read') AND public.has_permission(_org,'sales_credit.read') THEN public.crm_financial_position(_org,o.company_id) ELSE NULL END,
  'settings',public.sales_settings(_org),
  'actions',jsonb_build_array(
    'submit','approve','reject','cancel','reserve','create_fulfillment','create_shipment',
    'dispatch','track','proof','deliver','create_return','close')
 ) INTO v_json;
 RETURN v_json;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_reserve(_org uuid,_order uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; it public.sales_order_items; i jsonb; cfg jsonb;
 v_policy text; v_need numeric; v_reserved numeric; v_pend numeric; v_avail numeric;
 v_qty numeric; v_loc uuid; v_batch uuid; v_res uuid; v_expires timestamptz; v_created integer:=0;
 v_skipped jsonb:='[]'::jsonb; v_key text; v_status text; v_mto boolean; v_items jsonb;
BEGIN
 PERFORM public.sales_require(_org,'reservations.create');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.status NOT IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT','PARTIALLY_FULFILLED') THEN
  RAISE EXCEPTION 'Somente pedido aprovado pode reservar estoque (status atual: %).',o.status;
 END IF;
 cfg:=public.sales_settings(_org); v_policy:=cfg->>'reservation_policy'; v_mto:=coalesce((cfg->>'make_to_order_enabled')::boolean,true);

 -- Sem lista explicita, a reserva cobre tudo que ainda esta pendente no
 -- pedido. Reserver item a item continua sendo possivel.
 v_items:=coalesce(_data->'items',_data->'lines');
 IF v_items IS NULL THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('sales_order_item_id',it2.id) ORDER BY it2.created_at),'[]'::jsonb)
   INTO v_items
  FROM public.sales_order_items it2
  WHERE it2.organization_id=_org AND it2.sales_order_id=_order AND it2.status<>'CANCELED'
   AND it2.approved_quantity>it2.reserved_quantity+it2.fulfilled_quantity;
 END IF;
 FOR i IN SELECT * FROM jsonb_array_elements(v_items) LOOP
  it:=NULL;
  SELECT * INTO it FROM public.sales_order_items
   WHERE organization_id=_org AND sales_order_id=_order
     AND (CASE WHEN i ? 'sales_order_item_id' THEN id=nullif(i->>'sales_order_item_id','')::uuid
               WHEN i ? 'variant_id' THEN product_variant_id=nullif(i->>'variant_id','')::uuid
               ELSE false END);
  IF it.id IS NULL THEN RAISE EXCEPTION 'Item do pedido não encontrado.'; END IF;
  IF it.status='CANCELED' THEN RAISE EXCEPTION 'Item cancelado não pode ser reservado.'; END IF;
  v_need:=CASE WHEN it.approved_quantity>0 THEN it.approved_quantity ELSE it.ordered_quantity END;
  v_reserved:=it.reserved_quantity;
  v_reserved:=greatest(0,v_reserved);
  v_pend:=greatest(0,v_need-v_reserved-it.fulfilled_quantity);
  IF nullif(i->>'inventory_location_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.inventory_locations WHERE id=(i->>'inventory_location_id')::uuid AND organization_id=_org AND status='ACTIVE' AND operational_purpose='NORMAL' AND partner_id IS NULL AND type NOT IN ('TRANSIT','PARTNER')) THEN RAISE EXCEPTION 'Localização não é autorizada para venda direta.'; END IF;
  IF v_pend<=0 THEN
   v_skipped:=v_skipped||jsonb_build_object('sales_order_item_id',it.id,'reason','ITEM_ALREADY_RESERVED');
   CONTINUE;
  END IF;
  v_loc:=coalesce(nullif(i->>'inventory_location_id','')::uuid,nullif(_data->>'source_location_id','')::uuid);
  v_batch:=nullif(i->>'batch_id','')::uuid;
  IF v_loc IS NULL THEN
   -- Escolhe a localização autorizada com maior disponível do item.
   SELECT l.id INTO v_loc FROM public.inventory_locations l
    WHERE l.organization_id=_org AND l.status='ACTIVE' AND l.operational_purpose='NORMAL'
      AND l.partner_id IS NULL AND l.type<>'TRANSIT'
      AND public.sales_available(_org,it.product_variant_id,l.id,v_batch)>0
    ORDER BY public.sales_available(_org,it.product_variant_id,l.id,v_batch) DESC,l.name LIMIT 1;
  END IF;
  IF v_loc IS NULL THEN
   v_skipped:=v_skipped||jsonb_build_object('sales_order_item_id',it.id,'reason','NO_LOCATION_AVAILABLE');
   CONTINUE;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.inventory_locations
     WHERE id=v_loc AND organization_id=_org AND status='ACTIVE' AND operational_purpose='NORMAL'
       AND partner_id IS NULL AND type<>'TRANSIT') THEN
   RAISE EXCEPTION 'Localização % não é autorizada para venda direta.',v_loc;
  END IF;
  IF v_batch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.inventory_batches
     WHERE id=v_batch AND organization_id=_org AND variant_id=it.product_variant_id AND status='ACTIVE') THEN
   RAISE EXCEPTION 'Lote inválido ou desativado.';
  END IF;
  v_avail:=public.sales_available(_org,it.product_variant_id,v_loc,v_batch);
  v_qty:=coalesce(nullif(i->>'quantity','')::numeric,v_pend);
  v_qty:=least(v_qty,v_pend);
  IF v_policy<>'ALLOW_NEGATIVE_AVAILABLE' THEN
   v_qty:=least(v_qty,greatest(v_avail,0));
  END IF;
  IF v_qty<=0 THEN
   v_skipped:=v_skipped||jsonb_build_object('sales_order_item_id',it.id,'reason','NO_AVAILABLE_STOCK',
     'available',v_avail,'pending',v_pend);
   -- Reserva parcial é permitida; o pedido NÃO fica totalmente disponível.
   CONTINUE;
  END IF;
  IF v_policy='FULL_ONLY' AND v_qty<v_pend THEN
   RAISE EXCEPTION 'Política da organização exige reserva integral: % (% de %).',it.sku_snapshot,v_qty::text,v_pend::text;
  END IF;
  v_expires:=now()+make_interval(hours=>coalesce(nullif(_data->>'expires_hours','')::int,
    nullif(cfg->>'reservation_expiry_hours','')::int,72));
  v_key:=coalesce(nullif(i->>'idempotency_key','')::text,nullif(_data->>'idempotency_key','')::text,
    'sales:reserve:'||_order||':'||it.id||':'||v_loc||':'||coalesce(v_batch::text,'*'));
  INSERT INTO public.inventory_reservations(organization_id,sales_order_id,sales_order_item_id,
    variant_id,inventory_location_id,batch_id,quantity,status,reserved_at,expires_at,idempotency_key,created_by)
  VALUES(_org,_order,it.id,it.product_variant_id,v_loc,v_batch,v_qty,'ACTIVE',now(),v_expires,v_key,auth.uid())
  ON CONFLICT(organization_id,idempotency_key) DO NOTHING
  RETURNING id INTO v_res;
  IF v_res IS NULL THEN
   SELECT id INTO v_res FROM public.inventory_reservations WHERE organization_id=_org AND idempotency_key=v_key;
   v_skipped:=v_skipped||jsonb_build_object('sales_order_item_id',it.id,'reason','IDEMPOTENT_REPLAY',
     'reservation_id',v_res);
   CONTINUE;
  END IF;
  v_created:=v_created+1;
  PERFORM public.sales_audit(_org,'inventory_reservation.created','inventory_reservations',v_res,
    jsonb_build_object('sales_order_id',_order,'sales_order_item_id',it.id,'quantity',v_qty,
      'variant_id',it.product_variant_id,'location_id',v_loc,'batch_id',v_batch,'expires_at',v_expires));
 END LOOP;

 UPDATE public.sales_order_items i SET reserved_quantity=coalesce((SELECT sum(r.quantity-r.fulfilled_quantity-r.released_quantity)
 FROM public.inventory_reservations r WHERE r.sales_order_item_id=i.id AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')),0)
 WHERE i.organization_id=_org AND i.sales_order_id=_order;
 -- Recalcula o estado de estoque do pedido a partir das reservas reais.
 SELECT coalesce(sum(greatest(0,CASE WHEN i.approved_quantity>0 THEN i.approved_quantity ELSE i.ordered_quantity END)
   -coalesce((SELECT sum(r.quantity-r.fulfilled_quantity-r.released_quantity)
      FROM public.inventory_reservations r WHERE r.sales_order_item_id=i.id
        AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')),0)),0) INTO v_pend
 FROM public.sales_order_items i WHERE i.organization_id=_org AND i.sales_order_id=_order AND i.status<>'CANCELED';
 SELECT coalesce(sum(r.quantity-r.fulfilled_quantity-r.released_quantity),0)
  INTO v_reserved FROM public.inventory_reservations r
 WHERE r.organization_id=_org AND r.sales_order_id=_order AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED');
 SELECT coalesce(sum(CASE WHEN i.approved_quantity>0 THEN i.approved_quantity ELSE i.ordered_quantity END),0) INTO v_qty
  FROM public.sales_order_items i WHERE i.organization_id=_org AND i.sales_order_id=_order AND i.status<>'CANCELED';
 SELECT stock_status INTO v_status FROM public.sales_orders WHERE id=_order;
 v_status:=CASE WHEN v_reserved<=0 THEN 'NOT_EVALUATED'
  WHEN v_pend<=0 THEN 'RESERVED' WHEN v_reserved>0 THEN 'PARTIAL' ELSE 'INSUFFICIENT' END;
 -- Aprovado com pendência: o pedido diz que não está pronto.
 UPDATE public.sales_orders SET stock_status=v_status,
  status=CASE WHEN v_status IN ('RESERVED','PARTIAL') AND status IN ('APPROVED','AWAITING_STOCK')
    THEN 'READY_FOR_FULFILLMENT' WHEN v_status IN ('PARTIAL','INSUFFICIENT')
      AND status IN ('APPROVED','READY_FOR_FULFILLMENT') THEN 'AWAITING_STOCK' ELSE status END,
  availability_checked_at=now(),updated_at=now()
 WHERE id=_order;
 PERFORM public.sales_audit(_org,'inventory_reservation.batch','sales_orders',_order,
   jsonb_build_object('created',v_created,'skipped',v_skipped,'reserved_total',v_reserved,'pending_total',v_pend));
 RETURN jsonb_build_object('sales_order_id',_order,'created',v_created,'skipped',v_skipped,
   'reserved_total',v_reserved,'pending_total',v_pend,'stock_status',v_status);
END;
$$;
CREATE OR REPLACE FUNCTION public.sales_shipment_create(_org uuid,_order uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; sh public.shipments; cfg jsonb; ident uuid;
 v_number text; v_addr uuid; v_ful uuid; v_task uuid; v_loc uuid; v_carrier uuid; v_tracking text;
 v_item jsonb; v_count integer:=0; v_now timestamptz:=now(); v_snap jsonb; v_add jsonb;
 v_need_full boolean; v_confirmed integer:=0; v_packed integer; v_vol jsonb; v_volumes integer:=0;
BEGIN
 PERFORM public.sales_require(_org,'shipments.create');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.status NOT IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT','PARTIALLY_FULFILLED') THEN
  RAISE EXCEPTION 'Somente pedido aprovado pode ser expedido (status: %).',o.status;
 END IF;
 cfg:=public.sales_settings(_org);
 v_need_full:=coalesce((cfg->>'shipment_requires_full_confirmation')::boolean,false);
 v_ful:=nullif(_data->>'fulfillment_order_id','')::uuid;
 v_task:=nullif(_data->>'picking_task_id','')::uuid;
 IF v_ful IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.fulfillment_orders
     WHERE id=v_ful AND organization_id=_org AND sales_order_id=_order
       AND status='READY_FOR_SHIPMENT') THEN
   RAISE EXCEPTION 'Atendimento % não está liberado para expedição.',v_ful;
  END IF;
  SELECT id INTO v_task FROM public.picking_tasks
   WHERE organization_id=_org AND fulfillment_order_id=v_ful AND status='CONFIRMED' ORDER BY confirmed_at DESC LIMIT 1;
  SELECT source_location_id INTO v_loc FROM public.fulfillment_orders WHERE id=v_ful;
 END IF;
 IF v_task IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.picking_tasks WHERE id=v_task AND organization_id=_org AND sales_order_id=_order AND status='CONFIRMED') THEN RAISE EXCEPTION 'Conferência inválida para este pedido.'; END IF;
 v_loc:=coalesce(v_loc,nullif(_data->>'source_location_id','')::uuid,
   (SELECT r.inventory_location_id FROM public.inventory_reservations r
     WHERE r.organization_id=_org AND r.sales_order_id=_order
       AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED') ORDER BY r.reserved_at DESC LIMIT 1));
 IF v_loc IS NULL THEN
  RAISE EXCEPTION 'Informe a localização de origem da expedição.';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.inventory_locations WHERE id=v_loc AND organization_id=_org
    AND status='ACTIVE' AND operational_purpose='NORMAL' AND partner_id IS NULL AND type<>'TRANSIT') THEN
  RAISE EXCEPTION 'A expedição direta não pode sair de local de parceiro, trânsito ou quarentena.';
 END IF;
 v_addr:=coalesce(nullif(_data->>'destination_address_id','')::uuid,o.shipping_address_id);
 IF v_addr IS NULL AND coalesce((cfg->>'require_shipping_address')::boolean,true) THEN
  RAISE EXCEPTION 'Endereço de entrega é obrigatório.';
 END IF;
 IF v_addr IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.company_addresses
    WHERE id=v_addr AND organization_id=_org AND company_id=o.company_id) THEN
  RAISE EXCEPTION 'Endereço de entrega inválido.';
 END IF;
 -- Endereco CONGELADO no momento da expedicao. Snapshot nunca e recalculado.
 IF v_addr IS NOT NULL THEN
  SELECT to_jsonb(a) INTO v_snap FROM public.company_addresses a WHERE a.id=v_addr;
  v_add:=v_snap;
 ELSE
  SELECT to_jsonb(c) INTO v_snap FROM public.companies c WHERE c.id=o.company_id;
  v_add:=jsonb_build_object('company',v_snap);
 END IF;
 v_carrier:=nullif(_data->>'carrier_id','')::uuid;
 IF v_carrier IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.carriers
    WHERE id=v_carrier AND organization_id=_org AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Transportadora inválida ou inativa.';
 END IF;
 v_tracking:=nullif(trim(coalesce(_data->>'tracking_code','')),'');
 v_number:=public.sales_next_number(_org,'shipment');
 INSERT INTO public.shipments(organization_id,shipment_number,sales_order_id,fulfillment_order_id,picking_task_id,
   source_location_id,destination_address_id,address_snapshot,carrier_id,tracking_code,tracking_source,
   shipping_method,status,expected_delivery_at,created_by)
 VALUES(_org,v_number,_order,v_ful,v_task,v_loc,v_addr,v_add,v_carrier,v_tracking,
   -- Sem provedor real de rastreio, a origem e sempre MANUAL.
   'MANUAL',
   coalesce(nullif(_data->>'shipping_method',''),'STANDARD'),'DRAFT',nullif(_data->>'expected_delivery_at','')::timestamptz,auth.uid())
 RETURNING * INTO sh;
 ident:=sh.id;

 -- Itens: o que foi CONFERIDO na separacao. Nunca o que foi apenas reservado.
 IF jsonb_array_length(coalesce(_data->'items','[]'::jsonb))>0 THEN
  FOR v_item IN SELECT * FROM jsonb_array_elements(_data->'items') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.sales_order_items
      WHERE organization_id=_org AND sales_order_id=_order AND id=nullif(v_item->>'sales_order_item_id','')::uuid) THEN
    RAISE EXCEPTION 'Item do pedido inválido.';
   END IF;
   INSERT INTO public.shipment_items(organization_id,shipment_id,sales_order_item_id,variant_id,sku_snapshot,
     description_snapshot,quantity,batch_id,reservation_id)
   SELECT _org,ident,i.id,i.product_variant_id,i.sku_snapshot,i.description_snapshot,
     coalesce(nullif(v_item->>'quantity','')::numeric,0),nullif(v_item->>'batch_id','')::uuid,
     (SELECT r.id FROM public.inventory_reservations r
       WHERE r.organization_id=_org AND r.sales_order_item_id=i.id
         AND r.inventory_location_id=v_loc AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')
       ORDER BY r.reserved_at DESC LIMIT 1)
   FROM public.sales_order_items i
   WHERE i.organization_id=_org AND i.sales_order_id=_order AND i.id=nullif(v_item->>'sales_order_item_id','')::uuid;
   v_count:=v_count+1;
  END LOOP;
 ELSIF v_task IS NOT NULL THEN
  INSERT INTO public.shipment_items(organization_id,shipment_id,sales_order_item_id,variant_id,sku_snapshot,
     description_snapshot,quantity,batch_id,reservation_id)
  SELECT _org,ident,pti.sales_order_item_id,pti.variant_id,pti.sku_snapshot,pti.description_snapshot,
     pti.confirmed_quantity,pti.batch_id,
     (SELECT r.id FROM public.inventory_reservations r
       WHERE r.organization_id=_org AND r.sales_order_item_id=pti.sales_order_item_id
         AND r.inventory_location_id=v_loc AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')
       ORDER BY r.reserved_at DESC LIMIT 1)
  FROM public.picking_task_items pti WHERE pti.organization_id=_org AND pti.picking_task_id=v_task
    AND pti.confirmed_quantity>0;
  SELECT count(*) INTO v_count FROM public.shipment_items WHERE organization_id=_org AND shipment_id=ident;
 ELSE
  RAISE EXCEPTION 'Informe os itens da expedição ou o atendimento conferido.';
 END IF;
 IF EXISTS(SELECT 1 FROM public.shipment_items si JOIN public.sales_order_items i ON i.id=si.sales_order_item_id WHERE si.shipment_id=ident GROUP BY i.id HAVING sum(si.quantity)>i.approved_quantity-i.fulfilled_quantity) THEN RAISE EXCEPTION 'Quantidade excede saldo do pedido.'; END IF;
 IF v_count=0 THEN RAISE EXCEPTION 'Expedição sem itens.'; END IF;
 IF EXISTS(SELECT 1 FROM public.shipment_items WHERE organization_id=_org AND shipment_id=ident AND quantity<=0) THEN
  RAISE EXCEPTION 'Toda linha de expedição precisa de quantidade maior que zero.';
 END IF;
 -- Politica de expedicao integral: nao pode sair parte quando a politica exige tudo.
 IF v_need_full AND v_ful IS NOT NULL THEN
  SELECT count(*) INTO v_confirmed FROM public.shipment_items WHERE organization_id=_org AND shipment_id=ident;
  SELECT count(*) INTO v_packed FROM public.picking_task_items pti
   WHERE pti.organization_id=_org AND pti.picking_task_id=v_task AND pti.confirmed_quantity>0;
  IF v_confirmed<v_packed THEN
   RAISE EXCEPTION 'A política da organização exige expedição integral do atendimento.';
  END IF;
 END IF;
 -- Volumes: o mesmo volume nao pode aparecer duas vezes na mesma expedicao.
 FOR v_vol IN SELECT * FROM jsonb_array_elements(coalesce(_data->'volumes','[]'::jsonb)) LOOP
  IF nullif(trim(coalesce(v_vol->>'volume_number','')),'') IS NULL THEN RAISE EXCEPTION 'Volume sem identificação.'; END IF;
  IF EXISTS(SELECT 1 FROM public.shipment_volumes
     WHERE organization_id=_org AND shipment_id=ident AND volume_number=v_vol->>'volume_number') THEN
   RAISE EXCEPTION 'Volume % repetido na expedição.',v_vol->>'volume_number';
  END IF;
  INSERT INTO public.shipment_volumes(organization_id,shipment_id,packing_volume_id,volume_number,
    gross_weight_kg,weight_informed,carrier_tracking_code)
  SELECT _org,ident,prv.id,v_vol->>'volume_number',nullif(v_vol->>'gross_weight_kg','')::numeric,
    nullif(v_vol->>'gross_weight_kg','') IS NOT NULL,nullif(v_vol->>'carrier_tracking_code','')
  FROM public.packing_record_volumes prv
  WHERE prv.organization_id=_org AND prv.packing_record_id=(SELECT id FROM public.packing_records
    WHERE organization_id=_org AND fulfillment_order_id=v_ful ORDER BY packed_at DESC LIMIT 1)
    AND prv.volume_number=v_vol->>'volume_number';
  v_volumes:=v_volumes+1;
 END LOOP;
 UPDATE public.shipments SET status='READY',updated_at=v_now WHERE id=ident;
 PERFORM public.sales_audit(_org,'shipment.created','shipments',ident,
   jsonb_build_object('sales_order_id',_order,'fulfillment_order_id',v_ful,'items',v_count,
     'volumes',v_volumes,'source_location_id',v_loc,'carrier_id',v_carrier,'tracking_code',v_tracking));
 RETURN jsonb_build_object('id',ident,'shipment_number',v_number,'status','READY','items',v_count,
   'volumes',v_volumes,'source_location_id',v_loc,'address_snapshot',v_add);
END;
$$;
CREATE OR REPLACE FUNCTION public.sales_shipment_dispatch(_org uuid,_shipment uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sh public.shipments; o public.sales_orders; cfg jsonb; si record; v_now timestamptz:=now();
 v_key text; v_mov jsonb; v_mov_id uuid; v_res uuid; v_consumed numeric; v_out jsonb:='[]'::jsonb;
 v_deduped boolean; v_fin_trigger text; v_fin_created integer:=0; v_total numeric:=0;
 v_ord_status text; v_ord_ful text; v_req numeric; v_fulfilled numeric; v_ful uuid;
 v_carrier uuid; v_tracking text; v_expected timestamptz;
BEGIN
 PERFORM public.sales_require(_org,'shipments.dispatch');
 -- Baixa de estoque e uma operacao de inventario: exige as duas permissoes.
 PERFORM public.sales_require(_org,'inventory.move');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO sh FROM public.shipments WHERE id=_shipment AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Expedição não encontrada.'; END IF;
 IF sh.status IN ('DISPATCHED','IN_TRANSIT','DELIVERED','PARTIALLY_DELIVERED') THEN
  -- Reenvio da mesma expedicao nunca duplica a baixa.
  IF _data->>'dispatch_key' IS NULL OR _data->>'dispatch_key'=sh.dispatch_key THEN
   RETURN jsonb_build_object('id',_shipment,'shipment_number',sh.shipment_number,'status',sh.status,
     'deduped',true,'movements',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'sales_order_item_id',sit.sales_order_item_id,'quantity',sit.quantity,
       'inventory_movement_id',sit.inventory_movement_id))
       FROM public.shipment_items sit WHERE sit.organization_id=_org AND sit.shipment_id=_shipment),'[]'::jsonb));
  END IF;
  RAISE EXCEPTION 'Expedição % já despachada; use uma nova expedição para o saldo restante.',sh.shipment_number;
 END IF;
 IF sh.status NOT IN ('DRAFT','READY') THEN
  RAISE EXCEPTION 'Somente expedição em DRAFT ou READY pode ser despachada (status: %).',sh.status;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.shipment_items
    WHERE organization_id=_org AND shipment_id=_shipment AND quantity>0) THEN
  RAISE EXCEPTION 'Expedição sem itens para despachar.';
 END IF;
 SELECT * INTO o FROM public.sales_orders WHERE id=sh.sales_order_id AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.status IN ('CANCELED','CLOSED') THEN RAISE EXCEPTION 'Pedido % não pode ser expedido.',o.status; END IF;

 IF EXISTS(SELECT 1 FROM public.shipment_items check_si JOIN public.sales_order_items i ON i.id=check_si.sales_order_item_id
 WHERE check_si.shipment_id=_shipment GROUP BY i.id HAVING sum(check_si.quantity)>i.approved_quantity-i.fulfilled_quantity)
 THEN RAISE EXCEPTION 'Quantidade excede saldo do pedido.'; END IF;
 IF EXISTS(SELECT 1 FROM public.shipment_items check_si WHERE check_si.shipment_id=_shipment AND
 check_si.quantity > public.sales_available(_org,check_si.variant_id,sh.source_location_id,check_si.batch_id)+coalesce((SELECT r.quantity-r.fulfilled_quantity-r.released_quantity FROM public.inventory_reservations r WHERE r.id=check_si.reservation_id AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED') AND r.inventory_location_id=sh.source_location_id AND r.sales_order_item_id=check_si.sales_order_item_id),0))
 THEN RAISE EXCEPTION 'Estoque disponível insuficiente na expedição.'; END IF;
 v_carrier:=coalesce(nullif(_data->>'carrier_id','')::uuid,sh.carrier_id);
 v_tracking:=coalesce(nullif(trim(coalesce(_data->>'tracking_code','')),''),sh.tracking_code);
 v_expected:=coalesce(nullif(_data->>'expected_delivery_at','')::timestamptz,sh.expected_delivery_at);
 v_key:=coalesce(nullif(_data->>'dispatch_key','')::text,'sales:dispatch:'||_shipment);
 v_ful:=sh.fulfillment_order_id;
 cfg:=public.sales_settings(_org);

 -- Uma baixa por item. A chave do movimento e derivada da expedicao, do item
 -- e do lote: repetir a chamada NUNCA cria uma segunda baixa.
 FOR si IN SELECT * FROM public.shipment_items
   WHERE organization_id=_org AND shipment_id=_shipment AND quantity>0 ORDER BY sku_snapshot LOOP
  v_mov:=public.inventory_post_movement(
    _org,si.variant_id,sh.source_location_id,'SALE',si.quantity,
    'Venda direta '||sh.shipment_number,now(),'un','SALE_SHIPMENT',_shipment,si.batch_id,
    'sales:dispatch:'||_shipment||':'||si.sales_order_item_id||':'||coalesce(si.batch_id::text,'*'),
    'OUT',auth.uid(),false);
  v_mov_id:=nullif(v_mov->>'movement_id','')::uuid;
  v_deduped:=coalesce((v_mov->>'deduped')::boolean,false);
  IF v_mov_id IS NULL THEN
   RAISE EXCEPTION 'Falha ao registrar a baixa de estoque do item %.',si.sku_snapshot;
  END IF;
  IF NOT v_deduped AND si.inventory_movement_id IS NOT NULL AND si.inventory_movement_id<>v_mov_id THEN
   RAISE EXCEPTION 'Item % já possui baixa %s. Expedição inconsistente.',si.sku_snapshot,si.inventory_movement_id;
  END IF;
  UPDATE public.shipment_items SET inventory_movement_id=v_mov_id WHERE id=si.id;
  -- Consome a reserva vinculada. Reserva eje LOWA FISICA: nao altera saldo.
  v_res:=si.reservation_id;
  IF v_res IS NOT NULL THEN
   UPDATE public.inventory_reservations SET fulfilled_quantity=fulfilled_quantity+si.quantity,
     status=CASE WHEN fulfilled_quantity+si.quantity>=quantity THEN 'CONSUMED' ELSE 'PARTIALLY_CONSUMED' END,
     consumed_at=CASE WHEN fulfilled_quantity+si.quantity>=quantity THEN v_now ELSE consumed_at END,
     updated_at=v_now
   WHERE id=v_res AND status IN ('ACTIVE','PARTIALLY_CONSUMED')
     AND fulfilled_quantity+si.quantity<=quantity;
   IF NOT FOUND THEN
    RAISE EXCEPTION 'Reserva do item % insuficiente para a expedição.',si.sku_snapshot;
   END IF;
  END IF;
  v_out:=v_out||jsonb_build_object('sales_order_item_id',si.sales_order_item_id,'sku',si.sku_snapshot,
    'quantity',si.quantity,'batch_id',si.batch_id,'inventory_movement_id',v_mov_id,
    'reservation_id',v_res,'deduped',v_deduped);
  v_total:=v_total+si.quantity;
 END LOOP;

 UPDATE public.shipments SET status='DISPATCHED',dispatch_key=v_key,dispatched_at=coalesce(dispatched_at,v_now),
   carrier_id=v_carrier,tracking_code=v_tracking,
   tracking_source=coalesce(nullif(_data->>'tracking_source',''),sh.tracking_source,'MANUAL'),
   expected_delivery_at=v_expected,updated_at=v_now WHERE id=_shipment;
 IF v_ful IS NOT NULL THEN
  UPDATE public.fulfillment_orders SET status='SHIPPED',completed_at=coalesce(completed_at,v_now),updated_at=v_now
   WHERE id=v_ful AND status<>'CANCELED';
 END IF;
 -- Item do pedido: expedido e o que saiu do estoque.
 UPDATE public.sales_order_items i SET fulfilled_quantity=i.fulfilled_quantity+shi.quantity,
   reserved_quantity=greatest(0,i.reserved_quantity-shi.quantity),
   status=CASE WHEN i.fulfilled_quantity+shi.quantity>=coalesce(NULLIF(i.approved_quantity,0),i.ordered_quantity)
     THEN 'FULFILLED' ELSE 'PARTIALLY_FULFILLED' END,
   updated_at=v_now
 FROM public.shipment_items shi
 WHERE shi.organization_id=_org AND shi.shipment_id=_shipment AND shi.sales_order_item_id=i.id;
 UPDATE public.sales_order_items i SET reserved_quantity=coalesce((
    SELECT sum(greatest(0,r.quantity-r.fulfilled_quantity-r.released_quantity))
    FROM public.inventory_reservations r WHERE r.sales_order_item_id=i.id
      AND r.status IN ('ACTIVE','PARTIALLY_CONSUMED')),0),updated_at=v_now
  WHERE i.organization_id=_org AND i.sales_order_id=o.id;
 -- Estado do pedido: tudo expedido ou parcial?
 SELECT coalesce(sum(fulfilled_quantity),0),coalesce(sum(coalesce(NULLIF(approved_quantity,0),ordered_quantity)),0)
  INTO v_fulfilled,v_req FROM public.sales_order_items
  WHERE organization_id=_org AND sales_order_id=o.id AND status<>'CANCELED';
 v_ord_status:=CASE WHEN v_fulfilled>=v_req THEN 'FULFILLED' ELSE 'PARTIALLY_FULFILLED' END;
 v_ord_ful:=CASE WHEN v_fulfilled>=v_req THEN 'COMPLETE' ELSE 'PARTIAL' END;
 UPDATE public.sales_orders SET status=CASE WHEN o.status IN ('APPROVED','AWAITING_STOCK','READY_FOR_FULFILLMENT')
     THEN v_ord_status WHEN o.status='PARTIALLY_FULFILLED' THEN v_ord_status ELSE o.status END,
   fulfillment_status=v_ord_ful,updated_at=v_now WHERE id=o.id;

 -- Financeiro: gatilho ON_DISPATCH gera titulo apenas do saldo expedido.
 v_fin_trigger:=coalesce(cfg->>'receivable_trigger','ON_DISPATCH');
 IF v_fin_trigger='ON_DISPATCH' THEN
  v_fin_created:=public.sales_create_receivables(_org,o.id,'ON_DISPATCH');
 END IF;

 PERFORM public.sales_emit(_org,'SHIPMENT_DISPATCHED','shipment:'||_shipment,
   jsonb_build_object('shipment_id',_shipment,'shipment_number',sh.shipment_number,'sales_order_id',o.id,
     'tracking_code',v_tracking,'carrier_id',v_carrier,'quantity',v_total,'expected_delivery_at',v_expected));
 PERFORM public.sales_emit(_org,'SALES_ORDER_STATUS_CHANGED','sales_order:'||o.id,
   jsonb_build_object('sales_order_id',o.id,'status',v_ord_status,'fulfillment_status',v_ord_ful));
 PERFORM public.sales_audit(_org,'shipment.dispatched','shipments',_shipment,
   jsonb_build_object('sales_order_id',o.id,'dispatch_key',v_key,'movements',v_out,
     'tracking_code',v_tracking,'carrier_id',v_carrier,'expected_delivery_at',v_expected,
     'receivable_trigger',v_fin_trigger,'receivables_created',v_fin_created));
 RETURN jsonb_build_object('id',_shipment,'shipment_number',sh.shipment_number,'status','DISPATCHED',
   'dispatch_key',v_key,'movements',v_out,'quantity',v_total,
   'sales_order_status',v_ord_status,'fulfillment_status',v_ord_ful,
   'receivables_created',v_fin_created);
END;
$$;
CREATE OR REPLACE FUNCTION public.sales_create_receivables(_org uuid,_order uuid,_trigger text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; v_base numeric; v_existing numeric; v_company uuid; v_terms text;
 v_credit jsonb; v_n int; v_i int; v_due date; v_terms_id uuid; v_parts int[]; v_offset int;
BEGIN
 -- NONE e uma configuracao valida: a organizacao optou por nao gerar titulo.
 IF _trigger='NONE' THEN RETURN 0; END IF;
 IF _trigger NOT IN ('ON_APPROVAL','ON_DISPATCH') THEN RAISE EXCEPTION 'Gatilho financeiro inválido.'; END IF;
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 -- Fonte única: source_type='SALE'. Idempotente pela constraint
 -- UNIQUE(organization_id,source_type,source_id,installment_number).
 v_existing:=public.sales_receivable_total(_org,_order);
 IF v_existing>0 THEN
  -- J\u00e1 existe título para este pedido: a venda é uma só. Só complementa a
  -- diferença quando novas unidades foram efetivamente expedidas.
  IF _trigger<>'ON_DISPATCH' THEN RETURN 0; END IF;
 END IF;
 v_company:=o.company_id;
 v_terms_id:=o.payment_terms_id;
 SELECT name INTO v_terms FROM public.commercial_payment_terms WHERE id=v_terms_id AND organization_id=_org;

 -- Base elegível: o que foi expedido menos o que já foi devolvido.
 -- Na aprovação, a base é o total aprovado.
 IF _trigger='ON_APPROVAL' THEN
  v_base:=o.total_amount;
 ELSE
  -- Base em DINHEIRO, nunca em unidades: o proporcional expedido do valor
  -- aprovado da linha. Pedido parcial gera titulo parcial.
  v_base:=coalesce((
   SELECT sum(si.quantity/nullif(i.approved_quantity,0)*i.line_total)
   FROM public.shipment_items si
   JOIN public.shipments s ON s.id=si.shipment_id AND s.organization_id=si.organization_id
   JOIN public.sales_order_items i ON i.id=si.sales_order_item_id AND i.organization_id=si.organization_id
   WHERE si.organization_id=_org AND s.sales_order_id=_order
     AND s.status IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED','DELIVERED','DELIVERY_EXCEPTION')),0);
  v_base:=round(v_base/nullif((SELECT sum(line_total) FROM public.sales_order_items WHERE sales_order_id=_order),0)*o.total_amount,2);
  IF coalesce(v_base,0)<=0 THEN RETURN 0; END IF;
 END IF;
 v_base:=round(v_base-coalesce(v_existing,0),2);
 IF v_base<=0 THEN RETURN 0; END IF;

 v_parts:=public.purchasing_split_terms(coalesce(o.payment_terms_snapshot,'30'));
 SELECT coalesce(max(installment_number),0) INTO v_offset FROM public.account_receivables WHERE organization_id=_org AND source_type='SALE' AND source_id=_order::text;
 v_n:=greatest(1,least(coalesce(cardinality(v_parts),1),12));
 FOR v_i IN 1..v_n LOOP
  v_due:=o.order_date+coalesce(v_parts[v_i],0);
  INSERT INTO public.account_receivables(organization_id,company_id,source_type,source_id,source_status,
    document_number,description,issue_date,due_date,competence_date,original_amount,open_amount,
    currency,status,financial_category_id,cost_center_id,installment_number,total_installments,notes,created_by)
  VALUES(_org,v_company,'SALE',_order::text,'ACTIVE',
    'CLI-'||to_char(o.order_date,'YYYY')||'-'||lpad(o.order_number,24,'0')||'-'||lpad((v_offset+v_i)::text,2,'0'),
    'Pedido '||o.order_number||' — parcela '||v_i||'/'||v_n,
    o.order_date,v_due,o.order_date,
    CASE WHEN v_i<v_n THEN round(v_base/v_n,2) ELSE round(v_base-round(v_base/v_n,2)*(v_n-1),2) END,
    CASE WHEN v_i<v_n THEN round(v_base/v_n,2) ELSE round(v_base-round(v_base/v_n,2)*(v_n-1),2) END,
    o.currency,'OPEN',
    (SELECT fc.id FROM public.financial_categories fc
      WHERE fc.organization_id=_org AND fc.type='REVENUE' AND fc.status='ACTIVE' ORDER BY fc.name LIMIT 1),
    null,v_offset+v_i,v_offset+v_n,'Origem: venda direta (gatilho '||_trigger||')',auth.uid());
 END LOOP;
 PERFORM public.sales_audit(_org,'sales_order.receivable_created','sales_orders',_order,
   jsonb_build_object('trigger',_trigger,'base',v_base,'installments',v_n));
 RETURN v_n;
END;
$$;

CREATE OR REPLACE FUNCTION public.sales_query(_org uuid,_kind text DEFAULT 'orders',_filters jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_limit int; v_off int; v_status text; v_company uuid; v_from date; v_to date;
 v_search text; v_rows jsonb; v_total bigint; v_json jsonb; v_sum numeric;
 v_perm text; v_statuses text[];
BEGIN
 v_limit:=greatest(1,least(coalesce(nullif(_filters->>'limit','')::int,50),500));
 v_off:=greatest(coalesce(nullif(_filters->>'offset','')::int,0),0);
 v_status:=nullif(_filters->>'status','');
 v_company:=nullif(_filters->>'company_id','')::uuid;
 v_from:=nullif(_filters->>'from','')::date;
 v_to:=nullif(_filters->>'to','')::date;
 v_search:=nullif(trim(coalesce(_filters->>'search','')),'');
 v_statuses:=CASE WHEN _filters->'statuses' IS NOT NULL
   THEN ARRAY(SELECT jsonb_array_elements_text(_filters->'statuses')) ELSE NULL END;

 IF _kind='settings' THEN
 PERFORM public.sales_require(_org,'sales.configure'); RETURN public.sales_settings(_org);
 ELSIF _kind='locations' THEN
 PERFORM public.sales_require(_org,'sales_orders.read');
 RETURN jsonb_build_object('rows',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'type',type,'operational_purpose',operational_purpose)) FROM public.inventory_locations WHERE organization_id=_org AND status='ACTIVE' AND partner_id IS NULL AND type NOT IN ('PARTNER','TRANSIT')),'[]'::jsonb));
 ELSIF _kind='addresses' THEN
 PERFORM public.sales_require(_org,'sales_orders.create');
 RETURN jsonb_build_object('rows',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM public.company_addresses a WHERE organization_id=_org AND company_id=v_company),'[]'::jsonb));
 ELSIF _kind='orders' THEN
  v_perm:='sales_orders.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*),coalesce(sum(total_amount),0) INTO v_total,v_sum FROM public.sales_orders
   WHERE organization_id=_org
     AND (v_status IS NULL OR status=v_status)
     AND (v_statuses IS NULL OR status=ANY(v_statuses))
     AND (v_company IS NULL OR company_id=v_company)
     AND (v_from IS NULL OR order_date>=v_from) AND (v_to IS NULL OR order_date<=v_to)
     AND (v_search IS NULL OR order_number ILIKE '%'||v_search||'%' OR commercial_notes ILIKE '%'||v_search||'%');
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.order_date DESC,x.order_number DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT o.id,o.order_number,o.order_date,o.expected_delivery_date,o.status,o.stock_status,
     o.fulfillment_status,o.source_type,o.currency,o.subtotal,o.discount_total,o.freight_amount,
     o.tax_amount,o.total_amount,o.created_at,
     c.trade_name AS company_name,c.id AS company_id,
     (SELECT count(*) FROM public.sales_order_items i WHERE i.sales_order_id=o.id) AS item_count,
     (SELECT count(*) FROM public.shipments s WHERE s.sales_order_id=o.id AND s.status<>'CANCELED') AS shipment_count,
     (SELECT coalesce(sum(si.delivered_quantity),0) FROM public.shipment_items si
       JOIN public.shipments s ON s.id=si.shipment_id
       WHERE s.sales_order_id=o.id AND s.status IN ('DELIVERED','PARTIALLY_DELIVERED')) AS delivered_quantity
   FROM public.sales_orders o JOIN public.companies c ON c.id=o.company_id
   WHERE o.organization_id=_org
     AND (v_status IS NULL OR o.status=v_status)
     AND (v_statuses IS NULL OR o.status=ANY(v_statuses))
     AND (v_company IS NULL OR o.company_id=v_company)
     AND (v_from IS NULL OR o.order_date>=v_from) AND (v_to IS NULL OR o.order_date<=v_to)
     AND (v_search IS NULL OR o.order_number ILIKE '%'||v_search||'%' OR o.commercial_notes ILIKE '%'||v_search||'%')
   ORDER BY id LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','orders','rows',v_rows,'total',v_total,'total_amount',v_sum,
    'limit',v_limit,'offset',v_off);

 ELSIF _kind='exceptions' THEN
  v_perm:='logistics.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*) INTO v_total FROM public.logistics_exceptions
   WHERE organization_id=_org AND (v_status IS NULL OR status=v_status)
     AND (v_company IS NULL OR sales_order_id IN (SELECT id FROM public.sales_orders WHERE company_id=v_company));
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT e.*,o.order_number FROM public.logistics_exceptions e
     LEFT JOIN public.sales_orders o ON o.id=e.sales_order_id
   WHERE e.organization_id=_org AND (v_status IS NULL OR e.status=v_status) AND (v_company IS NULL OR o.company_id=v_company)
   ORDER BY id LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','exceptions','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='shipments' THEN
  v_perm:='shipments.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*) INTO v_total FROM public.shipments
   WHERE organization_id=_org AND (v_status IS NULL OR status=v_status)
     AND (v_company IS NULL OR sales_order_id IN (SELECT id FROM public.sales_orders WHERE company_id=v_company));
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT s.id,s.shipment_number,s.status,s.tracking_code,s.dispatched_at,s.expected_delivery_at,
     s.delivered_quantity,s.shipping_method,s.created_at,s.updated_at,
     o.order_number,o.id AS sales_order_id,o.company_id,
     c.trade_name AS company_name,ca.name AS carrier_name,
     (SELECT count(*) FROM public.shipment_items si WHERE si.shipment_id=s.id) AS item_count,
     (SELECT count(*) FROM public.shipment_delivery_proofs p WHERE p.shipment_id=s.id) AS proof_count,
     (s.expected_delivery_at IS NOT NULL AND s.expected_delivery_at<now()
        AND s.status IN ('DISPATCHED','IN_TRANSIT','PARTIALLY_DELIVERED')) AS overdue
   FROM public.shipments s JOIN public.sales_orders o ON o.id=s.sales_order_id
     JOIN public.companies c ON c.id=o.company_id LEFT JOIN public.carriers ca ON ca.id=s.carrier_id
   WHERE s.organization_id=_org AND (v_status IS NULL OR s.status=v_status) AND (v_company IS NULL OR o.company_id=v_company)
   ORDER BY id LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','shipments','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='returns' THEN
  v_perm:='returns.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*) INTO v_total FROM public.customer_returns
   WHERE organization_id=_org AND (v_status IS NULL OR status=v_status)
     AND (v_company IS NULL OR company_id=v_company);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.requested_at DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT r.*,o.order_number,c.trade_name AS company_name,
     (SELECT count(*) FROM public.customer_return_items i WHERE i.customer_return_id=r.id) AS item_count
   FROM public.customer_returns r JOIN public.sales_orders o ON o.id=r.sales_order_id
     JOIN public.companies c ON c.id=r.company_id
   WHERE r.organization_id=_org AND (v_status IS NULL OR r.status=v_status) AND (v_company IS NULL OR r.company_id=v_company)
   ORDER BY id LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','returns','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='reservations' THEN
  v_perm:='reservations.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*) INTO v_total FROM public.inventory_reservations
   WHERE organization_id=_org AND (v_status IS NULL OR status=v_status);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.reserved_at DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT r.*,o.order_number,it.sku_snapshot,it.description_snapshot,l.name AS location_name
   FROM public.inventory_reservations r JOIN public.sales_orders o ON o.id=r.sales_order_id
     JOIN public.sales_order_items it ON it.id=r.sales_order_item_id
     JOIN public.inventory_locations l ON l.id=r.inventory_location_id
   WHERE r.organization_id=_org AND (v_status IS NULL OR r.status=v_status)
   ORDER BY id LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','reservations','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='fulfillment' THEN
  v_perm:='fulfillment.read';
  PERFORM public.sales_require(_org,v_perm);
  SELECT count(*) INTO v_total FROM public.fulfillment_orders
   WHERE organization_id=_org AND (v_status IS NULL OR status=v_status);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC),'[]'::jsonb) INTO v_rows
   FROM (SELECT f.*,o.order_number,l.name AS source_location_name,
     (SELECT count(*) FROM public.picking_tasks t WHERE t.fulfillment_order_id=f.id) AS picking_count,
     (SELECT count(*) FROM public.shipments s WHERE s.fulfillment_order_id=f.id) AS shipment_count
   FROM public.fulfillment_orders f JOIN public.sales_orders o ON o.id=f.sales_order_id
     LEFT JOIN public.inventory_locations l ON l.id=f.source_location_id
   WHERE f.organization_id=_org AND (v_status IS NULL OR f.status=v_status)
   ORDER BY id LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','fulfillment','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='carriers' THEN
  PERFORM public.sales_require(_org,'shipments.read');
  SELECT count(*) INTO v_total FROM public.carriers WHERE organization_id=_org
   AND (v_status IS NULL OR status=v_status);
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.name),'[]'::jsonb) INTO v_rows
   FROM (SELECT * FROM public.carriers WHERE organization_id=_org
     AND (v_status IS NULL OR status=v_status) LIMIT v_limit OFFSET v_off) x;
  RETURN jsonb_build_object('kind','carriers','rows',v_rows,'total',v_total,'limit',v_limit,'offset',v_off);

 ELSIF _kind='credits' THEN
  PERFORM public.sales_require(_org,'sales_credit.read'); PERFORM public.sales_require(_org,'receivables.read');
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO v_json
   FROM (SELECT c.company_id AS company_id,co.trade_name AS company_name,
     public.crm_financial_position(_org,c.company_id) AS position
   FROM public.customer_profiles c JOIN public.companies co ON co.id=c.company_id
   WHERE c.organization_id=_org AND (v_company IS NULL OR c.company_id=v_company)
   LIMIT v_limit) x;
  RETURN jsonb_build_object('kind','credits','rows',v_json);

 ELSE RAISE EXCEPTION 'Consulta desconhecida: %.',_kind; END IF;
END;
$$;
CREATE OR REPLACE FUNCTION public.sales_return_create(_org uuid,_order uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; ret public.customer_returns; cfg jsonb; ident uuid; v_number text;
 v_ship uuid; v_reason text; v_i jsonb; v_shi record; v_qty numeric; v_count integer:=0;
 v_avail numeric; v_batch uuid; v_profile uuid; v_now timestamptz:=now();
BEGIN
 PERFORM public.sales_require(_org,'returns.create');
 PERFORM public.inventory_lock(_org);
 SELECT * INTO o FROM public.sales_orders WHERE id=_order AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
 IF o.status NOT IN ('PARTIALLY_FULFILLED','FULFILLED','CLOSED') THEN
  RAISE EXCEPTION 'Somente pedido expedido aceita devolução (status: %).',o.status;
 END IF;
 v_reason:=nullif(trim(coalesce(_data->>'reason','')),'');
 IF v_reason IS NULL THEN RAISE EXCEPTION 'Informe o motivo da devolução.'; END IF;
 v_ship:=nullif(_data->>'shipment_id','')::uuid;
 IF v_ship IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.shipments
    WHERE id=v_ship AND organization_id=_org AND sales_order_id=_order) THEN
  RAISE EXCEPTION 'Expedição não pertence a este pedido.';
 END IF;
 SELECT id INTO v_profile FROM public.customer_profiles WHERE company_id=o.company_id AND organization_id=_org LIMIT 1;
 v_number:=public.sales_next_number(_org,'return');
 INSERT INTO public.customer_returns(organization_id,return_number,company_id,sales_order_id,shipment_id,
   reason,reason_detail,status,notes)
 VALUES(_org,v_number,o.company_id,_order,v_ship,v_reason,nullif(trim(coalesce(_data->>'reason_detail','')),''),
   'DRAFT',nullif(trim(coalesce(_data->>'notes','')),''))
 RETURNING * INTO ret;
 ident:=ret.id;
 IF jsonb_array_length(coalesce(_data->'items','[]'::jsonb))<1 THEN
  RAISE EXCEPTION 'Informe os itens a devolver.';
 END IF;
 FOR v_i IN SELECT * FROM jsonb_array_elements(_data->'items') LOOP
  -- Devolucao sempre aponta para a expedicao original: e o unico caminho
  -- valido. Sem expedicao informada, a linha entregue mais recente do item
  -- e a referencia -- nunca o item do catalogo.
  SELECT shi.* INTO v_shi FROM public.shipment_items shi
   JOIN public.shipments sh ON sh.id=shi.shipment_id AND sh.organization_id=shi.organization_id
   WHERE shi.organization_id=_org
     AND sh.sales_order_id=o.id
     AND (v_ship IS NULL OR shi.shipment_id=v_ship)
     AND (v_i->>'sales_order_item_id' IS NULL
          OR shi.sales_order_item_id=nullif(v_i->>'sales_order_item_id','')::uuid)
     AND (v_i->>'shipment_item_id' IS NULL OR shi.id=nullif(v_i->>'shipment_item_id','')::uuid)
   ORDER BY sh.delivered_at DESC NULLS LAST,shi.shipment_id DESC LIMIT 1;
  IF v_shi.id IS NULL THEN RAISE EXCEPTION 'Item devolvido não encontrado em expedição entregue.'; END IF;
  v_qty:=coalesce(nullif(v_i->>'quantity','')::numeric,1);
  v_batch:=coalesce(nullif(v_i->>'batch_id','')::uuid,v_shi.batch_id);
  -- Nao devolver mais do que foi entregue e ainda nao devolvido.
  v_avail:=coalesce(v_shi.delivered_quantity,0)-coalesce((SELECT sum(ri.quantity) FROM public.customer_return_items ri JOIN public.customer_returns r ON r.id=ri.customer_return_id WHERE ri.shipment_item_id=v_shi.id AND r.status NOT IN ('CANCELED','REJECTED')),0);
  IF v_qty<=0 OR v_qty>v_avail THEN
   RAISE EXCEPTION 'Quantidade inválida para devolução: % disponível de %.',v_qty::text,v_avail::text;
  END IF;
  INSERT INTO public.customer_return_items(organization_id,customer_return_id,sales_order_item_id,shipment_item_id,
    variant_id,sku_snapshot,quantity,condition,destination,reason,batch_id,notes)
  VALUES(_org,ident,v_shi.sales_order_item_id,v_shi.id,v_shi.variant_id,v_shi.sku_snapshot,v_qty,
    coalesce(nullif(v_i->>'condition',''),'UNOPENED'),'PENDING',nullif(trim(coalesce(v_i->>'reason','')),''),
    v_batch,nullif(trim(coalesce(v_i->>'notes','')),''));
  v_count:=v_count+1;
 END LOOP;
 PERFORM public.sales_audit(_org,'customer_return.created','customer_returns',ident,
   jsonb_build_object('sales_order_id',_order,'shipment_id',v_ship,'items',v_count,'reason',v_reason));
 RETURN jsonb_build_object('id',ident,'return_number',v_number,'status','DRAFT','items',v_count);
END;
$$;
CREATE OR REPLACE FUNCTION public.sales_return_action(_org uuid,_ret uuid,_action text,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE ret public.customer_returns; cfg jsonb; v_new text; v_now timestamptz:=now();
 v_i record; v_dest uuid; v_dest_ok boolean; v_fin text; v_mov jsonb; v_mov_id uuid;
 v_qty numeric; v_notes text; v_movements jsonb:='[]'::jsonb; v_count integer:=0; v_reject_reason text;
 v_i_destination text;
BEGIN
 PERFORM public.sales_require(_org,CASE WHEN _action IN ('approve','reject') THEN 'returns.approve'
   WHEN _action='receive' THEN 'returns.receive' ELSE 'returns.create' END);
 -- Recebimento movimenta estoque: exige as duas permissoes.
 IF _action='receive' THEN PERFORM public.sales_require(_org,'inventory.move'); END IF;
 PERFORM public.inventory_lock(_org);
 SELECT * INTO ret FROM public.customer_returns WHERE id=_ret AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Devolução não encontrada.'; END IF;
 IF _action='receive' AND ret.status IN ('RECEIVED','COMPLETED','INSPECTED') THEN RETURN jsonb_build_object('id',_ret,'status',ret.status,'deduped',true); END IF;
 IF ret.status IN ('COMPLETED','REJECTED','CANCELED') THEN
  RAISE EXCEPTION 'Devolução % já encerrada.',ret.return_number;
 END IF;
 cfg:=public.sales_settings(_org);
 v_notes:=nullif(trim(coalesce(_data->>'notes',_data->>'reason','')),'');

 IF _action='submit' THEN
  IF ret.status<>'DRAFT' THEN RAISE EXCEPTION 'Devolução não está em rascunho.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.customer_return_items WHERE organization_id=_org AND customer_return_id=_ret) THEN
   RAISE EXCEPTION 'Devolução sem itens.';
  END IF;
  v_new:='PENDING_APPROVAL';
 ELSIF _action='approve' THEN
  IF ret.status<>'PENDING_APPROVAL' THEN RAISE EXCEPTION 'Devolução não está aguardando aprovação.'; END IF;
  IF coalesce((cfg->>'approval_segregation')::boolean,false) AND ret.created_by=auth.uid() THEN
   RAISE EXCEPTION 'Segregação de funções ativa: quem abriu a devolução não pode aprová-la.';
  END IF;
  v_new:='APPROVED';
  UPDATE public.customer_returns SET approved_by=auth.uid(),approved_at=v_now WHERE id=_ret;
 ELSIF _action='reject' THEN
  IF ret.status NOT IN ('DRAFT','PENDING_APPROVAL','APPROVED') THEN RAISE EXCEPTION 'Devolução não pode ser rejeitada agora.'; END IF;
  IF v_notes IS NULL THEN RAISE EXCEPTION 'Informe o motivo da rejeição.'; END IF;
  v_new:='REJECTED';
  v_reject_reason:=v_notes;
 ELSIF _action='receive' THEN
  IF ret.status NOT IN ('APPROVED','RECEIVING') THEN
   RAISE EXCEPTION 'Somente devolução aprovada pode ser recebida (status: %).',ret.status;
  END IF;
  v_dest:=nullif(_data->>'destination_location_id','')::uuid;
  v_fin:=coalesce(nullif(_data->>'financial_action',''),'NONE');
  v_new:='RECEIVING';
  -- Entrada no estoque. Uma movimentacao por item, chave idempotente.
  FOR v_i IN SELECT * FROM public.customer_return_items
    WHERE organization_id=_org AND customer_return_id=_ret ORDER BY created_at LOOP
   -- Destino: sem informacao do operador, a mercadoria vendavel volta para o
   -- MESMO local de origem da expedicao (fato ja registrado). Mercadoria nao
   -- vendavel EXIGE destino explicito de quarentena/inspecao: o sistema nunca
   -- decide por conta propria para onde va material avariado.
   v_dest:=coalesce(nullif(_data->>'destination_location_id','')::uuid,
     CASE WHEN v_i.condition IN ('DAMAGED','DEFECTIVE','OTHER') THEN NULL ELSE
       (SELECT sh.source_location_id FROM public.shipment_items si
         JOIN public.shipments sh ON sh.id=si.shipment_id AND sh.organization_id=si.organization_id
        WHERE si.organization_id=_org AND si.id=v_i.shipment_item_id) END);
   v_dest_ok:=v_dest IS NOT NULL AND EXISTS(SELECT 1 FROM public.inventory_locations
    WHERE id=v_dest AND organization_id=_org AND status='ACTIVE' AND partner_id IS NULL
      AND type<>'TRANSIT');
   IF NOT v_dest_ok THEN RAISE EXCEPTION 'Informe uma localização de recebimento válida.'; END IF;
   IF v_i.condition IN ('DAMAGED','DEFECTIVE','OTHER')
      AND NOT EXISTS(SELECT 1 FROM public.inventory_locations
         WHERE id=v_dest AND operational_purpose IN ('QUARANTINE','INSPECTION')) THEN
    RAISE EXCEPTION 'Item % em condição % exige destino de quarentena ou inspeção.',v_i.sku_snapshot,v_i.condition;
   END IF;
   -- Destino efetivo do recebimento: o informado agora ou o ja definido.
   v_i_destination:=coalesce(nullif(_data->>'destination',''),v_i.destination);
   v_qty:=coalesce((SELECT (x->>'quantity')::numeric FROM jsonb_array_elements(coalesce(_data->'items','[]'::jsonb)) x WHERE x->>'customer_return_item_id'=v_i.id::text),nullif(_data->>'quantity','')::numeric,0);
   IF v_qty<=0 THEN RAISE EXCEPTION 'Informe a quantidade integral recebida de cada item; divida recebimentos em devoluções distintas.'; END IF;
   IF v_qty<>v_i.quantity-v_i.received_quantity THEN
    RAISE EXCEPTION 'Quantidade recebida acima do devolvido em %.',v_i.sku_snapshot;
   END IF;
   -- Danificada ou defeituosa NUNCA volta a vendavel.
   IF v_i.condition IN ('DAMAGED','DEFECTIVE','OTHER') AND v_i_destination='SELLABLE' THEN
    RAISE EXCEPTION 'Item % em condição % não pode ir para estoque vendível.',v_i.sku_snapshot,v_i.condition;
   END IF;
   v_mov:=public.inventory_post_movement(
     _org,v_i.variant_id,v_dest,'SALE_RETURN',v_qty,
     'Devolução '||ret.return_number,now(),'un','CUSTOMER_RETURN',_ret,v_i.batch_id,
     'sales:return:'||_ret||':'||v_i.id,'IN',auth.uid(),false);
   v_mov_id:=nullif(v_mov->>'movement_id','')::uuid;
   IF v_mov_id IS NULL THEN RAISE EXCEPTION 'Falha ao receber o item %.',v_i.sku_snapshot; END IF;
   UPDATE public.customer_return_items SET received_quantity=received_quantity+v_qty,
     destination=v_i_destination,updated_at=v_now WHERE id=v_i.id;
   v_movements:=v_movements||jsonb_build_object('customer_return_item_id',v_i.id,'sku',v_i.sku_snapshot,
     'quantity',v_qty,'destination_location_id',v_dest,'inventory_movement_id',v_mov_id,
     'condition',v_i.condition,'destination',v_i_destination);
   v_count:=v_count+1;
  END LOOP;
  IF v_count=0 THEN RAISE EXCEPTION 'Informe a quantidade recebida.'; END IF;
  UPDATE public.shipment_items si SET returned_quantity=coalesce((SELECT sum(ri.received_quantity) FROM public.customer_return_items ri WHERE ri.shipment_item_id=si.id),0) WHERE si.shipment_id=ret.shipment_id;
  -- Devolucao reduz o expedido e o entregue do item do pedido.
  UPDATE public.sales_order_items i SET returned_quantity=coalesce((
    SELECT sum(cri.received_quantity) FROM public.customer_return_items cri
    WHERE cri.organization_id=_org AND cri.sales_order_item_id=i.id AND cri.received_quantity>0),0),updated_at=v_now
   WHERE i.organization_id=_org AND i.sales_order_id=ret.sales_order_id;
  UPDATE public.customer_returns SET destination_location_id=v_dest,received_by=auth.uid(),
   received_at=coalesce(received_at,v_now),financial_action=v_fin,
   financial_requested_at=CASE WHEN v_fin<>'NONE' THEN v_now ELSE financial_requested_at END,
   financial_reference=nullif(trim(coalesce(_data->>'financial_reference','')),''),
   financial_notes=v_notes,status='RECEIVED',updated_at=v_now WHERE id=_ret;
  -- Registra o pedido de ajuste financeiro. NAO executa o estorno aqui.
  IF v_fin<>'NONE' THEN
   PERFORM public.sales_emit(_org,'CUSTOMER_RETURN_FINANCIAL_REQUESTED','customer_return:'||_ret,
     jsonb_build_object('customer_return_id',_ret,'return_number',ret.return_number,'sales_order_id',ret.sales_order_id,
       'financial_action',v_fin,'financial_reference',nullif(trim(coalesce(_data->>'financial_reference','')),''),
       'note','Ajuste financeiro pendente no módulo financeiro.'));
  END IF;
  v_new:='RECEIVED';
  PERFORM public.sales_audit(_org,'customer_return.received','customer_returns',_ret,
   jsonb_build_object('destination_location_id',v_dest,'items',v_count,'movements',v_movements,
     'financial_action',v_fin));
  RETURN jsonb_build_object('id',_ret,'status','RECEIVED','items',v_count,'movements',v_movements,
    'financial_action',v_fin,'note','O ajuste financeiro não é executado por este módulo.');
 ELSIF _action='inspect' THEN
  IF ret.status<>'RECEIVED' THEN RAISE EXCEPTION 'Receba a devolução antes de inspecionar.'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.customer_return_items
     WHERE organization_id=_org AND customer_return_id=_ret AND destination='PENDING') THEN
   v_new:='COMPLETED';
  ELSE v_new:='INSPECTED'; END IF;
 ELSIF _action='complete' THEN
  IF ret.status NOT IN ('RECEIVED','INSPECTED') THEN RAISE EXCEPTION 'Devolução não está recebida.'; END IF;
  IF EXISTS(SELECT 1 FROM public.customer_return_items
     WHERE organization_id=_org AND customer_return_id=_ret AND destination='PENDING' AND received_quantity>0) THEN
   RAISE EXCEPTION 'Toda mercadoria recebida precisa de destino definido.';
  END IF;
  v_new:='COMPLETED';
 ELSIF _action='cancel' THEN
  IF ret.status NOT IN ('DRAFT','PENDING_APPROVAL') THEN
   RAISE EXCEPTION 'Devolução aprovada ou recebida não pode ser cancelada.';
  END IF;
  IF v_notes IS NULL THEN RAISE EXCEPTION 'Informe o motivo do cancelamento.'; END IF;
  v_new:='CANCELED';
 ELSE RAISE EXCEPTION 'Ação inválida.'; END IF;

 UPDATE public.customer_returns SET status=v_new,
   reason_detail=coalesce(v_reject_reason,reason_detail),updated_at=v_now WHERE id=_ret;
 PERFORM public.sales_audit(_org,'customer_return.'||_action,'customer_returns',_ret,
   jsonb_build_object('from',ret.status,'to',v_new,'notes',v_notes));
 RETURN jsonb_build_object('id',_ret,'return_number',ret.return_number,'status',v_new);
END;
$$;
CREATE OR REPLACE FUNCTION public.sales_insert_order(_org uuid,_data jsonb,_items jsonb,_quote uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE o public.sales_orders; ident uuid; i jsonb; v_number text;
 v_table uuid; v_company uuid; v_subtotal numeric:=0; v_discount numeric:=0; v_tax numeric:=0; v_freight numeric;
 v_profile uuid; v_status text; v_term text; v_addr jsonb:='{}'::jsonb; v_addr_id uuid; v_bill_id uuid;
 v_terms_id uuid; v_rep uuid; v_contact uuid; v_quote public.sales_quotes; cfg jsonb;
BEGIN
 v_company:=nullif(_data->>'company_id','')::uuid;
 IF v_company IS NULL THEN RAISE EXCEPTION 'Cliente é obrigatório.'; END IF;
 IF jsonb_array_length(_items)<1 THEN RAISE EXCEPTION 'Pedido sem itens.'; END IF;
 PERFORM public.sales_ensure_settings(_org); cfg:=public.sales_settings(_org);

 SELECT p.id,p.commercial_status,p.price_table_id,p.payment_terms_id INTO v_profile,v_status,v_table,v_terms_id
 FROM public.customer_profiles p WHERE p.organization_id=_org AND p.company_id=v_company;
 IF v_profile IS NULL THEN RAISE EXCEPTION 'Empresa não possui perfil de cliente.'; END IF;
 IF v_status<>'ACTIVE' THEN RAISE EXCEPTION 'Cliente não está ativo para novas vendas (%s).',v_status; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=v_company AND organization_id=_org AND status='ACTIVE') THEN
  RAISE EXCEPTION 'Empresa inativa ou bloqueada.';
 END IF;

 IF _quote IS NOT NULL THEN
  SELECT * INTO v_quote FROM public.sales_quotes WHERE id=_quote AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Proposta não encontrada.'; END IF;
  IF v_quote.status<>'ACCEPTED' THEN RAISE EXCEPTION 'Somente proposta aceita gera pedido.'; END IF;
  IF public.crm_external(_org) AND NOT public.crm_company_access(_org,v_quote.company_id) THEN
   RAISE EXCEPTION 'Proposta fora da sua carteira.';
  END IF;
  v_table:=v_quote.price_table_id; v_rep:=v_quote.representative_id;
  v_contact:=v_quote.acceptance_contact_id;
 END IF;
 v_table:=coalesce(nullif(_data->>'price_table_id','')::uuid,v_table);

 -- Endereco de entrega: o que o cliente pediu hoje, congelado no pedido.
 v_addr_id:=nullif(_data->>'shipping_address_id','')::uuid;
 IF v_addr_id IS NULL AND _quote IS NOT NULL THEN
  SELECT id INTO v_addr_id FROM public.company_addresses
   WHERE organization_id=_org AND company_id=v_company AND type='SHIPPING' AND is_primary LIMIT 1;
 END IF;
 IF v_addr_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.company_addresses
     WHERE id=v_addr_id AND organization_id=_org AND company_id=v_company) THEN
   RAISE EXCEPTION 'Endereço de entrega inválido para esta empresa.';
  END IF;
  SELECT to_jsonb(a) INTO v_addr FROM public.company_addresses a WHERE a.id=v_addr_id;
 END IF;
 v_bill_id:=coalesce(nullif(_data->>'billing_address_id','')::uuid,
   (SELECT id FROM public.company_addresses
    WHERE organization_id=_org AND company_id=v_company AND type='BILLING' AND is_primary LIMIT 1));

 v_terms_id:=coalesce(nullif(_data->>'payment_terms_id','')::uuid,v_terms_id);
 SELECT name INTO v_term FROM public.commercial_payment_terms WHERE id=v_terms_id AND organization_id=_org;
 IF v_term IS NULL THEN
  SELECT name INTO v_term FROM public.commercial_payment_terms
   WHERE id=(SELECT payment_terms_id FROM public.customer_profiles WHERE id=v_profile) AND organization_id=_org;
  v_terms_id:=(SELECT payment_terms_id FROM public.customer_profiles WHERE id=v_profile);
 END IF;
 IF v_rep IS NULL THEN
  SELECT representative_id INTO v_rep FROM public.customer_portfolio_assignments
   WHERE organization_id=_org AND company_id=v_company AND ended_at IS NULL LIMIT 1;
 END IF;
 v_freight:=round(coalesce(nullif(_data->>'freight_amount','')::numeric,
   CASE WHEN _quote IS NOT NULL THEN v_quote.freight END,0),2);

 v_number:=public.sales_next_number(_org,'order');
 INSERT INTO public.sales_orders(organization_id,order_number,company_id,customer_profile_id,
   sales_quote_id,sales_quote_version,sales_opportunity_id,representative_id,price_table_id,
   source_type,order_date,expected_delivery_date,payment_terms_id,payment_terms_snapshot,
   shipping_address_id,billing_address_id,address_snapshot,company_snapshot,price_snapshot,
   currency,commercial_notes,internal_notes,created_by)
 VALUES(_org,v_number,v_company,v_profile,
   _quote,CASE WHEN _quote IS NULL THEN NULL ELSE v_quote.version END,
   coalesce(nullif(_data->>'sales_opportunity_id','')::uuid,v_quote.opportunity_id),v_rep,v_table,
   CASE WHEN _quote IS NULL THEN 'MANUAL' ELSE 'QUOTE_CONVERSION' END,
    coalesce(nullif(_data->>'order_date','')::date,CASE WHEN _quote IS NOT NULL THEN v_quote.issue_date END,current_date),
   nullif(_data->>'expected_delivery_date','')::date,v_terms_id,coalesce(nullif(_data->>'payment_terms_snapshot',''),v_term),v_addr_id,v_bill_id,
   v_addr,
   coalesce(CASE WHEN _quote IS NULL THEN NULL ELSE v_quote.company_snapshot END,
     jsonb_build_object('company_id',v_company::text,'captured_at',now())),
   coalesce(CASE WHEN _quote IS NULL THEN NULL ELSE v_quote.payment_terms_snapshot END,'{}'::jsonb),
   coalesce(nullif(_data->>'currency',''),'BRL'),
   nullif(trim(coalesce(_data->>'commercial_notes','')),''),
   nullif(trim(coalesce(_data->>'internal_notes','')),''),auth.uid())
 RETURNING * INTO o;
 ident:=o.id;

 FOR i IN SELECT * FROM jsonb_array_elements(_items) LOOP
  v_subtotal:=v_subtotal+round((i->>'unit_price')::numeric*(i->>'ordered_quantity')::numeric,2);
  v_discount:=v_discount+coalesce((i->>'discount_amount')::numeric,0);
  v_tax:=v_tax+coalesce((i->>'tax_amount')::numeric,0);
  INSERT INTO public.sales_order_items(organization_id,sales_order_id,product_variant_id,
     sku_snapshot,description_snapshot,unit_snapshot,price_snapshot,ordered_quantity,
     unit_price,discount_amount,tax_amount,line_total,expected_delivery_date,created_by)
  VALUES(_org,ident,(i->>'product_variant_id')::uuid,i->>'sku_snapshot',i->>'description_snapshot',
   i->>'unit_snapshot',coalesce(i->'price_snapshot','{}'::jsonb),(i->>'ordered_quantity')::numeric,
   (i->>'unit_price')::numeric,(i->>'discount_amount')::numeric,(i->>'tax_amount')::numeric,
   (i->>'line_total')::numeric,nullif(i->>'expected_delivery_date','')::date,auth.uid());
 END LOOP;

 v_subtotal:=round(v_subtotal,2); v_discount:=round(v_discount,2); v_tax:=round(v_tax,2);
 UPDATE public.sales_orders SET subtotal=v_subtotal,discount_total=v_discount,tax_amount=v_tax,
  freight_amount=v_freight,
  total_amount=round(v_subtotal-v_discount+v_tax+v_freight,2)
 WHERE id=ident;
 SELECT * INTO o FROM public.sales_orders WHERE id=ident;
 PERFORM public.sales_audit(_org,'sales_order.created','sales_orders',ident,
   jsonb_build_object('source_type',o.source_type,'total',o.total_amount,'items',jsonb_array_length(_items)));
 PERFORM public.sales_emit(_org,'SALES_ORDER_CREATED','sales_order_created:'||ident,
   jsonb_build_object('sales_order_id',ident,'order_number',o.order_number,'company_id',v_company,
     'total',o.total_amount,'currency',o.currency,'source_type',o.source_type));
 RETURN jsonb_build_object('id',ident,'order_number',o.order_number,'status',o.status,'total_amount',o.total_amount);
END;
$$;
CREATE OR REPLACE FUNCTION public.sales_pick_confirm(_org uuid,_task uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.picking_tasks; v_item jsonb; v_diff jsonb:='[]'::jsonb; v_now timestamptz:=now();
 v_perm text; v_count integer:=0; v_batch uuid; v_conf numeric;
BEGIN
 v_perm:=CASE WHEN _data ? 'items' THEN 'picking.confirm' ELSE 'picking.confirm' END;
 PERFORM public.sales_require(_org,v_perm);
 PERFORM public.inventory_lock(_org);
 SELECT * INTO t FROM public.picking_tasks WHERE id=_task AND organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tarefa de separação não encontrada.'; END IF;
 IF t.status NOT IN ('IN_PROGRESS','PICKED','PENDING') THEN RAISE EXCEPTION 'Tarefa não está em conferência.'; END IF;
 IF jsonb_array_length(coalesce(_data->'items','[]'::jsonb))=0 THEN
  RAISE EXCEPTION 'Informe ao menos um item conferido.';
 END IF;
 FOR v_item IN SELECT * FROM jsonb_array_elements(_data->'items') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.picking_task_items WHERE id=(v_item->>'picking_task_item_id')::uuid AND organization_id=_org AND picking_task_id=_task) THEN RAISE EXCEPTION 'Item não pertence à tarefa.'; END IF;
  v_conf:=coalesce(nullif(v_item->>'confirmed_quantity','')::numeric,0);
  IF v_conf<0 OR v_conf>(SELECT requested_quantity FROM public.picking_task_items WHERE id=(v_item->>'picking_task_item_id')::uuid) THEN RAISE EXCEPTION 'Quantidade conferida não pode ser negativa.'; END IF;
  v_batch:=nullif(v_item->>'batch_id','')::uuid;
  IF v_batch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.picking_task_items pti
     WHERE pti.organization_id=_org AND pti.id=nullif(v_item->>'picking_task_item_id','')::uuid
       AND (pti.batch_id=v_batch OR pti.batch_id IS NULL)) THEN
   PERFORM public.sales_open_exception(_org,'WRONG_BATCH','ERROR',
    'Lote informado diverge do esperado na separação.',
    jsonb_build_object('picking_task_id',_task,'picking_task_item_id',v_item->>'picking_task_item_id','batch_id',v_batch));
   RAISE EXCEPTION 'Lote informado diverge do esperado na separação.';
  END IF;
  -- Divergencia entre o separado e o conferido e registrada como excecao.
  IF v_conf<>(SELECT pti.picked_quantity FROM public.picking_task_items pti
     WHERE pti.organization_id=_org AND pti.id=nullif(v_item->>'picking_task_item_id','')::uuid) THEN
   v_diff:=v_diff||jsonb_build_object('picking_task_item_id',v_item->>'picking_task_item_id','confirmed',v_conf,
     'picked',(SELECT pti.picked_quantity FROM public.picking_task_items pti
       WHERE pti.id=nullif(v_item->>'picking_task_item_id','')::uuid));
   PERFORM public.sales_open_exception(_org,'PICKING_DIFFERENCE','WARNING',
    'Divergência entre quantidade separada e conferida.',
    jsonb_build_object('picking_task_id',_task,'fulfillment_order_id',t.fulfillment_order_id,
      'sales_order_id',t.sales_order_id,'picking_task_item_id',v_item->>'picking_task_item_id',
      'details',jsonb_build_object('confirmed',v_conf)));
  END IF;
  UPDATE public.picking_task_items SET confirmed_quantity=v_conf,
    difference_reason=CASE WHEN v_conf<>(SELECT pti.picked_quantity FROM public.picking_task_items pti
      WHERE pti.id=nullif(v_item->>'picking_task_item_id','')::uuid)
      THEN coalesce(nullif(v_item->>'difference_reason',''),(CASE WHEN v_conf<0 THEN 'SHORT_PICK' ELSE 'OVER_PICK' END))
      ELSE NULL END,
    batch_id=coalesce(v_batch,batch_id),updated_at=v_now
   WHERE organization_id=_org AND id=nullif(v_item->>'picking_task_item_id','')::uuid;
  v_count:=v_count+1;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.picking_task_items WHERE organization_id=_org AND picking_task_id=_task AND confirmed_quantity<=0) THEN
  RAISE EXCEPTION 'Todos os itens precisam de quantidade conferida maior que zero.';
 END IF;
 UPDATE public.picking_tasks SET status='CONFIRMED',confirmed_by=auth.uid(),confirmed_at=v_now,updated_at=v_now WHERE id=_task;
 -- O item do pedido reflete o conferido. Expedido continua em zero ate a expedicao.
 UPDATE public.sales_order_items i SET picked_quantity=coalesce((
   SELECT sum(pti.confirmed_quantity) FROM public.picking_task_items pti
   WHERE pti.organization_id=_org AND pti.sales_order_item_id=i.id AND pti.confirmed_quantity>0),0),updated_at=v_now
  WHERE i.organization_id=_org AND i.sales_order_id=t.sales_order_id;
 UPDATE public.fulfillment_orders f SET status=CASE WHEN f.status IN ('PICKING','PICKED') THEN 'PACKING' ELSE f.status END,
  updated_at=v_now WHERE f.id=t.fulfillment_order_id;
 PERFORM public.sales_audit(_org,'picking.confirmed','picking_tasks',_task,
   jsonb_build_object('items',v_count,'differences',v_diff,'fulfillment_order_id',t.fulfillment_order_id));
 RETURN jsonb_build_object('picking_task_id',_task,'status','CONFIRMED','items',v_count,'differences',v_diff);
END;
$$;
CREATE FUNCTION public.sales_execute(_org uuid,_operation text,_id uuid,_action text,_data jsonb,_key uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE prior public.sales_order_operation_keys; payload jsonb; result jsonb; perm text;
BEGIN
 IF _key IS NULL THEN RAISE EXCEPTION 'Chave obrigatória.'; END IF;
 IF _operation='convert' THEN RETURN public.sales_convert_quote(_org,_id,_data,_key); END IF;
 perm:=CASE _operation
 WHEN 'save' THEN 'sales_orders.create'
 WHEN 'order' THEN 'sales_orders.update'
 WHEN 'reserve' THEN 'reservations.create'
 WHEN 'reservation' THEN 'reservations.release'
 WHEN 'fulfillment_create' THEN 'fulfillment.manage'
 WHEN 'fulfillment' THEN 'fulfillment.manage'
 WHEN 'scan' THEN 'picking.execute'
 WHEN 'confirm' THEN 'picking.confirm'
 WHEN 'pack' THEN 'packing.manage'
 WHEN 'shipment_create' THEN 'shipments.create'
 WHEN 'dispatch' THEN 'shipments.dispatch'
 WHEN 'shipment' THEN 'shipments.read'
 WHEN 'return_create' THEN 'returns.create'
 WHEN 'return' THEN 'returns.read'
 WHEN 'exception' THEN 'logistics.exceptions'
 WHEN 'carrier' THEN 'carriers.manage'
 WHEN 'settings' THEN 'sales.configure'
 WHEN 'expire' THEN 'reservations.release'
 ELSE NULL END;
 IF perm IS NULL THEN RAISE EXCEPTION 'Operação inválida.'; END IF;
 PERFORM public.sales_require(_org,perm);
 PERFORM public.inventory_lock(_org);
 payload:=jsonb_build_object('operation',_operation,'id',_id,'action',_action,'data',_data);
 SELECT * INTO prior FROM public.sales_order_operation_keys WHERE organization_id=_org AND operation_key=_key;
 IF FOUND THEN IF prior.payload<>payload OR prior.created_by IS DISTINCT FROM auth.uid() THEN RAISE EXCEPTION 'Chave utilizada com outro conteúdo ou usuário.'; END IF; RETURN prior.result; END IF;
 CASE _operation
 WHEN 'save' THEN result:=public.sales_save(_org,_data);
 WHEN 'order' THEN result:=public.sales_order_action(_org,_id,_action,_data);
 WHEN 'reserve' THEN result:=public.sales_reserve(_org,_id,_data);
 WHEN 'reservation' THEN result:=public.sales_reservation_action(_org,_id,_action,_data);
 WHEN 'fulfillment_create' THEN result:=public.sales_fulfillment_create(_org,_id,_data);
 WHEN 'fulfillment' THEN result:=public.sales_fulfillment_action(_org,_id,_action,_data);
 WHEN 'scan' THEN result:=public.sales_pick_scan(_org,_id,_data);
 WHEN 'confirm' THEN result:=public.sales_pick_confirm(_org,_id,_data);
 WHEN 'pack' THEN result:=public.sales_pack(_org,_id,_data);
 WHEN 'shipment_create' THEN result:=public.sales_shipment_create(_org,_id,_data);
 WHEN 'dispatch' THEN result:=public.sales_shipment_dispatch(_org,_id,_data);
 WHEN 'shipment' THEN result:=public.sales_shipment_action(_org,_id,_action,_data);
 WHEN 'return_create' THEN result:=public.sales_return_create(_org,_id,_data);
 WHEN 'return' THEN result:=public.sales_return_action(_org,_id,_action,_data);
 WHEN 'exception' THEN result:=public.sales_exception_action(_org,_id,_action,_data);
 WHEN 'carrier' THEN result:=public.sales_carrier_save(_org,_data,_id);
 WHEN 'settings' THEN result:=public.sales_settings_save(_org,_data);
 WHEN 'expire' THEN result:=public.sales_expire_reservations(_org,_data);
 END CASE;
 INSERT INTO public.sales_order_operation_keys(organization_id,operation_key,operation,payload,result,created_by) VALUES(_org,_key,_operation,payload,result,auth.uid()); RETURN result;
END; $$;
REVOKE ALL ON FUNCTION public.sales_execute(uuid,text,uuid,text,jsonb,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.sales_execute(uuid,text,uuid,text,jsonb,uuid) TO authenticated;
CREATE TRIGGER sales_integrity_orders BEFORE INSERT OR UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION public.sales_guard_relations();
-- Credit snapshots require financial authorization even via direct REST SELECT.
REVOKE SELECT ON public.sales_orders FROM authenticated;
DO $columns$ DECLARE cols text; BEGIN SELECT string_agg(quote_ident(column_name),',') INTO cols FROM information_schema.columns WHERE table_schema='public' AND table_name='sales_orders' AND column_name NOT IN ('credit_check_result','approval_policy'); EXECUTE 'GRANT SELECT ('||cols||') ON public.sales_orders TO authenticated'; END $columns$;
DROP POLICY sales_read ON public.sales_credit_checks;
CREATE POLICY sales_read ON public.sales_credit_checks FOR SELECT TO authenticated USING(public.has_permission(organization_id,'sales_credit.read') AND public.has_permission(organization_id,'receivables.read'));
CREATE FUNCTION public.sales_sync_demand() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN UPDATE public.sales_demands SET fulfilled_quantity=NEW.fulfilled_quantity,status=CASE WHEN NEW.status='CANCELED' THEN 'CANCELED' WHEN NEW.fulfilled_quantity>=requested_quantity THEN 'CLOSED' WHEN NEW.fulfilled_quantity>0 THEN 'PARTIAL' ELSE 'OPEN' END,updated_at=now() WHERE sales_order_item_id=NEW.id; RETURN NEW; END; $$;
REVOKE ALL ON FUNCTION public.sales_sync_demand() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER sales_sync_demand AFTER UPDATE OF fulfilled_quantity,status ON public.sales_order_items FOR EACH ROW EXECUTE FUNCTION public.sales_sync_demand();
CREATE OR REPLACE FUNCTION public.sales_expire_reservations(_org uuid,_data jsonb DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.inventory_reservations; v_n integer:=0; v_now timestamptz:=now();
 v_orders uuid[]:='{}'::uuid[];
BEGIN
 PERFORM public.sales_require(_org,'reservations.release');
 PERFORM public.inventory_lock(_org);
 FOR r IN SELECT * FROM public.inventory_reservations
   WHERE organization_id=_org AND status IN ('ACTIVE','PARTIALLY_CONSUMED')
     AND expires_at<now()
   FOR UPDATE SKIP LOCKED LOOP
  UPDATE public.inventory_reservations SET status='EXPIRED',
   released_quantity=released_quantity+(quantity-fulfilled_quantity-released_quantity),
   released_at=v_now,release_reason='Expiração automática por prazo',updated_at=v_now WHERE id=r.id;
  v_orders:=v_orders||r.sales_order_id;
  v_n:=v_n+1;
 END LOOP;
 IF v_n=0 THEN RETURN jsonb_build_object('expired',0); END IF;
 -- Reservado do item e situacao de estoque do pedido voltam a ser o real.
 UPDATE public.sales_order_items i SET reserved_quantity=coalesce((
    SELECT sum(greatest(0,x.quantity-x.fulfilled_quantity-x.released_quantity))
    FROM public.inventory_reservations x WHERE x.sales_order_item_id=i.id
      AND x.status IN ('ACTIVE','PARTIALLY_CONSUMED')),0),updated_at=v_now
  WHERE i.organization_id=_org AND i.sales_order_id=ANY(v_orders);
 UPDATE public.sales_orders o SET stock_status=CASE
    WHEN NOT EXISTS(SELECT 1 FROM public.inventory_reservations rr
        WHERE rr.organization_id=_org AND rr.sales_order_id=o.id
          AND rr.status IN ('ACTIVE','PARTIALLY_CONSUMED')
          AND rr.quantity-rr.fulfilled_quantity-rr.released_quantity>0) THEN 'INSUFFICIENT'
    ELSE o.stock_status END,availability_checked_at=v_now,updated_at=v_now
  WHERE o.organization_id=_org AND o.id=ANY(v_orders)
    AND o.status NOT IN ('CANCELED','CLOSED','FULFILLED');
 PERFORM public.sales_audit(_org,'inventory_reservation.expired_batch','sales_orders',v_orders[1],
   jsonb_build_object('expired',v_n,'sales_order_ids',to_jsonb(v_orders)));
 RETURN jsonb_build_object('expired',v_n,'sales_order_ids',to_jsonb(v_orders));
END;
$$;
COMMIT;
