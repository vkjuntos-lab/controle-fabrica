BEGIN;
CREATE TABLE public.inbound_fiscal_documents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 establishment_id uuid NOT NULL, supplier_id uuid NOT NULL REFERENCES supplier_profiles,
 document_type text NOT NULL DEFAULT 'NFe', access_key text NOT NULL, issue_date date NOT NULL,
 total_amount numeric(18,2) NOT NULL, environment fiscal_environment NOT NULL,
 xml_storage_path text NOT NULL, xml_hash text NOT NULL, parsed_snapshot jsonb NOT NULL,
 status text NOT NULL DEFAULT 'PENDING_VERIFICATION' CHECK(status IN ('PENDING_VERIFICATION','UNDER_REVIEW','MATCHED','MISMATCH')),
 authenticity_status text NOT NULL DEFAULT 'UNVERIFIED' CHECK(authenticity_status='UNVERIFIED'),
 goods_receipt_id uuid REFERENCES goods_receipts, supplier_document_id uuid REFERENCES supplier_documents,
 account_payable_id uuid, created_by uuid REFERENCES profiles, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,id), UNIQUE(organization_id,environment,access_key),
 FOREIGN KEY(organization_id,establishment_id) REFERENCES fiscal_establishments(organization_id,id),
 FOREIGN KEY(organization_id,account_payable_id) REFERENCES account_payables(organization_id,id)
);
CREATE TABLE public.fiscal_reconciliations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), organization_id uuid NOT NULL REFERENCES organizations,
 document_id uuid, inbound_id uuid, status text NOT NULL CHECK(status IN ('MATCHED','MISMATCH','PENDING')),
 findings jsonb NOT NULL, created_by uuid REFERENCES profiles, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(organization_id,document_id) REFERENCES fiscal_documents(organization_id,id),
 FOREIGN KEY(organization_id,inbound_id) REFERENCES inbound_fiscal_documents(organization_id,id),
 CHECK(num_nonnulls(document_id,inbound_id)=1)
);
-- Exact namespace + expected tree; XML input never proves a valid signature or remote authorization.
CREATE FUNCTION public.fiscal_xml_value(_xml xml,_path text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$ SELECT nullif((xpath(_path,_xml,ARRAY[ARRAY['n','http://www.portalfiscal.inf.br/nfe']]))[1]::text,'') $$;
CREATE FUNCTION public.fiscal_import_xml(_org uuid,_est uuid,_supplier uuid,_xml text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE x xml; est fiscal_establishments; d inbound_fiscal_documents; key text; model text; env text;
 issuer text; recipient text; supplier_doc text; total numeric; items jsonb; v_id uuid:=gen_random_uuid(); dt date; checkdigit int; weight int:=2; acc int:=0; pos int;
BEGIN
 PERFORM fiscal_require(_org,'fiscal.inbound.import'); PERFORM inventory_lock(_org);
 IF octet_length(_xml)>2097152 OR _xml ~* '<!\s*(DOCTYPE|ENTITY)' THEN RAISE EXCEPTION 'XML excede limite ou contém DTD/entidades proibidas.'; END IF;
 x:=xmlparse(document _xml);
 IF cardinality(xpath('/n:nfeProc/n:NFe/n:infNFe',x,ARRAY[ARRAY['n','http://www.portalfiscal.inf.br/nfe']]))<>1
 OR fiscal_xml_value(x,'/n:nfeProc/@versao')<>'4.00'
 OR fiscal_xml_value(x,'/n:nfeProc/n:NFe/n:infNFe/@versao')<>'4.00' THEN
 RAISE EXCEPTION 'Somente nfeProc NF-e 4.00 com namespace oficial é suportado.'; END IF;
 key:=replace(fiscal_xml_value(x,'/n:nfeProc/n:NFe/n:infNFe/@Id'),'NFe','');
 IF key IS NULL OR key !~ '^[0-9]{44}$' THEN RAISE EXCEPTION 'Chave NF-e inválida.'; END IF;
 FOR pos IN REVERSE 43..1 LOOP acc:=acc+substring(key,pos,1)::int*weight; weight:=CASE WHEN weight=9 THEN 2 ELSE weight+1 END; END LOOP;
 checkdigit:=11-(acc%11); IF checkdigit>=10 THEN checkdigit:=0; END IF;
 IF right(key,1)::int<>checkdigit THEN RAISE EXCEPTION 'Dígito verificador da chave inválido.'; END IF;
 IF fiscal_xml_value(x,'/n:nfeProc/n:protNFe/n:infProt/n:chNFe/text()') IS DISTINCT FROM key
 OR fiscal_xml_value(x,'/n:nfeProc/n:protNFe/n:infProt/n:cStat/text()') IS DISTINCT FROM '100'
 OR fiscal_xml_value(x,'/n:nfeProc/n:protNFe/n:infProt/n:nProt/text()') IS NULL THEN
 RAISE EXCEPTION 'XML sem protocolo de autorização consistente; importação não comprova autenticidade.'; END IF;
 model:=fiscal_xml_value(x,'/n:nfeProc/n:NFe/n:infNFe/n:ide/n:mod/text()');
 env:=fiscal_xml_value(x,'/n:nfeProc/n:NFe/n:infNFe/n:ide/n:tpAmb/text()');
 IF model IS DISTINCT FROM '55' OR substring(key,21,2)<>'55' OR env IS NULL OR env NOT IN ('1','2') THEN RAISE EXCEPTION 'Modelo ou ambiente não suportado.'; END IF;
 SELECT * INTO est FROM fiscal_establishments WHERE organization_id=_org AND id=_est;
 IF NOT FOUND THEN RAISE EXCEPTION 'Estabelecimento inválido.'; END IF;
 IF est.environment::text<>(CASE env WHEN '1' THEN 'PRODUCTION' ELSE 'HOMOLOGATION' END) THEN RAISE EXCEPTION 'Ambiente do XML difere do estabelecimento.'; END IF;
 issuer:=fiscal_xml_value(x,'/n:nfeProc/n:NFe/n:infNFe/n:emit/n:CNPJ/text()');
 recipient:=fiscal_xml_value(x,'/n:nfeProc/n:NFe/n:infNFe/n:dest/n:CNPJ/text()');
 SELECT regexp_replace(c.document_number,'[^0-9]','','g') INTO supplier_doc FROM supplier_profiles s
 JOIN companies c ON c.organization_id=s.organization_id AND c.id=s.company_id WHERE s.organization_id=_org AND s.id=_supplier;
 IF issuer IS NULL OR issuer IS DISTINCT FROM supplier_doc OR substring(key,7,14)<>issuer THEN RAISE EXCEPTION 'Emitente não corresponde ao fornecedor.'; END IF;
 IF recipient IS NULL OR recipient IS DISTINCT FROM regexp_replace(est.tax_registration,'[^0-9]','','g') THEN RAISE EXCEPTION 'Destinatário não corresponde ao estabelecimento.'; END IF;
 total:=fiscal_xml_value(x,'/n:nfeProc/n:NFe/n:infNFe/n:total/n:ICMSTot/n:vNF/text()')::numeric;
 dt:=fiscal_xml_value(x,'/n:nfeProc/n:NFe/n:infNFe/n:ide/n:dhEmi/text()')::timestamptz::date;
 IF total IS NULL OR total<0 OR dt IS NULL THEN RAISE EXCEPTION 'Total ou data inválido.'; END IF;
 SELECT jsonb_agg(jsonb_build_object('line',line,'supplier_code',code,'description',description,'quantity',quantity,
 'unit_price',price,'total',amount,'unit',unit,'ncm',ncm,'tax_xml',tax::text)) INTO items
 FROM XMLTABLE(XMLNAMESPACES('http://www.portalfiscal.inf.br/nfe' AS n),'/n:nfeProc/n:NFe/n:infNFe/n:det' PASSING x
 COLUMNS line int PATH '@nItem',code text PATH 'n:prod/n:cProd',description text PATH 'n:prod/n:xProd',
 quantity numeric PATH 'n:prod/n:qCom',price numeric PATH 'n:prod/n:vUnCom',amount numeric PATH 'n:prod/n:vProd',
 unit text PATH 'n:prod/n:uCom',ncm text PATH 'n:prod/n:NCM',tax xml PATH 'n:imposto');
 IF items IS NULL OR jsonb_array_length(items)>500 OR EXISTS(SELECT 1 FROM jsonb_array_elements(items) i
 WHERE (i->>'quantity') IS NULL OR (i->>'quantity')::numeric<=0 OR (i->>'unit_price') IS NULL OR (i->>'unit_price')::numeric<0
 OR (i->>'total') IS NULL OR abs((i->>'total')::numeric-round((i->>'quantity')::numeric*(i->>'unit_price')::numeric,2))>0.01) THEN
 RAISE EXCEPTION 'Itens inválidos ou inconsistentes.'; END IF;
 SELECT * INTO d FROM inbound_fiscal_documents WHERE organization_id=_org AND environment=est.environment AND access_key=key;
 IF FOUND THEN
 IF d.xml_hash<>encode(sha256(convert_to(_xml,'UTF8')),'hex') THEN RAISE EXCEPTION 'Chave duplicada com XML diferente.'; END IF;
 RETURN to_jsonb(d); END IF;
 INSERT INTO inbound_fiscal_documents(id,organization_id,establishment_id,supplier_id,access_key,issue_date,total_amount,environment,xml_storage_path,xml_hash,parsed_snapshot,created_by)
 VALUES(v_id,_org,_est,_supplier,key,dt,total,est.environment,
 _org::text||'/'||_est::text||'/NFe/'||to_char(dt,'YYYY/MM')||'/'||v_id::text||'/received.xml',
 encode(sha256(convert_to(_xml,'UTF8')),'hex'),jsonb_build_object('items',items,'issuer',issuer,'recipient',recipient,
 'layout','4.00','parser_version','1','signature_verified',false,'schema_validated',false,
 'freight',fiscal_xml_value(x,'/n:nfeProc/n:NFe/n:infNFe/n:total/n:ICMSTot/n:vFrete/text()'),
 'protocol_claim',fiscal_xml_value(x,'/n:nfeProc/n:protNFe/n:infProt/n:nProt/text()')),auth.uid()) RETURNING * INTO d;
 PERFORM fiscal_emit(_org,'FISCAL_INBOUND_IMPORTED',v_id::text||':imported',jsonb_build_object('inbound_id',v_id,'authenticity_status','UNVERIFIED'));
 PERFORM fiscal_audit(_org,'fiscal.inbound_imported','inbound_fiscal_documents',v_id);
 RETURN to_jsonb(d);
END $$;

CREATE FUNCTION public.fiscal_reconcile(_org uuid,_id uuid,_inbound boolean,_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d fiscal_documents; b inbound_fiscal_documents; src jsonb; findings jsonb:='[]'; receipt goods_receipts;
 i jsonb; mapped jsonb; ri goods_receipt_items; res fiscal_reconciliations; amount numeric; payable account_payables;
BEGIN
 PERFORM fiscal_require(_org,'fiscal.reconciliation.manage'); PERFORM inventory_lock(_org);
 IF _inbound THEN
  PERFORM fiscal_require(_org,'fiscal.inbound.review');
  SELECT * INTO b FROM inbound_fiscal_documents WHERE organization_id=_org AND id=_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento recebido inexistente.'; END IF;
  SELECT * INTO receipt FROM goods_receipts WHERE organization_id=_org AND id=(_data->>'goods_receipt_id')::uuid AND supplier_id=b.supplier_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recebimento e fornecedor incompatíveis.'; END IF;
  IF receipt.status<>'POSTED' THEN findings:=findings||'[{"type":"RECEIPT_NOT_POSTED"}]'; END IF;
  IF _data->>'supplier_document_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM supplier_documents WHERE organization_id=_org
   AND id=(_data->>'supplier_document_id')::uuid AND supplier_id=b.supplier_id AND goods_receipt_id=receipt.id) THEN RAISE EXCEPTION 'Documento de fornecedor incompatível.'; END IF;
  IF _data->>'account_payable_id' IS NOT NULL THEN
   SELECT p.* INTO payable FROM account_payables p JOIN supplier_profiles s ON s.organization_id=p.organization_id AND s.company_id=p.company_id
    WHERE p.organization_id=_org AND p.id=(_data->>'account_payable_id')::uuid AND s.id=b.supplier_id;
   IF NOT FOUND OR payable.source_id NOT IN (receipt.id::text,coalesce(_data->>'supplier_document_id',''),receipt.purchase_order_id::text) THEN RAISE EXCEPTION 'Obrigação financeira incompatível com a origem.'; END IF;
   IF payable.original_amount<>b.total_amount THEN findings:=findings||'[{"type":"PAYABLE_TOTAL_MISMATCH"}]'; END IF;
  ELSE findings:=findings||'[{"type":"PAYABLE_NOT_LINKED"}]'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='fiscal-private' AND name=b.xml_storage_path) THEN findings:=findings||'[{"type":"XML_NOT_ARCHIVED"}]'; END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(b.parsed_snapshot->'items') LOOP
   mapped:=_data->'item_mapping'->(i->>'line');
   SELECT * INTO ri FROM goods_receipt_items WHERE organization_id=_org AND goods_receipt_id=receipt.id AND id=(mapped->>'receipt_item_id')::uuid;
   IF NOT FOUND THEN findings:=findings||jsonb_build_array(jsonb_build_object('line',i->>'line','type','PRODUCT_NOT_MAPPED'));
   ELSIF ri.received_quantity<>(i->>'quantity')::numeric OR ri.unit_cost<>(i->>'unit_price')::numeric THEN
    findings:=findings||jsonb_build_array(jsonb_build_object('line',i->>'line','type','QUANTITY_OR_PRICE_MISMATCH'));
   END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM jsonb_each(coalesce(_data->'item_mapping','{}')) m
    GROUP BY m.value->>'receipt_item_id' HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Uma linha de recebimento não pode ser vinculada duas vezes.'; END IF;
  IF (SELECT count(*) FROM goods_receipt_items WHERE organization_id=_org AND goods_receipt_id=receipt.id)
    <>jsonb_array_length(b.parsed_snapshot->'items') THEN findings:=findings||'[{"type":"ITEM_COUNT_MISMATCH"}]'; END IF;
  -- Tax, freight and signature cannot be silently marked verified by arithmetic matching.
  findings:=findings||'[{"type":"TAX_FREIGHT_AND_AUTHENTICITY_REVIEW_PENDING"}]';
  UPDATE inbound_fiscal_documents SET goods_receipt_id=receipt.id,supplier_document_id=(_data->>'supplier_document_id')::uuid,
    account_payable_id=(_data->>'account_payable_id')::uuid,status='UNDER_REVIEW' WHERE id=b.id;
 ELSE
  SELECT * INTO d FROM fiscal_documents WHERE organization_id=_org AND id=_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Documento inexistente.'; END IF;
  src:=fiscal_source(_org,d.source_type,d.source_id);
  IF d.status<>'AUTHORIZED' THEN findings:=findings||'[{"type":"OFFICIAL_AUTHORIZATION_PENDING"}]'; END IF;
  FOR i IN SELECT value FROM jsonb_array_elements(src->'items') LOOP
   IF NOT EXISTS(SELECT 1 FROM fiscal_document_items WHERE document_id=d.id AND source_item_id=(i->>'source_item_id')::uuid AND quantity=(i->>'quantity')::numeric) THEN
    findings:=findings||'[{"type":"FISCAL_INVENTORY_MISMATCH"}]'; END IF;
  END LOOP;
  IF d.source_type='SHIPMENT' THEN
   SELECT sum(original_amount) INTO amount FROM account_receivables WHERE organization_id=_org AND source_type='SALES_ORDER' AND source_id=src->>'sales_order_id';
   findings:=findings||jsonb_build_array(jsonb_build_object('type','COMMERCIAL_BALANCE','ordered_quantity',src->'ordered_quantity',
    'covered_quantity',(SELECT sum(quantity) FROM fiscal_document_items WHERE document_id=d.id),'receivable_amount',amount));
  END IF;
 END IF;
 INSERT INTO fiscal_reconciliations(organization_id,document_id,inbound_id,status,findings,created_by)
 VALUES(_org,CASE WHEN NOT _inbound THEN _id END,CASE WHEN _inbound THEN _id END,
 CASE WHEN findings::text ~ 'QUANTITY_OR_PRICE_MISMATCH|PAYABLE_TOTAL_MISMATCH|ITEM_COUNT_MISMATCH|FISCAL_INVENTORY_MISMATCH' THEN 'MISMATCH' WHEN jsonb_array_length(findings)=0 THEN 'MATCHED' ELSE 'PENDING' END,findings,auth.uid()) RETURNING * INTO res;
 IF res.status='MISMATCH' THEN
  INSERT INTO fiscal_exceptions(organization_id,document_id,exception_type,source_type,source_id,details)
  VALUES(_org,CASE WHEN NOT _inbound THEN _id END,CASE WHEN _inbound THEN 'INBOUND_DOCUMENT_MISMATCH' ELSE 'FISCAL_INVENTORY_MISMATCH' END,
    CASE WHEN _inbound THEN 'INBOUND' ELSE 'DOCUMENT' END,_id,findings);
 END IF;
 PERFORM fiscal_emit(_org,'FISCAL_RECONCILIATION_RECORDED',res.id::text,jsonb_build_object('reconciliation_id',res.id,'status',res.status));
 PERFORM fiscal_audit(_org,'fiscal.reconciled','fiscal_reconciliations',res.id);
 RETURN to_jsonb(res);
END $$;
ALTER TABLE inbound_fiscal_documents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inbound_fiscal_documents FROM anon,authenticated;
GRANT SELECT ON inbound_fiscal_documents TO authenticated;
CREATE POLICY inbound_fiscal_documents_read ON inbound_fiscal_documents FOR SELECT TO authenticated USING(has_permission(organization_id,'fiscal.inbound.read'));
ALTER TABLE fiscal_reconciliations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON fiscal_reconciliations FROM anon,authenticated;
GRANT SELECT ON fiscal_reconciliations TO authenticated;
CREATE POLICY fiscal_reconciliations_read ON fiscal_reconciliations FOR SELECT TO authenticated USING(has_permission(organization_id,'fiscal.reconciliation.read'));
DO $$ DECLARE f record; BEGIN FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'fiscal_%' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon',f.signature); END LOOP; END $$;
COMMIT;
