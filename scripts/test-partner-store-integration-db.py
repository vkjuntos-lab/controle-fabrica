#!/usr/bin/env python3
"""Partner shipment invariants with the existing marketplace and finance schemas installed."""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory_db', Path(__file__).with_name('test-inventory-db.py'))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
q, sql, uid = db.q, db.sql, db.uid


def run():
    db.setup()
    for name in ['20260926100000_partner_reconciliation.sql', '20260928100000_finance.sql']:
        sql((db.ROOT / 'supabase/migrations' / name).read_text())
    actor, outsider, org, other, product, variant, factory = [uid() for _ in range(7)]
    sql(f"""INSERT INTO auth.users(id,email) VALUES({q(actor)},'ship@integration.test'),({q(outsider)},'other@integration.test');
      INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'Factory','factory',{q(actor)}),({q(other)},'Other','other',{q(outsider)});
      INSERT INTO products(id,organization_id,code,name) VALUES({q(product)},{q(org)},'BALLET','Sapatilha Ballet');
      INSERT INTO product_variants(id,organization_id,product_id,sku,size,color) VALUES({q(variant)},{q(org)},{q(product)},'BALLET-34-ROSA','34','Rosa');
      INSERT INTO inventory_locations(id,organization_id,code,name,type) VALUES({q(factory)},{q(org)},'FAB','Fábrica','FACTORY');""")

    def rpc(name, args, user=actor, fail=None):
        return db.call(name, args, user, fail)

    company = rpc('partner_save_company', q(org) + ',' + q(json.dumps({'code': 'PA', 'legal_name': 'Parceiro A', 'roles': ['PARTNER']})))
    detail = json.loads(rpc('partner_query', q(org) + ",'company'," + q(json.dumps({'id': company}))))
    partner = detail['profile']['id']
    destination = detail['profile']['default_inventory_location_id']
    store_data = {'code': 'LOJA-A', 'name': 'Loja A', 'marketplace': 'MARKETPLACE_X', 'ownership_type': 'PARTNER', 'partner_id': partner}
    store = json.loads(rpc('marketplace_save_store', q(org) + ',' + q(json.dumps(store_data))))['id']
    stores = json.loads(rpc('rec_query', q(org) + ",'stores'," + q(json.dumps({'partner_id': partner}))))
    assert stores['total'] == 1 and stores['rows'][0]['id'] == store
    assert stores['rows'][0]['partner_id'] == partner
    assert sql(f'SELECT count(*) FROM marketplace_stores WHERE id={q(store)}', outsider) == '0'
    rpc('rec_query', q(org) + ",'stores'," + q('{}'), outsider, 'permissão')
    rpc('marketplace_save_store', q(other) + ',' + q(json.dumps(store_data)), outsider, 'organização')
    print('PASS: existing MarketplaceStore links to PartnerProfile, tenant RLS and cross-tenant FK guard')

    def balance(location):
        return float(rpc('inventory_get_balance', ','.join(map(q, [org, variant, location]))))

    def assert_no_financial_effects():
        for table in ['marketplace_sales', 'account_receivables', 'financial_transactions', 'partner_reconciliations']:
            assert sql(f'SELECT count(*) FROM {table} WHERE organization_id={q(org)}') == '0', table

    rpc('inventory_post_movement', ','.join(map(q, [org, variant, factory, 'OPENING_BALANCE'])) + ',100')
    operation = {'partner_id': partner, 'source_location_id': factory, 'destination_location_id': destination,
                 'items': [{'variant_id': variant, 'quantity': 20}]}
    shipment = rpc('partner_create_operation', q(org) + ",'shipment'," + q(json.dumps(operation)))
    for action in ['approve', 'start_picking']:
        rpc('partner_shipment_action', ','.join(map(q, [org, shipment, action])))
    item = sql(f'SELECT id FROM partner_shipment_items WHERE shipment_id={q(shipment)}')
    rpc('partner_shipment_action', ','.join(map(q, [org, shipment, 'pick', json.dumps({'item_id': item, 'quantity': 20})])))
    assert balance(factory) == 100 and balance(destination) == 0
    assert_no_financial_effects()
    for _ in range(2):
        rpc('partner_shipment_action', ','.join(map(q, [org, shipment, 'ship'])))
    assert [balance(factory), balance(destination)] == [80, 20]
    assert_no_financial_effects()
    operation.update(source_location_id=destination, destination_location_id=factory, shipment_id=shipment,
                     items=[{'variant_id': variant, 'quantity': 5, 'condition': 'SELLABLE', 'reason': 'Devolução parcial'}])
    returned = rpc('partner_create_operation', q(org) + ",'return'," + q(json.dumps(operation)))
    for _ in range(2):
        rpc('partner_receive_return', ','.join(map(q, [org, returned])))
    assert [balance(factory), balance(destination)] == [85, 15]
    assert sql(f'SELECT quantity FROM partner_shipment_items WHERE shipment_id={q(shipment)}') == '20.000'
    assert_no_financial_effects()
    print('PASS: stock 100→80/20→85/15; retries deduplicated; no sale, receivable, financial transaction or reconciliation created')


try:
    run()
finally:
    db.cleanup()
