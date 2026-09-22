#!/usr/bin/env python3
"""MASTER 006 acceptance tests in a disposable PostgreSQL cluster, no real organization data."""
import importlib.util
import json
from pathlib import Path
import concurrent.futures
spec=importlib.util.spec_from_file_location('inventory_db',Path(__file__).with_name('test-inventory-db.py'))
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
q,sql,uid=db.q,db.sql,db.uid

def run():
 db.setup()
 a,b,org,other,product,variant,factory=[uid() for _ in range(7)]
 sql(f"INSERT INTO auth.users(id,email) VALUES({q(a)},'a@partner.test'),({q(b)},'b@partner.test'); INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'A','a',{q(a)}),({q(other)},'B','b',{q(b)}); INSERT INTO products(id,organization_id,code,name) VALUES({q(product)},{q(org)},'B','Ballet'); INSERT INTO product_variants(id,organization_id,product_id,sku,barcode) VALUES({q(variant)},{q(org)},{q(product)},'B-34-ROSA','12345'); INSERT INTO inventory_locations(id,organization_id,code,name,type) VALUES({q(factory)},{q(org)},'FAB','Fábrica','FACTORY');")
 def rpc(name,args,user=a,fail=None):return db.call(name,args,user,fail)
 def company(code='PA',user=a,tenant=org):
  return db.call('partner_save_company',q(tenant)+','+q(json.dumps({'code':code,'legal_name':'Parceiro '+code,'roles':['PARTNER','CUSTOMER'],'status':'ACTIVE'})),user)
 c=company();detail=json.loads(rpc('partner_query',q(org)+",'company',"+q(json.dumps({'id':c}))))
 p=detail['profile']['id'];loc=detail['profile']['default_inventory_location_id']
 def balance(location):return float(rpc('inventory_get_balance',','.join(map(q,[org,variant,location]))))
 def opening(qty):rpc('inventory_post_movement',','.join(map(q,[org,variant,factory,'OPENING_BALANCE']))+f',{qty}')
 def create(qty,kind='shipment',shipment=None,partner=p,location=loc,condition='SELLABLE',dest=factory,fail=None):
  data={'partner_id':partner,'source_location_id':factory if kind=='shipment' else location,'destination_location_id':location if kind=='shipment' else dest,'items':[{'variant_id':variant,'quantity':qty,'condition':condition,'reason':'Teste'}]}
  if shipment:data['shipment_id']=shipment
  return rpc('partner_create_operation',q(org)+','+q(kind)+','+q(json.dumps(data)),fail=fail)
 def act(s,action,data={},fail=None):return rpc('partner_shipment_action',q(org)+','+q(s)+','+q(action)+','+q(json.dumps(data)),fail=fail)
 def prepare(s):
  act(s,'approve');act(s,'start_picking')
  d=json.loads(rpc('partner_query',q(org)+",'shipment',"+q(json.dumps({'id':s}))))
  for i in d['items']:act(s,'pick',{'item_id':i['id'],'quantity':i['quantity']})
 opening(100);s=create(20);prepare(s);act(s,'ship');assert balance(factory)==80 and balance(loc)==20
 act(s,'ship');assert balance(loc)==20
 act(s,'receive',{'received_by':'Operador parceiro'});assert balance(loc)==20
 assert sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('sales','receivables','revenue')")=='0'
 print('PASS: simple shipment 100→80/20, dispatch retry, delivery without second posting, no sale/finance')
 r=create(5,'return',s);rpc('partner_receive_return',q(org)+','+q(r));rpc('partner_receive_return',q(org)+','+q(r));assert balance(loc)==15 and balance(factory)==85
 assert sql(f'SELECT quantity FROM partner_shipment_items WHERE shipment_id={q(s)}')=='20.000'
 r2=create(3,'return',s);rpc('partner_receive_return',q(org)+','+q(r2));assert balance(loc)==12
 excessive=create(13,'return',s);rpc('partner_receive_return',q(org)+','+q(excessive),fail='excede')
 print('PASS: multiple partial returns, immutable sent quantity, return retry and quantity cap')
 s2=create(200);prepare(s2);before=sql('SELECT count(*) FROM inventory_movements');act(s2,'ship',fail='Saldo insuficiente');assert sql('SELECT count(*) FROM inventory_movements')==before
 act(s,'cancel',fail='Transição');act(s2,'receive',{'received_by':'X'},fail='Transição')
 original=sql(f"SELECT m.id FROM inventory_movements m JOIN partner_shipments s ON s.transfer_id=m.reference_id WHERE s.id={q(s)} LIMIT 1")
 rpc('inventory_reverse_movement',','.join(map(q,[org,original,'Desfazer'])),fail='domínio')
 print('PASS: insufficient stock rollback, state machine, no generic reversal of dispatched shipment')
 c2=company('PB');p2=sql(f'SELECT id FROM partner_profiles WHERE company_id={q(c2)}');loc2=sql(f'SELECT default_inventory_location_id FROM partner_profiles WHERE company_id={q(c2)}')
 current=balance(factory);rpc('inventory_post_movement',','.join(map(q,[org,variant,factory,'ADJUSTMENT_OUT']))+f",{current-20},_reason=>'Preparar teste'")
 aa=create(15);bb=create(15,partner=p2,location=loc2);prepare(aa);prepare(bb)
 def ship(sh):
  try:act(sh,'ship');return True
  except AssertionError as e:assert 'Saldo insuficiente' in str(e);return False
 with concurrent.futures.ThreadPoolExecutor() as pool:assert sum(pool.map(ship,[aa,bb]))==1
 assert balance(factory)==5
 print('PASS: real concurrent shipments 20→15+15, only one commits')
 other_company=company('OTHER',b,other)
 db.call('partner_query',q(other)+",'company',"+q(json.dumps({'id':other_company})),a,fail='permissão')
 assert sql(f'SELECT count(*) FROM companies WHERE organization_id={q(other)}',a)=='0'
 for table in ['partner_profiles','company_roles','company_contacts','company_addresses','partner_shipments','partner_shipment_items','partner_returns','partner_return_items']:
  assert sql(f'SELECT count(*) FROM {table} WHERE organization_id={q(org)}',b)=='0'
 block={'code':'PA','legal_name':'Parceiro PA','status':'BLOCKED','blocked_reason':'Bloqueio operacional','roles':['PARTNER']}
 rpc('partner_save_company',q(org)+','+q(json.dumps(block))+','+q(c));create(1,fail='bloqueado')
 act(s2,'approve',fail='bloqueado')
 assert json.loads(rpc('partner_query',q(org)+",'shipment',"+q(json.dumps({'id':s}))))['items'][0]['quantity']==20
 print('PASS: cross-organization RLS and RPC isolation, blocked partner and accessible history')
 create(1,'return',condition='DAMAGED',fail='quarentena')
 quarantine=uid();sql(f"INSERT INTO inventory_locations(id,organization_id,code,name,type,operational_purpose) VALUES({q(quarantine)},{q(org)},'Q','Quarentena','OTHER','QUARANTINE')")
 rr=create(1,'return',condition='DAMAGED',dest=quarantine);rpc('partner_receive_return',q(org)+','+q(rr));assert balance(quarantine)==1
 rpc('partner_save_detail',q(org)+','+q(c)+",'contact',"+q(json.dumps({'name':'Expedição','is_primary':True})))
 rpc('partner_save_detail',q(org)+','+q(c)+",'address',"+q(json.dumps({'street':'Rua A','city':'São Paulo','country':'BR','is_primary':True})))
 for kind in ['companies','shipments','returns','positions','dashboard']:
  json.loads(rpc('partner_query',q(org)+','+q(kind)))
 print('PASS: damaged returns quarantine, contacts, addresses, positions and dashboard')
 # RBAC is enforced by PostgreSQL, not only by buttons/server adapters.
 reader=uid();sql(f"INSERT INTO auth.users(id,email) VALUES({q(reader)},'reader@partner.test'); INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(reader)},'comercial')")
 for name,args in [('partner_save_company',q(org)+','+q(json.dumps({'code':'DENIED','legal_name':'Denied'}))),('partner_shipment_action',q(org)+','+q(s)+",'ship'"),('partner_receive_return',q(org)+','+q(r)),('partner_save_detail',q(org)+','+q(c)+",'contact','{\"name\":\"Denied\"}'")]:
  rpc(name,args,user=reader,fail='permissão')
 sql(f"UPDATE partner_shipment_items SET quantity=1 WHERE shipment_id={q(s)}",a,fail='permission denied')
 sql(f"UPDATE partner_shipment_items SET quantity=1 WHERE shipment_id={q(s)}",fail='imutável')
 sql(f"DELETE FROM partner_shipments WHERE id={q(s)}",fail='excluído')
 sql(f"UPDATE inventory_locations SET partner_id={q(p2)} WHERE id={q(loc)}",fail='imutável')
 rpc('inventory_transfer_internal',','.join(map(q,[org,factory,loc,json.dumps([{'variant_id':variant,'quantity':1}])])),fail='permission denied')
 rpc('inventory_post_transfer',','.join(map(q,[org,factory,loc,json.dumps([{'variant_id':variant,'quantity':1}])])),fail='domínio')
 sql("INSERT INTO role_permissions(role,permission) VALUES('comercial','inventory.adjust') ON CONFLICT DO NOTHING")
 rpc('inventory_post_movement',','.join(map(q,[org,variant,loc,'ADJUSTMENT_IN']))+",1,_reason=>'Teste'",user=reader,fail='partner_inventory.adjust')
 sql("DELETE FROM role_permissions WHERE role='comercial' AND permission='inventory.adjust'")
 for table in ['companies','company_roles','partner_profiles','company_contacts','company_addresses','partner_shipments','partner_shipment_items','partner_returns','partner_return_items']:
  assert sql(f'SELECT count(*) FROM {table} WHERE organization_id={q(org)}',b)=='0'
 print('PASS: server-side permissions, private core denied, immutable history and partner location; partner adjustment requires dedicated permission')
 # Exact independent multi-partner scenario and multiple returns acceptance.
 block.update(status='ACTIVE',blocked_reason='');rpc('partner_save_company',q(org)+','+q(json.dumps(block))+','+q(c))
 variant=uid();sql(f"INSERT INTO product_variants(id,organization_id,product_id,sku,size,color) VALUES({q(variant)},{q(org)},{q(product)},'B-35-ROSA','35','Rosa')")
 opening(200);ship_a=create(50);ship_b=create(30,partner=p2,location=loc2)
 prepare(ship_a);prepare(ship_b);act(ship_a,'ship');act(ship_b,'ship')
 assert [balance(x) for x in [factory,loc,loc2]]==[120,50,30]
 ship_100=create(100);prepare(ship_100);act(ship_100,'ship')
 for qty in [10,15]:
  rr=create(qty,'return',ship_100);rpc('partner_receive_return',q(org)+','+q(rr))
 detail=json.loads(rpc('partner_query',q(org)+",'shipment',"+q(json.dumps({'id':ship_100}))))
 assert detail['returned_units']==25 and detail['items'][0]['quantity']==100
 assert sum(balance(x) for x in [factory,loc,loc2])==200
 print('PASS: multi-partner 200→120/50/30; shipment 100 with returns 10+15 retains original 100 and controlled total 200')
 # Document formatting normalization/duplicates are enforced even through direct RPC.
 doc={'code':'DOC','legal_name':'Documento','roles':['CUSTOMER'],'document_type':'CPF','document_number':'123.456.789-01'}
 rpc('partner_save_company',q(org)+','+q(json.dumps(doc)));doc.update(code='DUP',document_number='12345678901');rpc('partner_save_company',q(org)+','+q(json.dumps(doc)),fail='duplicate key')
 doc.update(code='INVALID',document_number='123');rpc('partner_save_company',q(org)+','+q(json.dumps(doc)),fail='Formato')
 for kind in ['shipment_report','return_report','history']:
  report=json.loads(rpc('partner_query',q(org)+','+q(kind)+','+q(json.dumps({'partner_id':p}))))
  assert report['total']>0 and len(report['rows'])<=50
 path=f'{org}/{s}/{uid()}.pdf'
 sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('partner-documents',{q(path)})",a)
 assert sql("SELECT count(*) FROM storage.objects",a)=='1' and sql("SELECT count(*) FROM storage.objects",b)=='0'
 sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('partner-documents',{q(path)})",b,fail='row-level security')
 assert sql("SELECT public FROM storage.buckets WHERE id='partner-documents'")=='f'
 assert sql(f"SELECT partner_document_allowed({q(path)},false)",a)=='t'
 assert sql("SELECT partner_document_allowed('bad-path',false)",a)=='f'
 print('PASS: document normalization/format, item-level reports, paginated partner history and private shipment document policies')

try:run()
finally:db.cleanup()
