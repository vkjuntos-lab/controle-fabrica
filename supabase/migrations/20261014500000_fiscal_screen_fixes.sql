-- =====================================================================
-- LOVABLE MASTER 014 — Correções de tela do fiscal.
--
-- Não reescreve migration publicada: substitui `fiscal_query` e apaga
-- quatro linhas de `role_permissions` que nenhuma checagem do banco
-- consulta. Nenhuma tabela é criada ou alterada.
--
-- Os defeitos abaixo foram encontrados comparando a tela com o banco, e
-- nenhum deles apareceria em typecheck ou em teste de unidade.
-- =====================================================================
BEGIN;

-- ---------------------------------------------------------------------
-- 1. Permissões órfãs concedidas na motor tributário.
--
-- `20261013200000_fiscal_tax_engine.sql` concedeu `fiscal.documents.read`,
-- `fiscal.documents.prepare`, `fiscal.documents.transmit` e `fiscal.export`.
-- Nenhum desses nomes existe no catálogo: as permissões canônicas são
-- `fiscal.read`, `fiscal.documents.create`, `fiscal.documents.issue` e
-- `fiscal.reports.export`. Efeito: a tela de permissões do administrador
-- lista quatro chaves que nenhum `fiscal_require` consulta, e conceder
-- `fiscal.export` para o papel "fiscal" não destrava botão nenhum — o
-- botão de exportar continua exigindo `fiscal.reports.export`.
-- ---------------------------------------------------------------------
DELETE FROM public.role_permissions
WHERE permission IN (
  'fiscal.documents.read','fiscal.documents.prepare','fiscal.documents.transmit','fiscal.export');

-- ---------------------------------------------------------------------
-- 2. `fiscal_query` — permissão por kind e evidência que faltava.
--
-- (a) `products` caía no `ELSE 'fiscal.read'`, mas a tela libera a área
--     "Classificações" por `fiscal.tax_rules.read` e o formulário exige
--     `fiscal.tax_rules.manage`. Quem administrava classificação sem a
--     leitura ampla abria a área e não conseguia abrir um seletor.
--     Todo papel que lia essa tabela hoje (`admin`, `gestor`, `fiscal`,
--     `financeiro`) já tem `fiscal.tax_rules.read`, então o ajuste não
--     tira leitura de ninguém.
--
-- (a.1) `simulations` caía no mesmo `ELSE`. A tela libera a área por
--     `fiscal.simulate` e é essa mesma permissão que `fiscal_simulate`
--     exige para executar. Ler a lista de simulações por outra permissão
--     que não a da execução seria um vão: a tela mostra o histórico de
--     simulações que o usuário não pode reproduzir.
--
-- (b) O detalhe do documento não trazia `tax_calculation_snapshots`. O
--     snapshot é a evidência de QUAL regra produziu QUAL número, e a tela
--     mostrava o documento como JSON cru sem nenhum tributo. Agora o mesmo
--     detalhe devolve itens com o snapshot por item, os tributos apurados e
--     a trilha de eventos — o mesmo objeto que `fiscal_document_items`
--     e `tax_rule_reviews` já guardavam sem caminho de leitura.
--
-- (c) `regressions` entra como área: `fiscal_rule_regressions` é a prova de
--     que a regra foi testada no servidor antes de virar vigente, e era
--     invisível. Sem ela, "ativação exige regressão" era verdade sem
--     evidência visível. `rule_detail` e `assignees` dão à tela a trilha de
--     revisão e a lista de responsáveis.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fiscal_query(_org uuid,_kind text,_filters jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE tbl text; perm text; result jsonb; offst int:=greatest(0,coalesce((_filters->>'offset')::int,0)); subject uuid;
BEGIN
 perm:=CASE WHEN _kind='dashboard' THEN 'fiscal.dashboard'
  WHEN _kind IN ('rules','rule_items','reviews','regressions','products') THEN 'fiscal.tax_rules.read'
  WHEN _kind='simulations' THEN 'fiscal.simulate'
  WHEN _kind='providers' THEN 'fiscal.provider.manage'
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
  subject:=(_filters->>'id')::uuid;
  RETURN jsonb_build_object('document',(SELECT to_jsonb(d) FROM fiscal_documents d WHERE organization_id=_org AND id=subject),
    'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.id),'[]') FROM fiscal_document_items i WHERE organization_id=_org AND document_id=subject),
    'taxes',(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.tax_id,t.document_item_id),'[]') FROM tax_calculation_snapshots t WHERE organization_id=_org AND t.document_id=subject),
    'events',(SELECT coalesce(jsonb_agg(to_jsonb(e) ORDER BY e.created_at),'[]') FROM fiscal_events e WHERE organization_id=_org AND e.document_id=subject));
 ELSIF _kind='rule_detail' THEN
  subject:=(_filters->>'id')::uuid;
  RETURN jsonb_build_object(
    'reviews',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.created_at),'[]') FROM tax_rule_reviews r WHERE organization_id=_org AND r.tax_rule_id=subject),
    'regressions',(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY g.created_at),'[]') FROM fiscal_rule_regressions g WHERE organization_id=_org AND g.tax_rule_id=subject),
    'items',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY i.tax_id),'[]') FROM tax_rule_items i WHERE organization_id=_org AND i.tax_rule_id=subject));
 ELSIF _kind='assignees' THEN
  -- Responsáveis de pendência. Sem isto a tela tinha como registrar resolução
  -- mas não como atribuir o caso: `fiscal_exception_action` grava
  -- `responsible_id` e a coluna ficava sempre nula.
  PERFORM fiscal_require(_org,'fiscal.exceptions.manage');
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.user_id,'name',coalesce(p.full_name,p.email,m.user_id::text),'role',m.role) ORDER BY p.full_name),'[]') INTO result
  FROM organization_members m LEFT JOIN profiles p ON p.id=m.user_id
  WHERE m.organization_id=_org AND m.is_active;
  RETURN result;
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
 WHEN 'rule_items' THEN 'tax_rule_items' WHEN 'reviews' THEN 'tax_rule_reviews' WHEN 'regressions' THEN 'fiscal_rule_regressions'
 WHEN 'simulations' THEN 'fiscal_simulations' WHEN 'providers' THEN 'fiscal_providers' END;
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

REVOKE ALL ON FUNCTION public.fiscal_query(uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.fiscal_query(uuid,text,jsonb) TO authenticated;
COMMIT;
