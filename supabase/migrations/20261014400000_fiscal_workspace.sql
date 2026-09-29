BEGIN;
CREATE OR REPLACE FUNCTION public.fiscal_save_nature(_org uuid,_data jsonb,_id uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r fiscal_operation_natures;
BEGIN
 PERFORM fiscal_require(_org,'fiscal.configure'); PERFORM inventory_lock(_org);
 IF _id IS NULL THEN
 INSERT INTO fiscal_operation_natures(organization_id,operation_type_id,establishment_id,document_model,fiscal_nature,cfop_code,purpose,version,valid_from,valid_to,justification,created_by)
 VALUES(_org,(_data->>'operation_type_id')::uuid,(_data->>'establishment_id')::uuid,'NFe',_data->>'fiscal_nature',_data->>'cfop_code',_data->>'purpose',
 coalesce((_data->>'version')::int,1),coalesce((_data->>'valid_from')::date,current_date),(_data->>'valid_to')::date,_data->>'justification',auth.uid()) RETURNING * INTO r;
 ELSE
 SELECT * INTO r FROM fiscal_operation_natures WHERE organization_id=_org AND id=_id FOR UPDATE;
 IF NOT FOUND OR r.status<>'DRAFT' THEN RAISE EXCEPTION 'Natureza inexistente ou imutável; crie nova versão.'; END IF;
 UPDATE fiscal_operation_natures SET fiscal_nature=coalesce(_data->>'fiscal_nature',fiscal_nature),cfop_code=coalesce(_data->>'cfop_code',cfop_code),
 purpose=coalesce(_data->>'purpose',purpose),justification=coalesce(_data->>'justification',justification) WHERE id=_id RETURNING * INTO r;
 END IF;
 PERFORM fiscal_audit(_org,'fiscal.nature_saved','fiscal_operation_natures',r.id); RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.fiscal_nature_action(_org uuid,_id uuid,_action text,_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r fiscal_operation_natures; target tax_rule_status;
BEGIN
 PERFORM fiscal_require(_org,CASE WHEN _action='submit' THEN 'fiscal.configure' ELSE 'fiscal.tax_rules.approve' END);
 SELECT * INTO r FROM fiscal_operation_natures WHERE organization_id=_org AND id=_id FOR UPDATE;
 IF NOT FOUND OR length(trim(coalesce(_reason,'')))=0 THEN RAISE EXCEPTION 'Natureza e justificativa obrigatórias.'; END IF;
 target:=CASE WHEN _action='submit' AND r.status='DRAFT' THEN 'REVIEW'::tax_rule_status
 WHEN _action='approve' AND r.status='REVIEW' AND r.created_by<>auth.uid() THEN 'APPROVED'::tax_rule_status
 WHEN _action='activate' AND r.status='APPROVED' THEN 'ACTIVE'::tax_rule_status
 WHEN _action='retire' AND r.status='ACTIVE' THEN 'RETIRED'::tax_rule_status END;
 IF target IS NULL THEN RAISE EXCEPTION 'Transição ou aprovador inválido.'; END IF;
 UPDATE fiscal_operation_natures SET status=target,approved_by=CASE WHEN target='APPROVED' THEN auth.uid() ELSE approved_by END,
 approved_at=CASE WHEN target='APPROVED' THEN now() ELSE approved_at END WHERE id=_id;
 PERFORM fiscal_audit(_org,'fiscal.nature_'||_action,'fiscal_operation_natures',_id,jsonb_build_object('reason',_reason));
 RETURN jsonb_build_object('id',_id,'status',target);
END $$;
CREATE FUNCTION public.fiscal_exception_action(_org uuid,_id uuid,_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r fiscal_exceptions;
BEGIN
 PERFORM fiscal_require(_org,'fiscal.exceptions.manage');
 IF length(trim(coalesce(_data->>'reason','')))=0 THEN RAISE EXCEPTION 'Resolução exige justificativa.'; END IF;
 IF _data->>'responsible_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM organization_members WHERE organization_id=_org AND user_id=(_data->>'responsible_id')::uuid AND is_active) THEN
 RAISE EXCEPTION 'Responsável não pertence à organização.'; END IF;
 UPDATE fiscal_exceptions SET status=coalesce(_data->>'status',status),responsible_id=coalesce((_data->>'responsible_id')::uuid,responsible_id),
 resolution=_data->>'reason',history=history||jsonb_build_array(jsonb_build_object('user',auth.uid(),'at',now(),'status',_data->>'status','reason',_data->>'reason'))
 WHERE organization_id=_org AND id=_id RETURNING * INTO r;
 IF NOT FOUND THEN RAISE EXCEPTION 'Exceção inexistente.'; END IF;
 PERFORM fiscal_audit(_org,'fiscal.exception_resolved','fiscal_exceptions',_id); RETURN to_jsonb(r);
END $$;
CREATE FUNCTION public.fiscal_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tbl text; perm text; result jsonb; offst int:=greatest(0,coalesce((_filters->>'offset')::int,0));
BEGIN
 perm:=CASE WHEN _kind='dashboard' THEN 'fiscal.dashboard' WHEN _kind IN ('rules','rule_items','reviews') THEN 'fiscal.tax_rules.read'
 WHEN _kind='reconciliations' THEN 'fiscal.reconciliation.read' WHEN _kind='inbound' THEN 'fiscal.inbound.read'
 WHEN _kind='exceptions' THEN 'fiscal.exceptions.read' WHEN _kind='events' THEN 'fiscal.events.read' ELSE 'fiscal.read' END;
 PERFORM fiscal_require(_org,perm);
 IF _kind='dashboard' THEN
  RETURN jsonb_build_object('documents',(SELECT coalesce(jsonb_object_agg(status,n),'{}') FROM
   (SELECT status,count(*) n FROM fiscal_documents WHERE organization_id=_org
    AND (_filters->>'establishment_id' IS NULL OR establishment_id=(_filters->>'establishment_id')::uuid)
    AND (_filters->>'from' IS NULL OR issue_date>=(_filters->>'from')::date)
    AND (_filters->>'to' IS NULL OR issue_date<=(_filters->>'to')::date) GROUP BY status) t),
   'inbound',(SELECT count(*) FROM inbound_fiscal_documents WHERE organization_id=_org
 AND (_filters->>'establishment_id' IS NULL OR establishment_id=(_filters->>'establishment_id')::uuid)
 AND (_filters->>'from' IS NULL OR issue_date>=(_filters->>'from')::date)
 AND (_filters->>'to' IS NULL OR issue_date<=(_filters->>'to')::date)),
   'exceptions',(SELECT count(*) FROM fiscal_exceptions WHERE organization_id=_org AND status<>'RESOLVED'),
   'provider_ready',false);
 ELSIF _kind='detail' THEN
  RETURN jsonb_build_object('document',(SELECT to_jsonb(d) FROM fiscal_documents d WHERE organization_id=_org AND id=(_filters->>'id')::uuid),
    'items',(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') FROM fiscal_document_items i WHERE organization_id=_org AND document_id=(_filters->>'id')::uuid),
    'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY created_at),'[]') FROM fiscal_events e WHERE organization_id=_org AND document_id=(_filters->>'id')::uuid));
 END IF;
 IF _kind='inbound_context' THEN
  PERFORM fiscal_require(_org,'fiscal.inbound.review');
  RETURN jsonb_build_object('receipt_items',(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') FROM goods_receipt_items i WHERE organization_id=_org AND goods_receipt_id=(_filters->>'receipt_id')::uuid),
   'supplier_documents',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'label',document_number)),'[]') FROM supplier_documents WHERE organization_id=_org AND goods_receipt_id=(_filters->>'receipt_id')::uuid),
   'payables',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'label',document_number||' · '||original_amount)),'[]') FROM account_payables WHERE organization_id=_org AND
    (source_id=_filters->>'receipt_id' OR source_id IN (SELECT id::text FROM supplier_documents WHERE organization_id=_org AND goods_receipt_id=(_filters->>'receipt_id')::uuid)
     OR source_id IN (SELECT purchase_order_id::text FROM goods_receipts WHERE organization_id=_org AND id=(_filters->>'receipt_id')::uuid))));
 END IF;
 IF _kind='source_detail' THEN RETURN fiscal_source(_org,_filters->>'source_type',(_filters->>'id')::uuid); END IF;
 IF _kind='source_options' THEN
  SELECT coalesce(jsonb_agg(row),'[]') INTO result FROM (
   SELECT jsonb_build_object('id',id,'label',label) row FROM (
    SELECT id,shipment_number label,'SHIPMENT' type FROM shipments WHERE organization_id=_org AND dispatched_at IS NOT NULL AND status<>'CANCELED'
    UNION ALL SELECT id,shipment_number,'PARTNER_SHIPMENT' FROM partner_shipments WHERE organization_id=_org AND transfer_id IS NOT NULL
    UNION ALL SELECT id,return_number,'CUSTOMER_RETURN' FROM customer_returns WHERE organization_id=_org AND received_at IS NOT NULL
    UNION ALL SELECT id,return_number,'SUPPLIER_RETURN' FROM supplier_returns WHERE organization_id=_org AND status='POSTED'
    UNION ALL SELECT id,return_number,'PARTNER_RETURN' FROM partner_returns WHERE organization_id=_org AND status='RECEIVED'
    UNION ALL SELECT id,'Transferência '||left(id::text,8),'INTERNAL_TRANSFER' FROM inventory_transfers WHERE organization_id=_org AND status='COMPLETED'
   ) x WHERE type=_filters->>'source_type' AND label ILIKE '%'||coalesce(_filters->>'search','')||'%' ORDER BY label LIMIT 50
  ) y; RETURN result;
 END IF;
 IF _kind IN ('company_options','variant_options','address_options','supplier_options','shipment_options','receipt_options','location_options') THEN
  IF _kind='location_options' THEN
   SELECT coalesce(jsonb_agg(row),'[]') INTO result FROM (SELECT jsonb_build_object('id',id,'label',name||' · '||code) row
   FROM inventory_locations WHERE organization_id=_org AND name ILIKE '%'||coalesce(_filters->>'search','')||'%' ORDER BY name LIMIT 50) s;
  ELSIF _kind='company_options' THEN
   SELECT coalesce(jsonb_agg(row),'[]') INTO result FROM (SELECT jsonb_build_object('id',id,'label',legal_name||' · '||code) row
   FROM companies WHERE organization_id=_org AND (coalesce(_filters->>'search','')='' OR legal_name ILIKE '%'||(_filters->>'search')||'%') ORDER BY legal_name LIMIT 50) s;
  ELSIF _kind='variant_options' THEN
   SELECT coalesce(jsonb_agg(row),'[]') INTO result FROM (SELECT jsonb_build_object('id',id,'label',sku) row
   FROM product_variants WHERE organization_id=_org AND sku ILIKE '%'||coalesce(_filters->>'search','')||'%' ORDER BY sku LIMIT 50) s;
  ELSIF _kind='address_options' THEN
   SELECT coalesce(jsonb_agg(row),'[]') INTO result FROM (SELECT jsonb_build_object('id',a.id,'label',c.legal_name||' · '||a.street||' · '||a.city) row
   FROM company_addresses a JOIN companies c ON c.organization_id=a.organization_id AND c.id=a.company_id
   WHERE a.organization_id=_org AND (c.legal_name||' '||a.street) ILIKE '%'||coalesce(_filters->>'search','')||'%' ORDER BY a.id LIMIT 50) s;
  ELSIF _kind='supplier_options' THEN
   SELECT coalesce(jsonb_agg(row),'[]') INTO result FROM (SELECT jsonb_build_object('id',s.id,'label',c.legal_name) row
   FROM supplier_profiles s JOIN companies c ON c.organization_id=s.organization_id AND c.id=s.company_id
   WHERE s.organization_id=_org AND c.legal_name ILIKE '%'||coalesce(_filters->>'search','')||'%' ORDER BY c.legal_name LIMIT 50) s;
  ELSIF _kind='receipt_options' THEN
   SELECT coalesce(jsonb_agg(row),'[]') INTO result FROM (SELECT jsonb_build_object('id',id,'label',receipt_number) row FROM goods_receipts
   WHERE organization_id=_org AND receipt_number ILIKE '%'||coalesce(_filters->>'search','')||'%' ORDER BY created_at DESC LIMIT 50) s;
  ELSE
   SELECT coalesce(jsonb_agg(row),'[]') INTO result FROM (SELECT jsonb_build_object('id',s.id,'label',s.shipment_number||' · '||c.legal_name) row
   FROM shipments s JOIN sales_orders o ON o.organization_id=s.organization_id AND o.id=s.sales_order_id
   JOIN companies c ON c.organization_id=o.organization_id AND c.id=o.company_id
   WHERE s.organization_id=_org AND s.dispatched_at IS NOT NULL AND s.status<>'CANCELED'
   AND (s.shipment_number||' '||c.legal_name) ILIKE '%'||coalesce(_filters->>'search','')||'%' ORDER BY s.created_at DESC LIMIT 50) s;
  END IF;
  RETURN result;
 END IF;
 tbl:=CASE _kind WHEN 'documents' THEN 'fiscal_documents' WHEN 'inbound' THEN 'inbound_fiscal_documents'
 WHEN 'events' THEN 'fiscal_events' WHEN 'exceptions' THEN 'fiscal_exceptions' WHEN 'reconciliations' THEN 'fiscal_reconciliations'
 WHEN 'establishments' THEN 'fiscal_establishments' WHEN 'regimes' THEN 'fiscal_tax_regimes' WHEN 'operations' THEN 'fiscal_operation_types'
 WHEN 'natures' THEN 'fiscal_operation_natures' WHEN 'products' THEN 'product_fiscal_profiles' WHEN 'companies' THEN 'company_fiscal_profiles'
 WHEN 'taxes' THEN 'fiscal_taxes' WHEN 'layouts' THEN 'fiscal_layout_versions' WHEN 'rules' THEN 'tax_rules'
 WHEN 'rule_items' THEN 'tax_rule_items' WHEN 'reviews' THEN 'tax_rule_reviews' WHEN 'simulations' THEN 'fiscal_simulations' WHEN 'providers' THEN 'fiscal_providers' END;
 IF tbl IS NULL THEN RAISE EXCEPTION 'Consulta fiscal inválida.'; END IF;
 EXECUTE format('SELECT coalesce(jsonb_agg(row),''[]'') FROM (SELECT to_jsonb(t) row FROM %I t WHERE organization_id=$1
 AND ($2->>''search'' IS NULL OR to_jsonb(t)::text ILIKE ''%%''||($2->>''search'')||''%%'')
 AND ($2->>''status'' IS NULL OR to_jsonb(t)->>''status''=$2->>''status'')
 AND ($2->>''establishment_id'' IS NULL OR to_jsonb(t)->>''establishment_id''=$2->>''establishment_id'')
 AND ($2->>''from'' IS NULL OR coalesce(to_jsonb(t)->>''issue_date'',to_jsonb(t)->>''created_at'') >= $2->>''from'')
 AND ($2->>''to'' IS NULL OR left(coalesce(to_jsonb(t)->>''issue_date'',to_jsonb(t)->>''created_at''),10) <= $2->>''to'')
 ORDER BY id DESC LIMIT 50 OFFSET $3) s',tbl) INTO result USING _org,_filters,offst;
 RETURN result;
