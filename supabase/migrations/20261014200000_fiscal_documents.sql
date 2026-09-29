-- Fiscal document workflow: no inventory or financial writer is called here.
BEGIN;
ALTER TABLE inventory_locations ADD COLUMN fiscal_establishment_id uuid;
ALTER TABLE inventory_locations ADD CONSTRAINT inventory_fiscal_establishment_fk
 FOREIGN KEY(organization_id,fiscal_establishment_id) REFERENCES fiscal_establishments(organization_id,id);
CREATE TABLE public.fiscal_providers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 establishment_id uuid NOT NULL, name text NOT NULL, adapter_code text NOT NULL,
 environment fiscal_environment NOT NULL, status text NOT NULL DEFAULT 'PENDING_HOMOLOGATION'
 CHECK(status IN ('PENDING_HOMOLOGATION','DISABLED')),
 certificate_expires_at timestamptz, responsible_id uuid REFERENCES profiles,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(organization_id,id),
 FOREIGN KEY(organization_id,establishment_id) REFERENCES fiscal_establishments(organization_id,id)
);
ALTER TABLE fiscal_operation_natures ADD CONSTRAINT fiscal_nature_org_id UNIQUE(organization_id,id);
CREATE TABLE public.fiscal_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 establishment_id uuid NOT NULL, company_id uuid NOT NULL, document_model text NOT NULL CHECK(document_model='NFe'),
 operation_type_id uuid NOT NULL, source_type text NOT NULL CHECK(source_type IN ('SHIPMENT','PARTNER_SHIPMENT','CUSTOMER_RETURN','SUPPLIER_RETURN','PARTNER_RETURN','INTERNAL_TRANSFER')),
 source_id uuid NOT NULL, series text, document_number bigint, access_key text,
 issue_date date NOT NULL DEFAULT current_date, status fiscal_document_status NOT NULL DEFAULT 'DRAFT',
 environment fiscal_environment NOT NULL, provider_id uuid, authorization_protocol text, authorized_at timestamptz,
 total_amount numeric(18,2) NOT NULL DEFAULT 0, total_taxes numeric(18,2) NOT NULL DEFAULT 0,
 layout_version_id uuid NOT NULL, nature_id uuid NOT NULL,
 input_snapshot jsonb NOT NULL, validation_issues jsonb NOT NULL DEFAULT '[]',
 xml_storage_path text, pdf_storage_path text, approved_by uuid REFERENCES profiles,
 created_by uuid NOT NULL REFERENCES profiles, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,source_type,source_id),
 UNIQUE(organization_id,establishment_id,environment,document_model,series,document_number),
 FOREIGN KEY(organization_id,establishment_id) REFERENCES fiscal_establishments(organization_id,id),
 FOREIGN KEY(organization_id,company_id) REFERENCES companies(organization_id,id),
 FOREIGN KEY(organization_id,operation_type_id) REFERENCES fiscal_operation_types(organization_id,id),
 FOREIGN KEY(organization_id,nature_id) REFERENCES fiscal_operation_natures(organization_id,id),
 FOREIGN KEY(organization_id,layout_version_id) REFERENCES fiscal_layout_versions(organization_id,id),
 FOREIGN KEY(organization_id,provider_id) REFERENCES fiscal_providers(organization_id,id),
 CHECK(status NOT IN ('AUTHORIZED','CANCELLATION_REQUESTED','CANCELED') OR
   (authorization_protocol IS NOT NULL AND authorized_at IS NOT NULL AND access_key IS NOT NULL AND xml_storage_path IS NOT NULL))
);
CREATE TABLE public.fiscal_document_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 document_id uuid NOT NULL, product_variant_id uuid NOT NULL, source_item_id uuid NOT NULL,
 description text NOT NULL, quantity numeric(18,6) NOT NULL CHECK(quantity>0), fiscal_unit text NOT NULL,
 unit_price numeric(18,6) NOT NULL CHECK(unit_price>=0), discount numeric(18,6) NOT NULL DEFAULT 0,
 freight numeric(18,6) NOT NULL DEFAULT 0, total_amount numeric(18,2) NOT NULL,
 classification_snapshot jsonb NOT NULL, tax_snapshot jsonb NOT NULL,
 UNIQUE(organization_id,id), UNIQUE(document_id,source_item_id),
 FOREIGN KEY(organization_id,document_id) REFERENCES fiscal_documents(organization_id,id),
 FOREIGN KEY(organization_id,product_variant_id) REFERENCES product_variants(organization_id,id)
);
CREATE TABLE public.fiscal_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 document_id uuid NOT NULL, event_type text NOT NULL, from_status fiscal_document_status, to_status fiscal_document_status,
 official_protocol text, evidence_path text, details jsonb NOT NULL DEFAULT '{}',
 created_by uuid REFERENCES profiles, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,document_id) REFERENCES fiscal_documents(organization_id,id)
);
CREATE TABLE public.fiscal_transmission_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 document_id uuid NOT NULL, provider_id uuid, environment fiscal_environment NOT NULL,
 idempotency_key uuid NOT NULL, operation text NOT NULL, state text NOT NULL,
 remote_id text, response_code text, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,document_id) REFERENCES fiscal_documents(organization_id,id),
 FOREIGN KEY(organization_id,provider_id) REFERENCES fiscal_providers(organization_id,id),
 UNIQUE(organization_id,idempotency_key)
);
CREATE TABLE public.fiscal_exceptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 document_id uuid, exception_type text NOT NULL CHECK(exception_type IN (
 'MISSING_TAX_CONFIGURATION','INVALID_PRODUCT_CLASSIFICATION','INVALID_CUSTOMER_FISCAL_DATA',
 'INVALID_ESTABLISHMENT_DATA','INVALID_OPERATION_CLASSIFICATION','DOCUMENT_DUPLICATE','PROVIDER_UNAVAILABLE',
 'TRANSMISSION_TIMEOUT','AUTHORIZATION_REJECTED','INBOUND_DOCUMENT_MISMATCH','TAX_CALCULATION_DIVERGENCE',
 'FISCAL_FINANCIAL_MISMATCH','FISCAL_INVENTORY_MISMATCH')),
 severity text NOT NULL DEFAULT 'BLOCKING', status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED')),
 responsible_id uuid REFERENCES profiles, source_type text, source_id uuid, details jsonb NOT NULL,
 resolution text, history jsonb NOT NULL DEFAULT '[]', created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,document_id) REFERENCES fiscal_documents(organization_id,id)
);
CREATE OR REPLACE FUNCTION public.tax_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Snapshot fiscal é imutável; registre novo cálculo.'; END $$;
-- Preserve immutable simulation and document captures; bind document IDs to tenant.
ALTER TABLE tax_calculation_snapshots ADD CONSTRAINT fiscal_snapshot_document_fk
 FOREIGN KEY(organization_id,document_id) REFERENCES fiscal_documents(organization_id,id);
