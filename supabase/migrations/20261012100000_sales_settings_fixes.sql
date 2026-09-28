-- =====================================================================
-- MASTER 013 (continuacao) — correcoes de_settings de vendas.
--
-- A migration 20261006100000_sales_orders.sql declarava `v_key text` e
-- recebia `cur.id` (uuid). Ao gravar as politicas, a chamada a `sales_audit`
-- recebia um text onde a assinatura exige uuid e a tela de Configuracoes
-- falhava sempre com "function public.sales_audit(uuid, unknown, unknown,
-- text, jsonb) does not exist". Nenhum teste cobria a escrita: o harness
-- apenas lia as politicas.
--
-- A migration publicada e preservada; a correcao vem em arquivo novo.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.sales_settings_save(_org uuid,_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cur public.sales_order_settings; cfg jsonb; v_key uuid;
 v_field text; v_value text;
BEGIN
 PERFORM public.sales_require(_org,'sales.configure');
 PERFORM public.sales_ensure_settings(_org);
 SELECT * INTO cur FROM public.sales_order_settings WHERE organization_id=_org FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Políticas de vendas não encontradas.'; END IF;
 v_key:=cur.id;
 IF nullif(_data->>'reservation_policy','') IS NOT NULL
    AND _data->>'reservation_policy' NOT IN ('FULL_ONLY','ALLOW_PARTIAL','ALLOW_NEGATIVE_AVAILABLE') THEN
  RAISE EXCEPTION 'Política de reserva inválida.';
 END IF;
 IF nullif(_data->>'price_override_policy','') IS NOT NULL
    AND _data->>'price_override_policy' NOT IN ('BLOCK','ALLOW_WITH_AUTHORIZATION') THEN
  RAISE EXCEPTION 'Política de preço inválida.';
 END IF;
 IF nullif(_data->>'receivable_trigger','') IS NOT NULL
    AND _data->>'receivable_trigger' NOT IN ('NONE','ON_APPROVAL','ON_DISPATCH') THEN
  RAISE EXCEPTION 'Gatilho financeiro inválido.';
 END IF;
 IF nullif(_data->>'credit_exposure_policy','') IS NOT NULL
    AND _data->>'credit_exposure_policy' NOT IN ('OPEN_RECEIVABLES_ONLY','OPEN_RECEIVABLES_PLUS_OPEN_ORDERS') THEN
  RAISE EXCEPTION 'Política de exposição inválida.';
 END IF;
 IF nullif(_data->>'tracking_mode','') IS NOT NULL
    AND _data->>'tracking_mode' NOT IN ('MANUAL','WEBHOOK') THEN
  RAISE EXCEPTION 'Modo de rastreamento inválido.';
 END IF;
 IF nullif(_data->>'max_discount_percent','') IS NOT NULL
    AND (nullif(_data->>'max_discount_percent','')::numeric<0 OR nullif(_data->>'max_discount_percent','')::numeric>100) THEN
  RAISE EXCEPTION 'Desconto máximo deve estar entre 0 e 100.';
 END IF;
 IF nullif(_data->>'reservation_expiry_hours','') IS NOT NULL
    AND (nullif(_data->>'reservation_expiry_hours','')::int<1 OR nullif(_data->>'reservation_expiry_hours','')::int>8760) THEN
  RAISE EXCEPTION 'Validade da reserva deve estar entre 1 e 8760 horas.';
 END IF;
 -- Um booleano nunca pode ser gravado a partir de texto livre fora de
 -- 'true'/'false'; a tela envia 'true'/'false' e o servidor valida.
 FOR v_field,v_value IN
  SELECT * FROM (VALUES
   ('make_to_order_enabled',_data->>'make_to_order_enabled'),
   ('approval_segregation',_data->>'approval_segregation'),
   ('allow_partial_fulfillment',_data->>'allow_partial_fulfillment'),
   ('shipment_requires_full_confirmation',_data->>'shipment_requires_full_confirmation'),
   ('require_shipping_address',_data->>'require_shipping_address')
  ) AS v(field,value)
 LOOP
  IF v_value IS NOT NULL AND nullif(v_value,'') IS NOT NULL
     AND lower(v_value) NOT IN ('true','false') THEN
   RAISE EXCEPTION 'Valor booleano inválido em %.',v_field;
  END IF;
 END LOOP;
 UPDATE public.sales_order_settings SET
   reservation_policy=coalesce(nullif(_data->>'reservation_policy',''),reservation_policy),
   reservation_expiry_hours=coalesce(nullif(_data->>'reservation_expiry_hours','')::int,reservation_expiry_hours),
   make_to_order_enabled=coalesce(nullif(_data->>'make_to_order_enabled','')::boolean,make_to_order_enabled),
   credit_exposure_policy=coalesce(nullif(_data->>'credit_exposure_policy',''),credit_exposure_policy),
   approval_segregation=coalesce(nullif(_data->>'approval_segregation','')::boolean,approval_segregation),
   max_discount_percent=coalesce(nullif(_data->>'max_discount_percent','')::numeric,max_discount_percent),
   price_override_policy=coalesce(nullif(_data->>'price_override_policy',''),price_override_policy),
   receivable_trigger=coalesce(nullif(_data->>'receivable_trigger',''),receivable_trigger),
   allow_partial_fulfillment=coalesce(nullif(_data->>'allow_partial_fulfillment','')::boolean,allow_partial_fulfillment),
   shipment_requires_full_confirmation=coalesce(nullif(_data->>'shipment_requires_full_confirmation','')::boolean,shipment_requires_full_confirmation),
   tracking_mode=coalesce(nullif(_data->>'tracking_mode',''),tracking_mode),
   require_shipping_address=coalesce(nullif(_data->>'require_shipping_address','')::boolean,require_shipping_address),
   updated_by=auth.uid(),updated_at=now()
 WHERE organization_id=_org;
 PERFORM public.sales_audit(_org,'sales_settings.updated','sales_order_settings',cur.id,_data);
 RETURN public.sales_settings(_org);
END;
$$;

-- ---------------------------------------------------------------------
-- 2. Transportadora: o INSERT passava `modality` como NULL explicito e
-- quebrava a coluna NOT NULL sempre que a tela nao informava a modalidade.
-- O botao "Nova transportadora" da interface falhava em 100% dos casos.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sales_carrier_save(_org uuid,_data jsonb,_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.carriers; ident uuid; v_name text; v_status text; v_doc jsonb;
 v_modality text; v_doc_type text; v_doc_number text;
BEGIN
 PERFORM public.sales_require(_org,'carriers.manage');
 v_name:=nullif(trim(coalesce(_data->>'name','')),'');
 IF v_name IS NULL THEN RAISE EXCEPTION 'Informe o nome da transportadora.'; END IF;
 v_status:=coalesce(nullif(_data->>'status',''),'ACTIVE');
 IF v_status NOT IN ('ACTIVE','INACTIVE') THEN RAISE EXCEPTION 'Situação inválida.'; END IF;
 v_modality:=coalesce(nullif(upper(trim(coalesce(_data->>'modality',''))),''),'COURIER');
 IF v_modality NOT IN ('ROAD','AIR','SEA','COURIER','OWN_FLEET','OTHER') THEN
  RAISE EXCEPTION 'Modalidade de transporte inválida.';
 END IF;
 v_doc_type:=nullif(_data->>'document_type','');
 IF v_doc_type IS NOT NULL AND v_doc_type NOT IN ('CNPJ','CPF','OTHER') THEN
  RAISE EXCEPTION 'Tipo de documento inválido.';
 END IF;
 v_doc_number:=nullif(trim(coalesce(_data->>'document_number','')),'');
 IF v_doc_type='CNPJ' AND v_doc_number IS NOT NULL AND v_doc_number !~ '^[0-9]{14}$' THEN
  RAISE EXCEPTION 'CNPJ inválido.';
 END IF;
 IF v_doc_type='CPF' AND v_doc_number IS NOT NULL AND v_doc_number !~ '^[0-9]{11}$' THEN
  RAISE EXCEPTION 'CPF inválido.';
 END IF;
 IF _id IS NULL THEN
  INSERT INTO public.carriers(organization_id,name,document_type,document_number,contact_name,contact_phone,modality,status,notes)
  VALUES(_org,v_name,v_doc_type,v_doc_number,
    nullif(trim(coalesce(_data->>'contact_name','')),''),
    nullif(trim(coalesce(_data->>'contact_phone',_data->>'phone','')),''),v_modality,v_status,
    nullif(trim(coalesce(_data->>'notes','')),''))
  RETURNING * INTO c;
 ELSE
  SELECT * INTO c FROM public.carriers WHERE id=_id AND organization_id=_org FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transportadora não encontrada.'; END IF;
  UPDATE public.carriers SET name=v_name,document_type=coalesce(v_doc_type,document_type),
   document_number=coalesce(v_doc_number,document_number),
   contact_name=coalesce(nullif(trim(coalesce(_data->>'contact_name','')),''),contact_name),
   contact_phone=coalesce(nullif(trim(coalesce(_data->>'contact_phone',_data->>'phone','')),''),contact_phone),
   modality=coalesce(nullif(upper(trim(coalesce(_data->>'modality',''))),''),modality),
   status=v_status,
   notes=coalesce(nullif(trim(coalesce(_data->>'notes','')),''),notes),updated_at=now() WHERE id=_id;
  SELECT * INTO c FROM public.carriers WHERE id=_id;
 END IF;
 PERFORM public.sales_audit(_org,coalesce(CASE WHEN _id IS NULL THEN 'carrier.created' ELSE 'carrier.updated' END),
   'carriers',c.id,jsonb_build_object('name',c.name,'status',c.status,'modality',c.modality));
 SELECT to_jsonb(c) INTO v_doc;
 RETURN v_doc;
END;
$$;