END $$;
CREATE FUNCTION public.fiscal_execute(_org uuid,_operation text,_id uuid DEFAULT NULL,_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 CASE _operation
 WHEN 'report' THEN
  PERFORM fiscal_require(_org,'fiscal.reports.export');
  IF _data->>'kind' NOT IN ('documents','inbound','reconciliations') THEN RAISE EXCEPTION 'Relatório inválido.'; END IF;
  PERFORM fiscal_audit(_org,'fiscal.report_exported','fiscal_reports',NULL,jsonb_build_object('kind',_data->>'kind'));
  RETURN fiscal_query(_org,_data->>'kind',coalesce(_data->'filters','{}'));
 WHEN 'location_establishment' THEN
  PERFORM fiscal_require(_org,'fiscal.configure');
  UPDATE inventory_locations SET fiscal_establishment_id=(_data->>'establishment_id')::uuid WHERE organization_id=_org AND id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Localização inexistente.'; END IF;
  PERFORM fiscal_audit(_org,'fiscal.location_linked','inventory_locations',_id); RETURN jsonb_build_object('id',_id);
 WHEN 'establishment' THEN RETURN fiscal_save_establishment(_org,_data,_id);
 WHEN 'regime' THEN RETURN fiscal_save_regime(_org,_data,_id);
 WHEN 'operation' THEN RETURN fiscal_save_operation(_org,_data,_id);
 WHEN 'nature' THEN RETURN fiscal_save_nature(_org,_data,_id);
 WHEN 'layout' THEN RETURN fiscal_save_layout(_org,_data,_id);
 WHEN 'tax' THEN RETURN fiscal_save_tax(_org,_data,_id);
 WHEN 'rule' THEN RETURN fiscal_save_rule(_org,_data,_id);
 WHEN 'product' THEN RETURN fiscal_save_product_profile(_org,_data,_id);
 WHEN 'company' THEN RETURN fiscal_save_company_profile(_org,_data,_id);
 WHEN 'test_rule' THEN RETURN fiscal_test_rule(_org,_id,_data->'cases');
 WHEN 'rule_action' THEN RETURN fiscal_rule_action(_org,_id,_data->>'action',_data->>'reason',coalesce(_data->'regression_evidence','{}'));
 WHEN 'profile_action' THEN RETURN fiscal_profile_action(_org,_data->>'table',_id,_data->>'action',_data->>'reason');
 WHEN 'nature_action' THEN RETURN fiscal_nature_action(_org,_id,_data->>'action',_data->>'reason');
 WHEN 'prepare' THEN RETURN fiscal_prepare(_org,_data);
 WHEN 'document_action' THEN RETURN fiscal_document_action(_org,_id,_data->>'action',_data);
 WHEN 'reconcile' THEN RETURN fiscal_reconcile(_org,_id,coalesce((_data->>'inbound')::boolean,false),_data);
 WHEN 'exception' THEN RETURN fiscal_exception_action(_org,_id,_data);
 WHEN 'simulate' THEN RETURN fiscal_simulate(_org,(_data->>'establishment_id')::uuid,(_data->>'operation_type_id')::uuid,
  (_data->>'company_id')::uuid,coalesce(_data->>'document_model','NFe'),_data->'items',coalesce((_data->>'on_date')::date,current_date));
 ELSE RAISE EXCEPTION 'Operação fiscal inválida.';
 END CASE;
END $$;
INSERT INTO role_permissions(role,permission) SELECT r,p FROM unnest(ARRAY['admin','gestor']::app_role[]) r CROSS JOIN unnest(ARRAY[
'fiscal.documents.create','fiscal.documents.validate','fiscal.documents.issue','fiscal.documents.download','fiscal.inbound.review','fiscal.reports.export','fiscal.provider.manage']) p ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role,permission) SELECT 'fiscal',p FROM unnest(ARRAY[
'fiscal.documents.create','fiscal.documents.validate','fiscal.documents.issue','fiscal.documents.download','fiscal.inbound.review','fiscal.reports.export']) p ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role,permission) VALUES('financeiro','fiscal.inbound.review'),('financeiro','fiscal.documents.download') ON CONFLICT DO NOTHING;

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES('fiscal-private','fiscal-private',false,2097152,ARRAY['application/xml','text/xml','application/pdf']) ON CONFLICT(id) DO NOTHING;
CREATE FUNCTION public.fiscal_storage_allowed(_name text,_write boolean) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM inbound_fiscal_documents d WHERE d.xml_storage_path=_name
  AND has_permission(d.organization_id,CASE WHEN _write THEN 'fiscal.inbound.import' ELSE 'fiscal.documents.download' END))
 OR (NOT _write AND EXISTS(SELECT 1 FROM fiscal_documents d WHERE _name IN (d.xml_storage_path,d.pdf_storage_path)
  AND has_permission(d.organization_id,'fiscal.documents.download')))
