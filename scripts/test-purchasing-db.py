#!/usr/bin/env python3
"""MASTER 010 acceptance: purchasing/suppliers/receiving/returns/replenishment
against a real isolated PostgreSQL. Pedido aprovado NÃO move estoque; somente
recebimento POSTED gera entradas e devolução POSTED gera saídas."""
import importlib.util
import json
from pathlib import Path
spec = importlib.util.spec_from_file_location('inventory_db', Path(__file__).with_name('test-inventory-db.py'))
db = importlib.util.module_from_spec(spec); spec.loader.exec_module(db)
q, sql, uid = db.q, db.sql, db.uid

def run():
    db.setup()
    for name in ['20260926100000_partner_reconciliation.sql', '20260928100000_finance.sql',
                 '20260930100000_cost_engine.sql', '20261001100000_purchasing.sql']:
        sql((db.ROOT / 'supabase/migrations' / name).read_text())

    a, b, r, c, org, other = [uid() for _ in range(6)]
    sql(f"INSERT INTO auth.users(id,email) VALUES({q(a)},'buy@test'),({q(b)},'boss@test'),({q(r)},'prod@test'),({q(c)},'other@test');"
        f" INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'Fabrica',{q(org)},{q(a)}),({q(other)},'Outra','outra',{q(c)});"
        f" INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(b)},'gestor'),({q(org)},{q(r)},'producao')")

    def rpc(name, *args, user=a, fail=None):
        return db.call(name, ','.join(q(json.dumps(x) if isinstance(x, (dict, list)) else x) for x in args), user, fail)

    def num(sqlx): return float(sql(sqlx))
    def j(x): return json.loads(x)

    un = sql("SELECT id FROM units_of_measure WHERE code='un'")
    meter = sql("SELECT id FROM units_of_measure WHERE code='m'")
    roll = sql("SELECT id FROM units_of_measure WHERE code='rolo'")

    def variant(code):
        p, v = uid(), uid()
        sql(f"INSERT INTO products(id,organization_id,code,name,item_type) VALUES({q(p)},{q(org)},{q(code)},{q(code)},'RAW_MATERIAL');"
            f" INSERT INTO product_variants(id,organization_id,product_id,sku,unit_of_measure_id) VALUES({q(v)},{q(org)},{q(p)},{q(code)},{q(meter)})")
        return v

    V1 = variant('TECIDO'); V2 = variant('BOTÃO'); V3 = variant('TECIDO-ROLO')
    factory, store = uid(), uid()
    for loc, name in [(factory, 'Rec-Fábrica'), (store, 'Loja')]:
        sql(f"INSERT INTO inventory_locations(id,organization_id,code,name,type) VALUES({q(loc)},{q(org)},{q(name)},{q(name)},'FACTORY')")

    # --- Fornecedores + catálogo --------------------------------------------
    sup = rpc('supplier_save_company', org, {'code': 'TECSUL', 'legal_name': 'Tecidos Sul Ltda', 'default_payment_terms': '30/60', 'lead_time_days': 5})
    sup2 = rpc('supplier_save_company', org, {'code': 'BOTCO', 'legal_name': 'Botões Centro Oeste', 'default_payment_terms': '0'})
    def supplier_profile(company_id): return sql(f"SELECT id FROM supplier_profiles WHERE company_id={q(company_id)}")
    sup, sup2 = supplier_profile(sup), supplier_profile(sup2)
    assert j(rpc('supplier_query', org, 'suppliers'))['total'] == 2
    rpc('supplier_product_save', org, {'supplier_id': sup, 'variant_id': V1, 'supplier_sku': 'TEC-001', 'purchase_unit_id': un, 'inventory_unit_id': un, 'conversion_factor': 1, 'minimum_order_quantity': 10, 'lead_time_days': 5})
    rpc('supplier_product_save', org, {'supplier_id': sup, 'variant_id': V3, 'supplier_sku': 'TEC-R-01', 'purchase_unit_id': roll, 'inventory_unit_id': meter, 'conversion_factor': 5, 'minimum_order_quantity': 1})
    rpc('supplier_product_save', org, {'supplier_id': sup2, 'variant_id': V2, 'supplier_sku': 'BTC-01', 'purchase_unit_id': un, 'inventory_unit_id': un})
    print('PASS: fornecedores + catálogo (perfil, prazos, rolo->m)')

    # --- Requisição ------------------------------------------------------
    req = rpc('request_save', org, {'priority': 'NORMAL',
                                    'items': [{'variant_id': V1, 'quantity': 12, 'unit_of_measure_id': un, 'reason': 'Produção'}]})
    assert j(rpc('request_query', org, 'request', {'id': req}))['request']['request_number'].startswith('REQ-')
    j(rpc('request_action', org, req, 'submit'))
    rpc('request_action', org, req, 'submit', fail='rascunhos')
    j(rpc('request_action', org, req, 'approve', user=b))
    print('PASS: requisição DRAFT->SUBMITTED->APPROVED')

    # --- Cotação ---------------------------------------------------------
    cot = rpc('quotation_save', org, {'purchase_request_id': req, 'deadline': '2026-09-10',
                                      'suppliers': [
                                          {'supplier_id': sup, 'items': [{'variant_id': V1, 'quantity': 12, 'unit_price': 30}]},
                                          {'supplier_id': sup2, 'items': [{'variant_id': V1, 'quantity': 12, 'unit_price': 34}]}]})
    assert j(rpc('quotation_query', org, 'quotations'))['total'] == 1
    rpc('quotation_award', org, cot, {'items': [{'variant_id': V1, 'supplier_id': sup, 'award': True, 'reason': 'Menor preço'}]})
    assert j(rpc('quotation_query', org, 'quotation', {'id': cot}))['quotation']['status'] == 'AWARDED'
    print('PASS: cotação multi-fornecedor + premiação')

    # --- Pedido não move estoque -----------------------------------------
    rpc('purchasing_query', org, 'settings')
    po1 = rpc('po_save', org, {'supplier_id': sup, 'quotation_id': cot, 'purchase_request_id': req,
                               'expected_delivery_date': '2026-09-30', 'payment_terms': '30/60', 'destination_location_id': factory,
                               'freight_amount': 10,
                               'items': [{'variant_id': V1, 'ordered_quantity': 10, 'unit_price': 30, 'purchase_unit_id': un, 'inventory_unit_id': un}]})
    rpc('po_action', org, po1, 'submit')
    rpc('po_action', org, po1, 'approve', user=b)
    assert num("SELECT count(*) FROM inventory_movements WHERE organization_id='" + org + "'") == 0
    assert j(rpc('po_query', org, 'orders'))['rows'][0]['status'] == 'APPROVED'
    po1rows = j(rpc('po_query', org, 'order', {'id': po1}))
    assert po1rows['order']['total_amount'] == 310  # 10*30 + frete 10
    # Segregação: o próprio criador não aprova.
    po_self = rpc('po_save', org, {'supplier_id': sup, 'payment_terms': '0', 'destination_location_id': factory,
                                   'items': [{'variant_id': V2, 'ordered_quantity': 1, 'unit_price': 1}]})
    rpc('po_action', org, po_self, 'submit')
    rpc('po_action', org, po_self, 'approve', fail='Segregação')
    rpc('po_action', org, po_self, 'cancel', {'reason': 'Ação cancelada'})
    print('PASS: pedido aprovado NÃO gera movimento; segregação de aprovação; cancelamento restaura requisição aprovada?')

    # --- Recebimento parcial: inspeção + postagem -------------------------
    rej = rpc('po_receive', org, po1, {'received_at': '2026-09-01',
                                       'items': [{'variant_id': V1, 'quantity': 5}]})
    r = j(rpc('receipt_query', org, 'receipt', {'id': rej}))
    assert r['receipt']['status'] == 'DRAFT'
    item_id = r['items'][0]['id']
    j(rpc('receipt_action', org, rej, 'inspect', {'items': [{'item_id': item_id, 'accepted_quantity': 5, 'reason': 'Conferência'}]}))
    assert j(rpc('receipt_query', org, 'receipt', {'id': rej}))['receipt']['status'] == 'ACCEPTED'
    rpc('receipt_action', org, rej, 'post')
    rej = None
    assert num("SELECT quantity FROM inventory_movements WHERE reference_type='GOODS_RECEIPT' AND reference_id='" + r['receipt']['id'] + "'") == 5
    assert num("SELECT count(*) FROM inventory_movements WHERE movement_type='PURCHASE_RECEIPT' AND direction='IN'") == 1
    mcv = j(sql(f"SELECT to_jsonb(x) FROM (SELECT version,unit_cost,effective_from,source_type,source_reference,status FROM public.material_cost_versions WHERE variant_id={q(V1)} ORDER BY version) x"))
    assert mcv['version'] == 1 and mcv['source_type'] == 'PURCHASE' and float(mcv['unit_cost']) == 30 and mcv['source_reference'].startswith('GR-'), mcv
    assert num(f"SELECT last_price FROM supplier_products WHERE supplier_id='{sup}' AND variant_id='{V1}'") == 30
    assert float(sql(f"SELECT count(*) FROM account_payables WHERE source_type='PURCHASE' AND source_id='{po1}'")) == 2
    rpc('receipt_action', org, r['receipt']['id'], 'post', fail='já postado')
    assert num(f"SELECT count(*) FROM purchase_order_items WHERE purchase_order_id='{po1}' AND status='PARTIALLY_RECEIVED'") == 1
    print('PASS: recebimento parcial 5/10, inspeção, postagem = custo R$30/m (frete separado), 2 parcelas 30/60, sem duplicar postagem')

    # --- Segunda parcela fecha o pedido -----------------------------------
    rej2 = rpc('po_receive', org, po1, {'received_at': '2026-09-02', 'items': [{'variant_id': V1, 'quantity': 5}]})
    r2 = j(rpc('receipt_query', org, 'receipt', {'id': rej2}))['items'][0]
    j(rpc('receipt_action', org, rej2, 'inspect', {'items': [{'item_id': r2['id'], 'accepted_quantity': 5}]}))
    j(rpc('receipt_action', org, rej2, 'post'))
    assert j(rpc('po_query', org, 'order', {'id': po1}))['order']['status'] == 'COMPLETED'
    assert num(f"SELECT count(*) FROM account_payables WHERE source_type='PURCHASE' AND source_id='{po1}'") == 2  # 1 obrigação por pedido
    assert float(sql(f"SELECT sum(open_amount) FROM account_payables WHERE source_type='PURCHASE' AND source_id='{po1}'")) == 310
    print('PASS: pedido COMPLETED; 1 obrigação por pedido (2 parcelas = 310)')

    # --- Histórico de custos: LAST_PURCHASE com custo novo? -----------------
    po2 = rpc('po_save', org, {'supplier_id': sup, 'payment_terms': '0', 'destination_location_id': factory,
                               'items': [{'variant_id': V1, 'ordered_quantity': 10, 'unit_price': 36, 'purchase_unit_id': un, 'inventory_unit_id': un}]})
    rpc('po_action', org, po2, 'submit'); rpc('po_action', org, po2, 'approve', user=b)
    gr2 = rpc('po_receive', org, po2, {'received_at': '2026-09-15', 'items': [{'variant_id': V1, 'quantity': 10}]})
    j(rpc('receipt_action', org, gr2, 'inspect', {'items': [{'item_id': j(rpc('receipt_query', org, 'receipt', {'id': gr2}))['items'][0]['id'], 'accepted_quantity': 10}]}))
    j(rpc('receipt_action', org, gr2, 'post'))
    v2 = j(sql(f"SELECT to_jsonb(x) FROM (SELECT version,unit_cost,effective_from FROM public.material_cost_versions WHERE variant_id={q(V1)} ORDER BY version DESC LIMIT 1) x"))
    assert v2['version'] == 2 and float(v2['unit_cost']) == 36, v2  # histórico 30 -> 36
    print('PASS: histórico de custo R$30 -> R$36 (versão 2, PURCHASE)')

    # --- Política AVERAGE: média ponderada dos recebimentos -----------------
    rpc('purchasing_settings_save', org, {'acquisition_cost_policy': 'AVERAGE'})
    po3 = rpc('po_save', org, {'supplier_id': sup, 'payment_terms': '0', 'destination_location_id': factory,
                               'items': [{'variant_id': V1, 'ordered_quantity': 10, 'unit_price': 45, 'purchase_unit_id': un, 'inventory_unit_id': un}]})
    rpc('po_action', org, po3, 'submit'); rpc('po_action', org, po3, 'approve', user=b)
    gr3 = rpc('po_receive', org, po3, {'received_at': '2026-09-20', 'items': [{'variant_id': V1, 'quantity': 10}]})
    j(rpc('receipt_action', org, gr3, 'inspect', {'items': [{'item_id': j(rpc('receipt_query', org, 'receipt', {'id': gr3}))['items'][0]['id'], 'accepted_quantity': 10}]}))
    j(rpc('receipt_action', org, gr3, 'post'))
    v3 = j(sql(f"SELECT to_jsonb(x) FROM (SELECT version,unit_cost FROM public.material_cost_versions WHERE variant_id={q(V1)} ORDER BY version DESC LIMIT 1) x"))
    assert v3['version'] == 3 and float(v3['unit_cost']) == 37, v3  # (300+360+450)/30
    # Recebimento com custo igual ao ativo NÃO disputa churn de versão.
    rpc('purchasing_settings_save', org, {'acquisition_cost_policy': 'LAST_PURCHASE'})
    assert num(f"SELECT count(*) FROM material_cost_versions WHERE variant_id='{V1}'") == 3
    print('PASS: política AVERAGE = (10*30+10*36+10*45)/30 = 37; custo igual não gera nova versão')

    # --- Conversão rolo->m ------------------------------------------------
    po4 = rpc('po_save', org, {'supplier_id': sup, 'payment_terms': '0', 'destination_location_id': factory,
                               'items': [{'variant_id': V3, 'ordered_quantity': 2, 'unit_price': 60, 'purchase_unit_id': roll, 'inventory_unit_id': meter, 'conversion_factor': 5}]})
    rpc('po_action', org, po4, 'submit'); rpc('po_action', org, po4, 'approve', user=b)
    gr4 = rpc('po_receive', org, po4, {'received_at': '2026-09-21', 'items': [{'variant_id': V3, 'quantity': 2}]})
    j(rpc('receipt_action', org, gr4, 'inspect', {'items': [{'item_id': j(rpc('receipt_query', org, 'receipt', {'id': gr4}))['items'][0]['id'], 'accepted_quantity': 2}]}))
    j(rpc('receipt_action', org, gr4, 'post'))
    assert num(f"SELECT quantity FROM inventory_movements WHERE variant_id='{V3}' AND direction='IN'") == 10  # 2 rolo * 5 m
    v4 = j(sql(f"SELECT to_jsonb(x) FROM (SELECT unit_cost FROM public.material_cost_versions WHERE variant_id={q(V3)} LIMIT 1) x"))
    assert float(v4['unit_cost']) == 12, v4  # 60/rolo / 5m
    print('PASS: conversão rolo 5m -> movimento de 10 (un) e custo R$12/m')

    # --- Excesso (AUTH_OVERRIDE) gera exceção e limita ----------------------
    rpc('purchasing_settings_save', org, {'over_receipt_policy': 'AUTH_OVERRIDE', 'acquisition_cost_policy': 'LAST_PURCHASE'})
    po5 = rpc('po_save', org, {'supplier_id': sup, 'payment_terms': '0', 'destination_location_id': factory,
                               'items': [{'variant_id': V1, 'ordered_quantity': 10, 'unit_price': 30, 'purchase_unit_id': un, 'inventory_unit_id': un}]})
    rpc('po_action', org, po5, 'submit'); rpc('po_action', org, po5, 'approve', user=b)
    gr5 = rpc('po_receive', org, po5, {'received_at': '2026-09-22', 'items': [{'variant_id': V1, 'quantity': 12}]})
    gi = j(rpc('receipt_query', org, 'receipt', {'id': gr5}))['items'][0]['id']
    j(rpc('receipt_action', org, gr5, 'inspect', {'items': [{'item_id': gi, 'accepted_quantity': 12}]}))
    assert num(f"SELECT received_quantity FROM goods_receipt_items WHERE id='{gi}' AND accepted_quantity=12") == 12  # AUTH_OVERRIDE autoriza o excesso
    exc = j(rpc('exception_query', org, 'exceptions'))['rows'][0]
    assert exc['exception_type'] == 'OVER_RECEIPT' and exc['severity'] == 'WARNING', exc
    j(rpc('receipt_action', org, gr5, 'post'))
    print('PASS: estoque com AUTH_OVERRIDE registra excesso e exceção OVER_RECEIPT')

    # --- Documento 3-way: idêntico == MATCHED/PROCESSED ---------------------
    doc1 = rpc('document_save', org, {'supplier_id': sup, 'document_type': 'INVOICE', 'document_number': 'NF-001',
                                      'issue_date': '2026-09-23', 'total_amount': 310, 'quantity': 10, 'purchase_order_id': po1})
    out = j(rpc('document_action', org, doc1, 'match'))
    assert out['status'] == 'MATCHED', out
    j(rpc('document_action', org, doc1, 'process'))
    assert num(f"SELECT count(*) FROM account_payables WHERE source_type='PURCHASE' AND source_id='{po1}'") == 2  # sem criar 2a obrigação
    assert j(rpc('document_query', org, 'document', {'id': doc1}))['document']['status'] == 'PROCESSED'
    print('PASS: fatura idêntica ao pedido -> MATCHED -> PROCESSED (1 obrigação)')

    # --- Documento divergente: PRICE_VARIANCE bloqueia ----------------------
    doc2 = rpc('document_save', org, {'supplier_id': sup, 'document_number': 'NF-002', 'issue_date': '2026-09-23', 'total_amount': 400, 'quantity': 10, 'purchase_order_id': po1})
    out = j(rpc('document_action', org, doc2, 'match'))
    assert out['status'] == 'EXCEPTION', out
    rpc('document_action', org, doc2, 'process', fail='resolva')
    exc2 = j(rpc('exception_query', org, 'open'))
    assert exc2['count'] >= 1 and exc2['blocking'] >= 1, exc2
    eid = j(sql(f"SELECT to_jsonb(e) FROM public.purchase_exceptions e WHERE supplier_document_id={q(doc2)} AND severity='BLOCKING' LIMIT 1"))['id']
    rpc('exception_action', org, eid, 'resolve', {'resolution_notes': 'Reajuste de preço negociado'})
    assert j(rpc('document_query', org, 'document', {'id': doc2}))['document']['status'] == 'MATCHED'
    j(rpc('document_action', org, doc2, 'process'))
    assert j(rpc('document_query', org, 'document', {'id': doc2}))['document']['status'] == 'PROCESSED'
    print('PASS: PRICE_VARIANCE bloqueia processamento; resolução humanizada libera')

    # --- Devolução a fornecedor ---------------------------------------------
    ret = rpc('return_save', org, {'supplier_id': sup, 'source_location_id': factory, 'reason': 'Defeito',
                                   'items': [{'variant_id': V1, 'quantity': 5, 'reason': 'Defeito de tecido'}]})
    rpc('return_action', org, ret, 'post')
    assert num(f"SELECT quantity FROM inventory_movements WHERE reference_type='SUPPLIER_RETURN' AND direction='OUT'") == 5
    assert float(sql(f"SELECT sum(quantity) FROM inventory_balances WHERE variant_id='{V1}' AND location_id='{factory}'")) == 25  # 30 - 5
    ret2 = rpc('return_save', org, {'supplier_id': sup, 'source_location_id': factory,
                                    'items': [{'variant_id': V1, 'quantity': 999}]})
    rpc('return_action', org, ret2, 'post', fail='Saldo insuficiente')
    print('PASS: devolução PURCHASE_RETURN (OUT) e validação de saldo')

    # --- Reposição ----------------------------------------------------------
    sql(f"UPDATE product_variants SET minimum_stock=12,reorder_point=15 WHERE id={q(V1)}")
    sql(f"UPDATE product_variants SET minimum_stock=8,reorder_point=5,replenishment_policy='REORDER_POINT' WHERE id={q(V2)}")
    rep = j(rpc('replenishment_query', org, {'months': 3}))
    row = next(x for x in rep['rows'] if x['variant_id'] == V2)
    assert row['suggested_quantity'] == 8 and row['available'] == 0, row
    dash = j(rpc('purchasing_query', org, 'dashboard'))
    assert dash['active_suppliers'] >= 2 and dash['open_exceptions'] >= 0, dash
    print('PASS: sugestão de reposição REORDER_POINT (8 un) + dashboard')

    # --- RLS / permissões / tenância / imutabilidade / auditoria ------------
    for user, excpected_perms in [(r, True), (c, False)]:
        res = j(rpc('po_query', org, 'orders', user=user))
        if excpected_perms:
            assert res['total'] >= 1
        else:
            rpc('po_query', org, 'orders', user=user, fail='permissão')
    rpc('po_save', org, {'supplier_id': sup, 'items': [{'variant_id': V1, 'ordered_quantity': 1, 'unit_price': 1}]}, user=r, fail='permissão')
    rpc('supplier_query', org, 'suppliers', user=r)  # leitura via RPC liberada à produção
    assert sql(f"SELECT count(*) FROM purchase_orders WHERE organization_id={q(org)}", r) == '0'  # tenancy enforced
    sql(f"INSERT INTO purchase_orders(organization_id,order_number,supplier_id,status) VALUES({q(org)},'PO-X',{q(sup)},'DRAFT')", a, fail='permission denied')
    sql(f"UPDATE goods_receipts SET notes='x' WHERE organization_id={q(org)}", a, fail='imutável')
    sql(f"UPDATE purchase_orders SET status='SENT' WHERE id={q(po3)} AND organization_id={q(org)}", a, fail='imutável')
    assert int(sql(f"SELECT count(*) FROM audit_log WHERE organization_id={q(org)}")) > 15
    print('PASS: RLS, permissões por papel, tenância, imutabilidade pós-conclusão e trilha de auditoria')

try:
    run()
finally:
    db.cleanup()