ALTER TABLE tax_calculation_snapshots ADD CONSTRAINT fiscal_snapshot_item_fk
 FOREIGN KEY(organization_id,document_item_id) REFERENCES fiscal_document_items(organization_id,id);

CREATE FUNCTION public.fiscal_source(_org uuid,_type text,_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF _type='SHIPMENT' THEN
  SELECT jsonb_build_object('company_id',o.company_id,'operation_kind','DIRECT_SALE','sales_order_id',o.id,
    'ordered_quantity',(SELECT sum(ordered_quantity) FROM sales_order_items WHERE organization_id=_org AND sales_order_id=o.id),
    'items',(SELECT jsonb_agg(jsonb_build_object('source_item_id',i.id,'product_variant_id',i.variant_id,
      'description',i.description_snapshot,'quantity',i.quantity,'unit_price',oi.unit_price,
      'discount',round(oi.discount_amount*i.quantity/oi.ordered_quantity,6),'freight',0,
      'inventory_movement_id',i.inventory_movement_id)) FROM shipment_items i
      JOIN sales_order_items oi ON oi.organization_id=i.organization_id AND oi.id=i.sales_order_item_id
      WHERE i.organization_id=_org AND i.shipment_id=s.id)) INTO result
  FROM shipments s JOIN sales_orders o ON o.organization_id=s.organization_id AND o.id=s.sales_order_id
  WHERE s.organization_id=_org AND s.id=_id AND s.dispatched_at IS NOT NULL AND s.status<>'CANCELED';
 ELSIF _type='PARTNER_SHIPMENT' THEN
  SELECT jsonb_build_object('company_id',p.company_id,'operation_kind','PARTNER_REMITTANCE','transfer_id',s.transfer_id,
    'items',(SELECT jsonb_agg(jsonb_build_object('source_item_id',i.id,'product_variant_id',i.variant_id,
      'description',v.sku,'quantity',i.quantity,'unit_price',NULL,'discount',0,'freight',0))
      FROM partner_shipment_items i JOIN product_variants v ON v.organization_id=i.organization_id AND v.id=i.variant_id
      WHERE i.organization_id=_org AND i.shipment_id=s.id)) INTO result
  FROM partner_shipments s JOIN partner_profiles p ON p.organization_id=s.organization_id AND p.id=s.partner_id
  WHERE s.organization_id=_org AND s.id=_id AND s.transfer_id IS NOT NULL AND s.status NOT IN ('DRAFT','CANCELED');
 ELSIF _type='CUSTOMER_RETURN' THEN
  SELECT jsonb_build_object('company_id',r.company_id,'operation_kind','CUSTOMER_RETURN','sales_order_id',r.sales_order_id,'original_shipment_id',r.shipment_id,
    'items',(SELECT jsonb_agg(jsonb_build_object('source_item_id',i.id,'product_variant_id',i.variant_id,'description',i.sku_snapshot,
      'quantity',i.received_quantity,'unit_price',NULL,'discount',0,'freight',0)) FROM customer_return_items i
      WHERE i.organization_id=_org AND i.customer_return_id=r.id AND i.received_quantity>0)) INTO result
  FROM customer_returns r WHERE r.organization_id=_org AND r.id=_id AND r.received_at IS NOT NULL AND r.status IN ('RECEIVED','INSPECTED','COMPLETED');
 ELSIF _type='SUPPLIER_RETURN' THEN
  SELECT jsonb_build_object('company_id',p.company_id,'operation_kind','SUPPLIER_RETURN','goods_receipt_id',r.goods_receipt_id,
    'items',(SELECT jsonb_agg(jsonb_build_object('source_item_id',i.id,'product_variant_id',i.variant_id,'description',v.sku,
      'quantity',i.quantity,'unit_price',NULL,'discount',0,'freight',0)) FROM supplier_return_items i
      JOIN product_variants v ON v.organization_id=i.organization_id AND v.id=i.variant_id WHERE i.organization_id=_org AND i.supplier_return_id=r.id)) INTO result
  FROM supplier_returns r JOIN supplier_profiles p ON p.organization_id=r.organization_id AND p.id=r.supplier_id
  WHERE r.organization_id=_org AND r.id=_id AND r.status='POSTED';
 ELSIF _type='PARTNER_RETURN' THEN
  SELECT jsonb_build_object('company_id',p.company_id,'operation_kind','PARTNER_RETURN','original_shipment_id',r.shipment_id,'transfer_id',r.transfer_id,
    'items',(SELECT jsonb_agg(jsonb_build_object('source_item_id',i.id,'product_variant_id',i.variant_id,'description',v.sku,
      'quantity',i.quantity,'unit_price',NULL,'discount',0,'freight',0)) FROM partner_return_items i
      JOIN product_variants v ON v.organization_id=i.organization_id AND v.id=i.variant_id WHERE i.organization_id=_org AND i.return_id=r.id)) INTO result
  FROM partner_returns r JOIN partner_profiles p ON p.organization_id=r.organization_id AND p.id=r.partner_id
  WHERE r.organization_id=_org AND r.id=_id AND r.status='RECEIVED' AND r.transfer_id IS NOT NULL;
 ELSIF _type='INTERNAL_TRANSFER' THEN
  SELECT jsonb_build_object('company_id',e.company_id,'operation_kind','INTERNAL_TRANSFER','source_establishment_id',l.fiscal_establishment_id,'destination_establishment_id',e.id,
    'items',(SELECT jsonb_agg(jsonb_build_object('source_item_id',i.id,'product_variant_id',i.variant_id,'description',v.sku,
      'quantity',i.quantity,'unit_price',NULL,'discount',0,'freight',0)) FROM inventory_transfer_items i
      JOIN product_variants v ON v.organization_id=i.organization_id AND v.id=i.variant_id WHERE i.organization_id=_org AND i.transfer_id=t.id)) INTO result
  FROM inventory_transfers t JOIN inventory_locations l ON l.organization_id=t.organization_id AND l.id=t.source_location_id
  JOIN inventory_locations dest ON dest.organization_id=t.organization_id AND dest.id=t.destination_location_id
  JOIN fiscal_establishments e ON e.organization_id=dest.organization_id AND e.id=dest.fiscal_establishment_id
  WHERE t.organization_id=_org AND t.id=_id AND t.status='COMPLETED' AND t.transfer_type='TRANSFER'
    AND l.fiscal_establishment_id IS NOT NULL AND l.fiscal_establishment_id<>e.id AND e.company_id IS NOT NULL;
 ELSE RAISE EXCEPTION 'Origem ainda não suportada para preparação: %',_type;
 END IF;
 IF result IS NULL OR result->'items' IS NULL OR result->'items'='null'::jsonb THEN
  RAISE EXCEPTION 'Operação inexistente ou sem expedição oficial nesta organização.';
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.fiscal_prepare(_org uuid,_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE est fiscal_establishments; op fiscal_operation_types; lay fiscal_layout_versions;
 nat fiscal_operation_natures; doc fiscal_documents; src jsonb; item jsonb; profile product_fiscal_profiles;
 sim jsonb; items jsonb:='[]'; tax jsonb; price numeric; item_id uuid; regime uuid;
BEGIN
 PERFORM fiscal_require(_org,'fiscal.documents.create'); PERFORM fiscal_require(_org,'fiscal.simulate');
 PERFORM inventory_lock(_org);
 SELECT * INTO doc FROM fiscal_documents WHERE organization_id=_org AND source_type=_data->>'source_type' AND source_id=(_data->>'source_id')::uuid;
 IF FOUND THEN
  IF doc.establishment_id IS DISTINCT FROM (_data->>'establishment_id')::uuid OR doc.operation_type_id IS DISTINCT FROM (_data->>'operation_type_id')::uuid
   OR doc.layout_version_id IS DISTINCT FROM (_data->>'layout_version_id')::uuid OR doc.nature_id IS DISTINCT FROM (_data->>'nature_id')::uuid THEN
   RAISE EXCEPTION 'Operação já vinculada a documento com outra configuração. Consulte o documento existente.'; END IF;
  RETURN to_jsonb(doc);
 END IF;
 src:=fiscal_source(_org,_data->>'source_type',(_data->>'source_id')::uuid);
 SELECT * INTO est FROM fiscal_establishments WHERE organization_id=_org AND id=(_data->>'establishment_id')::uuid AND status='ACTIVE';
 IF NOT FOUND THEN RAISE EXCEPTION 'Estabelecimento ativo obrigatório.'; END IF;
 IF src->>'source_establishment_id' IS NOT NULL AND (src->>'source_establishment_id')::uuid<>est.id THEN
  RAISE EXCEPTION 'Estabelecimento não corresponde à origem da transferência.'; END IF;
 IF _data->>'original_document_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM fiscal_documents WHERE organization_id=_org
   AND id=(_data->>'original_document_id')::uuid AND company_id=(src->>'company_id')::uuid) THEN
  RAISE EXCEPTION 'Documento original não pertence à contraparte/organização.'; END IF;
 SELECT * INTO op FROM fiscal_operation_types WHERE organization_id=_org AND id=(_data->>'operation_type_id')::uuid AND is_active AND requires_document;
 IF NOT FOUND OR op.kind::text<>src->>'operation_kind' THEN RAISE EXCEPTION 'Classificação da operação incompatível com a origem.'; END IF;
 SELECT * INTO lay FROM fiscal_layout_versions WHERE organization_id=_org AND id=(_data->>'layout_version_id')::uuid
 AND document_model='NFe' AND status='ACTIVE' AND valid_from<=current_date AND (valid_to IS NULL OR valid_to>=current_date);
 IF NOT FOUND THEN RAISE EXCEPTION 'Leiaute NF-e vigente e homologado obrigatório.'; END IF;
 SELECT * INTO nat FROM fiscal_operation_natures WHERE organization_id=_org AND id=(_data->>'nature_id')::uuid
 AND operation_type_id=op.id AND document_model='NFe' AND status='ACTIVE'
 AND (establishment_id IS NULL OR establishment_id=est.id) AND valid_from<=current_date AND (valid_to IS NULL OR valid_to>=current_date);
 IF NOT FOUND OR nullif(nat.cfop_code,'') IS NULL THEN RAISE EXCEPTION 'Natureza fiscal aprovada e vigente obrigatória.'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(src->'items') LOOP
  IF _data->>'source_type'<>'SHIPMENT' THEN
   price:=(_data->'remittance_prices'->>(item->>'source_item_id'))::numeric;
   IF price IS NULL OR price<0 OR length(trim(coalesce(_data->>'valuation_reason','')))=0 THEN
    RAISE EXCEPTION 'Operação exige valoração fiscal explícita e justificativa; valores e tributos originais não são copiados.';
   END IF;
   item:=item||jsonb_build_object('unit_price',price);
  END IF;
  items:=items||jsonb_build_array(item);
 END LOOP;
 sim:=fiscal_simulate(_org,est.id,op.id,(src->>'company_id')::uuid,'NFe',items,current_date);
 IF (sim->>'has_blocking_issue')::boolean THEN RAISE EXCEPTION 'Preparação bloqueada: %',sim->'warnings'; END IF;
 SELECT tax_regime_id INTO regime FROM fiscal_establishment_regime_history WHERE organization_id=_org AND establishment_id=est.id
 AND valid_from<=current_date AND (valid_to IS NULL OR valid_to>=current_date) ORDER BY valid_from DESC LIMIT 1;
 INSERT INTO fiscal_documents(organization_id,establishment_id,company_id,document_model,operation_type_id,source_type,source_id,
 environment,layout_version_id,nature_id,input_snapshot,total_taxes,created_by)
 VALUES(_org,est.id,(src->>'company_id')::uuid,'NFe',op.id,_data->>'source_type',(_data->>'source_id')::uuid,
 est.environment,lay.id,nat.id,jsonb_build_object('source',src,'establishment',to_jsonb(est),'layout',to_jsonb(lay),
 'nature',to_jsonb(nat),'original_document_id',_data->>'original_document_id','valuation_reason',_data->>'valuation_reason','simulation_id',sim->>'simulation_id'),(sim->>'total_taxes')::numeric,auth.uid()) RETURNING * INTO doc;
 FOR item IN SELECT value FROM jsonb_array_elements(items) LOOP
  SELECT * INTO profile FROM product_fiscal_profiles WHERE id=fiscal_product_profile(_org,(item->>'product_variant_id')::uuid,current_date);
  SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO tax FROM fiscal_calculate_item(_org,op.id,est.id,(item->>'product_variant_id')::uuid,
  doc.company_id,'NFe',(item->>'quantity')::numeric,(item->>'unit_price')::numeric,(item->>'discount')::numeric,0,regime) t;
  INSERT INTO fiscal_document_items(organization_id,document_id,product_variant_id,source_item_id,description,quantity,fiscal_unit,unit_price,discount,total_amount,classification_snapshot,tax_snapshot)
  VALUES(_org,doc.id,profile.product_variant_id,(item->>'source_item_id')::uuid,item->>'description',(item->>'quantity')::numeric,
  profile.fiscal_unit,(item->>'unit_price')::numeric,(item->>'discount')::numeric,
  round((item->>'quantity')::numeric*(item->>'unit_price')::numeric-(item->>'discount')::numeric,2),to_jsonb(profile),tax) RETURNING id INTO item_id;
  INSERT INTO tax_calculation_snapshots SELECT (jsonb_populate_record(NULL::tax_calculation_snapshots,
    value||jsonb_build_object('document_id',doc.id,'document_item_id',item_id,'is_simulation',false))).*
    FROM jsonb_array_elements(tax);
 END LOOP;
 UPDATE fiscal_documents SET total_amount=(SELECT sum(total_amount) FROM fiscal_document_items WHERE document_id=doc.id) WHERE id=doc.id RETURNING * INTO doc;
 INSERT INTO fiscal_events(organization_id,document_id,event_type,to_status,created_by) VALUES(_org,doc.id,'PREPARED','DRAFT',auth.uid());
 PERFORM fiscal_emit(_org,'FISCAL_DOCUMENT_PREPARED',doc.id::text||':prepared',jsonb_build_object('document_id',doc.id,'source_type',doc.source_type,'source_id',doc.source_id));
 PERFORM fiscal_audit(_org,'fiscal.document_prepared','fiscal_documents',doc.id);
 RETURN to_jsonb(doc);
END $$;

CREATE FUNCTION public.fiscal_document_action(_org uuid,_id uuid,_action text,_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE doc fiscal_documents; target fiscal_document_status; issues jsonb:='[]'; snapshot jsonb; field text; i record;
BEGIN
 PERFORM fiscal_require(_org,CASE _action WHEN 'validate' THEN 'fiscal.documents.validate'
 WHEN 'approve' THEN 'fiscal.documents.validate' WHEN 'submit' THEN 'fiscal.documents.issue'
 WHEN 'cancel' THEN 'fiscal.documents.cancel' ELSE 'fiscal.documents.create' END);
 SELECT * INTO doc FROM fiscal_documents WHERE organization_id=_org AND id=_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
 IF _action='validate' THEN
  IF doc.status NOT IN ('DRAFT','PENDING_VALIDATION') THEN RAISE EXCEPTION 'Estado não permite validação.'; END IF;
  snapshot:=doc.input_snapshot||jsonb_build_object('recipient',(SELECT to_jsonb(c) FROM company_fiscal_profiles c WHERE organization_id=_org AND company_id=doc.company_id
    AND status IN ('APPROVED','ACTIVE') AND effective_from<=doc.issue_date AND (effective_to IS NULL OR effective_to>=doc.issue_date) ORDER BY version DESC LIMIT 1),
    'issuer_address',(SELECT to_jsonb(a) FROM company_addresses a WHERE organization_id=_org AND id=(doc.input_snapshot->'establishment'->>'fiscal_address_id')::uuid),
    'recipient_address',(SELECT to_jsonb(a) FROM company_addresses a WHERE organization_id=_org AND company_id=doc.company_id AND is_primary ORDER BY type LIMIT 1));
  FOR field IN SELECT jsonb_array_elements_text(doc.input_snapshot->'layout'->'required_fields') LOOP
   IF nullif(trim(snapshot#>>string_to_array(field,'.')),'') IS NULL THEN issues:=issues||jsonb_build_array(jsonb_build_object('field',field,'message','Campo obrigatório ausente')); END IF;
  END LOOP;
  IF snapshot->'recipient' IS NULL OR snapshot->'recipient'='null' THEN issues:=issues||'[{"field":"recipient","message":"Perfil fiscal aprovado obrigatório"}]'; END IF;
  target:=CASE WHEN jsonb_array_length(issues)=0 THEN 'VALIDATED'::fiscal_document_status ELSE 'PENDING_VALIDATION'::fiscal_document_status END;
  UPDATE fiscal_documents SET input_snapshot=snapshot,validation_issues=issues WHERE id=doc.id;
 ELSIF _action='approve' THEN
  IF doc.status<>'VALIDATED' THEN RAISE EXCEPTION 'Conferência exige documento validado.'; END IF;
  IF length(trim(coalesce(_data->>'reason','')))=0 THEN RAISE EXCEPTION 'Informe a justificativa da conferência.'; END IF;
  target:='READY_TO_SEND'; UPDATE fiscal_documents SET approved_by=auth.uid() WHERE id=doc.id;
 ELSIF _action IN ('submit','cancel') THEN
  IF (_action='submit' AND doc.status<>'READY_TO_SEND') OR (_action='cancel' AND doc.status<>'AUTHORIZED') THEN RAISE EXCEPTION 'Estado incompatível com a solicitação.'; END IF;
  -- No production adapter is installed. Record the blocked request without a fictitious transmission.
  INSERT INTO fiscal_exceptions(organization_id,document_id,exception_type,details)
  VALUES(_org,doc.id,'PROVIDER_UNAVAILABLE',jsonb_build_object('message','Nenhum adaptador configurado e homologado para esta operação.'));
  PERFORM fiscal_audit(_org,'fiscal.provider_blocked','fiscal_documents',doc.id);
  RETURN jsonb_build_object('blocked',true,'message','Emissão real bloqueada: provedor não configurado e homologado.','status',doc.status);
 ELSE RAISE EXCEPTION 'Ação fiscal não suportada.';
 END IF;
 UPDATE fiscal_documents SET status=target,updated_at=now() WHERE id=doc.id;
 INSERT INTO fiscal_events(organization_id,document_id,event_type,from_status,to_status,details,created_by)
 VALUES(_org,doc.id,upper(_action),doc.status,target,jsonb_build_object('reason',_data->>'reason','issues',issues),auth.uid());
 PERFORM fiscal_emit(_org,'FISCAL_DOCUMENT_STATE_CHANGED',doc.id::text||':'||target::text,jsonb_build_object('document_id',doc.id,'status',target));
 PERFORM fiscal_audit(_org,'fiscal.document_'||_action,'fiscal_documents',doc.id);
 RETURN jsonb_build_object('id',doc.id,'status',target,'issues',issues);
END $$;

-- Do not mutate captured facts after validation. Official states have no public setter.
CREATE FUNCTION public.fiscal_document_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('READY_TO_SEND','SENDING','PROCESSING','AUTHORIZED','CANCELLATION_REQUESTED','CANCELED','DENIED')
 AND (to_jsonb(NEW)-'status'-'updated_at'-'provider_id'-'authorization_protocol'-'authorized_at'-'access_key'-'xml_storage_path'-'pdf_storage_path')
 IS DISTINCT FROM (to_jsonb(OLD)-'status'-'updated_at'-'provider_id'-'authorization_protocol'-'authorized_at'-'access_key'-'xml_storage_path'-'pdf_storage_path') THEN
 RAISE EXCEPTION 'Documento conferido é imutável.'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER fiscal_document_immutable BEFORE UPDATE ON fiscal_documents FOR EACH ROW EXECUTE FUNCTION fiscal_document_guard();

-- Existing numbering must distinguish environments. Allocation stays private until an adapter exists.
ALTER TABLE fiscal_number_sequences ADD COLUMN environment fiscal_environment NOT NULL DEFAULT 'HOMOLOGATION';
ALTER TABLE fiscal_number_sequences DROP CONSTRAINT fiscal_number_sequences_pkey;
ALTER TABLE fiscal_number_sequences ADD PRIMARY KEY(organization_id,establishment_id,environment,document_model,series);
CREATE FUNCTION public.fiscal_allocate_number(_org uuid,_est uuid,_env fiscal_environment,_model text,_series text) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n bigint;
BEGIN
 INSERT INTO fiscal_number_sequences(organization_id,establishment_id,environment,document_model,series,next_number)
 VALUES(_org,_est,_env,_model,_series,2)
 ON CONFLICT(organization_id,establishment_id,environment,document_model,series)
 DO UPDATE SET next_number=fiscal_number_sequences.next_number+1 RETURNING next_number-1 INTO n;
 RETURN n;
END $$;
ALTER TABLE fiscal_providers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal_providers FROM anon,authenticated;
GRANT SELECT ON fiscal_providers TO authenticated;
CREATE POLICY fiscal_providers_read ON fiscal_providers FOR SELECT TO authenticated USING(has_permission(organization_id,'fiscal.provider.manage'));
ALTER TABLE fiscal_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal_documents FROM anon,authenticated;
GRANT SELECT ON fiscal_documents TO authenticated;
CREATE POLICY fiscal_documents_read ON fiscal_documents FOR SELECT TO authenticated USING(has_permission(organization_id,'fiscal.read'));
ALTER TABLE fiscal_document_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal_document_items FROM anon,authenticated;
GRANT SELECT ON fiscal_document_items TO authenticated;
CREATE POLICY fiscal_document_items_read ON fiscal_document_items FOR SELECT TO authenticated USING(has_permission(organization_id,'fiscal.read'));
ALTER TABLE fiscal_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal_events FROM anon,authenticated;
GRANT SELECT ON fiscal_events TO authenticated;
CREATE POLICY fiscal_events_read ON fiscal_events FOR SELECT TO authenticated USING(has_permission(organization_id,'fiscal.events.read'));
ALTER TABLE fiscal_transmission_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal_transmission_attempts FROM anon,authenticated;
GRANT SELECT ON fiscal_transmission_attempts TO authenticated;
CREATE POLICY fiscal_transmission_attempts_read ON fiscal_transmission_attempts FOR SELECT TO authenticated USING(has_permission(organization_id,'fiscal.documents.read'));
ALTER TABLE fiscal_exceptions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal_exceptions FROM anon,authenticated;
GRANT SELECT ON fiscal_exceptions TO authenticated;
CREATE POLICY fiscal_exceptions_read ON fiscal_exceptions FOR SELECT TO authenticated USING(has_permission(organization_id,'fiscal.exceptions.read'));
DO $$ DECLARE f record; BEGIN FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'fiscal_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature); END LOOP; END $$;
COMMIT;