$$;
CREATE POLICY fiscal_file_read ON storage.objects FOR SELECT TO authenticated USING(bucket_id='fiscal-private' AND fiscal_storage_allowed(name,false));
CREATE POLICY fiscal_file_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK(bucket_id='fiscal-private' AND fiscal_storage_allowed(name,true));
-- No UPDATE/DELETE: official archives are append-only.

CREATE FUNCTION public.fiscal_record_download(_path text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE org uuid; doc uuid;
BEGIN
 SELECT organization_id,id INTO org,doc FROM inbound_fiscal_documents WHERE xml_storage_path=_path;
 IF org IS NULL THEN SELECT organization_id,id INTO org,doc FROM fiscal_documents WHERE _path IN (xml_storage_path,pdf_storage_path); END IF;
 IF org IS NULL THEN RAISE EXCEPTION 'Arquivo fiscal não encontrado.'; END IF;
 PERFORM fiscal_require(org,'fiscal.documents.download');
 PERFORM fiscal_audit(org,'fiscal.download_requested','fiscal_files',doc);
END $$;
DO $$ DECLARE f record; BEGIN
 FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'fiscal_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated',f.signature);
 IF f.proname IN ('fiscal_execute','fiscal_query','fiscal_import_xml','fiscal_storage_allowed','fiscal_require')
 OR f.proname LIKE 'fiscal_save_%' OR f.proname IN ('fiscal_simulate','fiscal_rule_action','fiscal_profile_action','fiscal_prepare','fiscal_document_action','fiscal_reconcile','fiscal_nature_action','fiscal_exception_action','fiscal_test_rule','fiscal_record_download') THEN
 EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END $$;
CREATE FUNCTION public.fiscal_evidence_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Evidência fiscal é imutável; registre nova versão ou evento.'; END $$;
REVOKE ALL ON FUNCTION fiscal_evidence_immutable() FROM PUBLIC,anon,authenticated;
DO $$ DECLARE t text; BEGIN FOREACH t IN ARRAY ARRAY['fiscal_document_items','fiscal_events','fiscal_rule_regressions','fiscal_reconciliations','tax_rule_reviews'] LOOP
 EXECUTE format('CREATE TRIGGER fiscal_evidence_guard BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION fiscal_evidence_immutable()',t);
END LOOP; END $$;
COMMIT;
