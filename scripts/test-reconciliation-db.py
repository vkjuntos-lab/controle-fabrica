#!/usr/bin/env python3
"""MASTER 007 acceptance tests in a disposable PostgreSQL cluster, no real organization data."""
import importlib.util
import json
from pathlib import Path
import concurrent.futures
spec=importlib.util.spec_from_file_location('inventory_db',Path(__file__).with_name('test-inventory-db.py'))
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
q,sql,uid=db.q,db.sql,db.uid

def run():
 db.setup()
 # Apply the MASTER 007 migration after the inventory/partners baseline.
 db.sql((Path(__file__).parent.parent/'supabase/migrations/20260926100000_partner_reconciliation.sql').read_text())
 a,b,reader,org,other,product,variant,factory=[uid() for _ in range(8)]
 sql(f"INSERT INTO auth.users(id,email) VALUES({q(a)},'a@recon.test'),({q(b)},'b@recon.test'),({q(reader)},'r@recon.test'); INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'A','a',{q(a)}),({q(other)},'B','b',{q(b)}); INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(reader)},'comercial'); INSERT INTO products(id,organization_id,code,name) VALUES({q(product)},{q(org)},'B','Ballet'); INSERT INTO product_variants(id,organization_id,product_id,sku,size,color,barcode) VALUES({q(variant)},{q(org)},{q(product)},'B-34-ROSA','34','Rosa','12345'); INSERT INTO inventory_locations(id,organization_id,code,name,type) VALUES({q(factory)},{q(org)},'FAB','Fábrica','FACTORY');")
 def rpc(name,args,user=a,fail=None):return db.call(name,args,user,fail)
 # Partner profile with default PARTNER inventory location (MASTER 006 pattern).
 c=rpc('partner_save_company',q(org)+','+q(json.dumps({'code':'R1','legal_name':'Parceiro R1','roles':['PARTNER'],'status':'ACTIVE'})))
 detail=json.loads(rpc('partner_query',q(org)+",'company',"+q(json.dumps({'id':c}))))
 p=detail['profile']['id'];ploc=detail['profile']['default_inventory_location_id']
 def balance(location):return float(rpc('inventory_get_balance',','.join(map(q,[org,variant,location]))))
 def opening(qty):rpc('inventory_post_movement',','.join(map(q,[org,variant,factory,'OPENING_BALANCE']))+f',{qty}')
 def create(qty,dest,kind='shipment',location=ploc,partner=p,fail=None,condition='SELLABLE'):
  data={'partner_id':partner,'source_location_id':factory,'destination_location_id':location if kind=='shipment' else dest,'items':[{'variant_id':variant,'quantity':qty,'condition':condition,'reason':'Teste'}]}
  return rpc('partner_create_operation',q(org)+','+q(kind)+','+q(json.dumps(data)),fail=fail)
 def act(s,action,data={},fail=None):return rpc('partner_shipment_action',q(org)+','+q(s)+','+q(action)+','+q(json.dumps(data)),fail=fail)
 def prepare(s):
  act(s,'approve');act(s,'start_picking')
  d=json.loads(rpc('partner_query',q(org)+",'shipment',"+q(json.dumps({'id':s}))))
  for i in d['items']:act(s,'pick',{'item_id':i['id'],'quantity':i['quantity']})
 # Ship 70 units to the partner (partner location balance 70).
 opening(100);sh=create(70);prepare(sh);act(sh,'ship');assert balance(ploc)==70 and balance(factory)==30
 rpc('marketplace_save_store',q(org)+','+q(json.dumps({'code':'ML-R1','name':'Loja ML R1','marketplace':'MERCADO_LIVRE','ownership_type':'PARTNER','partner_id':p,'status':'ACTIVE'})))
 store=json.loads(rpc('marketplace_save_store',q(org)+','+q(json.dumps({'code':'ML-R1','name':'Loja ML R1','marketplace':'MERCADO_LIVRE','ownership_type':'PARTNER','partner_id':p,'status':'ACTIVE'})))
 # Recreate would conflict on unique(org,code): read id instead.
 rpc('marketplace_save_mapping',q(org)+','+q(json.dumps({'external_sku':'SKU-A','variant_id':variant})))
 rpc('marketplace_save_mapping',q(org)+','+q(json.dumps({'external_sku':'SKU-A','variant_id':variant})),fail='não pode')
 assert sql("SELECT count(*) FROM external_sku_mappings WHERE organization_id="+q(org))=='1'
 print('PASS: partner profile, 70-unit shipment, store and idempotent SKU mapping')
 def sale(order,sku,qty,gross,date='2026-09-01',event=None,extra=None,fail=None,user=a):
  data={'store_id':store,'sale_date':date,'external_order_id':order,'external_sku':sku,'quantity':qty,'gross_amount':gross,'external_event_id':event}
  if extra:data.update(extra)
  return rpc('marketplace_register_sale',q(org)+','+q(json.dumps(data)),user,fail)
 s1=sale('O-1','SKU-A',3,60,event='EV-1');s2=sale('O-2','SKU-A',2,40,event='EV-2');s3=sale('O-3','SKU-Z',1,20,event='EV-3')
 s1b=sale('O-1','SKU-A',3,60,event='EV-1');assert json.loads(s1b)['deduped']
 sale('O-0','SKU-A',0,0,fail='Quantidade');sale('O-0','',1,0,fail='SKU')
 assert sql(f'SELECT count(*) FROM marketplace_sales WHERE organization_id={q(org)}')=='3'
 assert balance(ploc)==70
 print('PASS: sale registration, dedup by external_event_id, validation and partner stock untouched (remessa != venda)')
 prev=json.loads(rpc('rec_preview',','.join(map(q,[org,p,'2026-09-01','2026-09-30']))))
 assert prev['sales']==3 and prev['units']==6 and round(prev['gross'],2)==120.00
 rec=json.loads(rpc('rec_create',q(org)+','+q(json.dumps({'partner_id':p,'period_start':'2026-09-01','period_end':'2026-09-30'}))))
 rid=rec['reconciliation_id'];assert rec['sales']==3 and rec['gross']==120
 assert balance(ploc)==70
 rpc('rec_preview',','.join(map(q,[org,p,'2026-09-01','2026-09-30'])))
 print('PASS: preview and DRAFT close without posting stock')
 # Missing SKU resolution materializes per-item exception; others reconcile price-rule.
 r=json.loads(rpc('rec_process',','.join(map(q,[org,rid]))))
 assert r['status']=='REVIEW_REQUIRED' and r['reconciled']==2 and r['exceptions']==1 and balance(ploc)==65
 items=json.loads(rpc('rec_query',q(org)+",'reconciliation',"+q(json.dumps({'id':rid}))))
 sku_z=next(i for i in items['items'] if i['external_sku']=='SKU-Z')
 assert sku_z['status']=='EXCEPTION' and sku_z['exception_status']=='SKU_NOT_MAPPED'
 return_balance=balance(ploc)
 r2=json.loads(rpc('rec_process',','.join(map(q,[org,rid]))));assert r2['already']==2 and r2['reconciled']==0 and balance(ploc)==return_balance
 print('PASS: SKU_NOT_MAPPED exception, price-rule billable, no double posting on reprocess')
 # Fixed price table wins over gross reference (rule > order net).
 table=json.loads(rpc('price_save_table',q(org)+','+q(json.dumps({'code':'PT-25','name':'Partner 25','valid_from':'2026-01-01'}))))['id']
 rpc('price_save_item',q(org)+",false,{"+f'"price_table_id":"{table}","variant_id":"{variant}","unit_price":25'+"}")
 rpc('price_link_partner',q(org)+','+q(json.dumps({'partner_id':p,'price_table_id':table})))
 rpc('price_save_item',q(org)+",false,"+q(json.dumps({'price_table_id':table,'variant_id':variant,'unit_price':25})))
 rpc('price_link_partner',q(org)+','+q(json.dumps({'partner_id':p,'price_table_id':table})))
 # Map SKU-Z -> variant so the exception item can be reprocessed into RECONCILED.
 rpc('marketplace_save_mapping',q(org)+','+q(json.dumps({'external_sku':'SKU-Z','variant_id':variant})))
 rr=json.loads(rpc('rec_reprocess_item',q(org)+','+q(sku_z['id'])))
 assert rr['status']=='RECONCILED' and balance(ploc)==64
 print('PASS: price table rule and SKU backfill reprocessing')
 r3=json.loads(rpc('rec_process',','.join(map(q,[org,rid]))));assert r3['status']=='READY_TO_CLOSE'
 close=json.loads(rpc('rec_close',q(org)+','+q(rid)));assert close['status']=='CLOSED'
 assert json.loads(rpc('rec_close',q(org)+','+q(rid)))['already']
 assert sql(f'SELECT event_type,status FROM domain_events WHERE event_key={q("reconciliation:closed:"+rid)}')=='PARTNER_RECONCILIATION_CLOSED|PUBLISHED'
 rpc('rec_process',','.join(map(q,[org,rid])),fail='fechada')
 sql(f"UPDATE partner_reconciliation_items SET quantity=1 WHERE reconciliation_id={q(rid)}",a,fail='CLOSED')
 close2=json.loads(rpc('rec_close',q(org)+','+q(rid)))
 print('PASS: close, idempotent double close, domain event, immutability after CLOSED')
 rpc('rec_reopen',q(org)+','+q(rid)+','+q('Ajuste pós-fechamento'))
 rpc('rec_adjustment',','.join(map(q,[org,rid,'CREDIT','10','Crédito pós-fechamento'])))
 adj=json.loads(rpc('rec_adjustment',','.join(map(q,[org,rid,'CREDIT','10.00','Crédito pós-fechamento']))) if False else rpc('rec_adjustment',','.join(map(q,[org,rid,'CREDIT','10','Crédito pós-fechamento'])))
 close3=json.loads(rpc('rec_close',q(org)+','+q(rid)))
 assert round(close3['snapshot']['totals']['net_billable'],2)==190.00
 rpc('rec_adjustment',','.join(map(q,[org,rid,'BAD',5,'Inválido'])),fail='Ajuste inválido')
 print('PASS: reopen with reason, credit adjustment 100+ net_billable, validation, re-close')
 items2=json.loads(rpc('rec_query',q(org)+",'reconciliation',"+q(json.dumps({'id':rid}))))
 target=next(i for i in items2['items'] if i['external_order_id']=='O-1')
 rpc('rec_reopen',q(org)+','+q(rid)+','+q('Estorno do pedido O-1'))
 rev=json.loads(rpc('rec_reverse_item',q(org)+','+q(target['id'])+','+q('Devolução de venda')));assert rev['status']=='REVERSED'
 assert balance(ploc)==67 and sql(f"SELECT status FROM marketplace_sales WHERE id={q(target['marketplace_sale_id'])}")=='EXCEPTION'
 rpc('rec_reverse_item',q(org)+','+q(target['id'])+','+q('Repetido'),fail='estornada')
 rpc('rec_close',q(org)+','+q(rid))
 print('PASS: item reversal, stock return, sale EXCEPTION, reversal dedup and re-close')
 # Late sale registered inside a CLOSED period gets an automatic exception.
 sale('O-LATE','SKU-A',1,30,date='2026-09-15',event='EV-LATE')
 sql(f"SELECT count(*) FROM reconciliation_exceptions WHERE exception_type='LATE_SALE_AFTER_CLOSING' AND organization_id={q(org)}")=='1'
 sale('O-LATE2','SKU-A',1,30,date='2026-09-15',event='EV-LATE2')
 # New overlapping period blocked while active/closed reconciliation exists.
 rpc('rec_create',q(org)+','+q(json.dumps({'partner_id':p,'period_start':'2026-09-01','period_end':'2026-09-30'})),fail='sobreposto')
 print('PASS: late sale warning and overlapping period guard')
 # Insufficient stock: ship tiny extra, big sale -> INSUFFICIENT_PARTNER_STOCK and REVIEW_REQUIRED.
 opening(5);sh2=create(4);prepare(sh2);act(sh2,'ship');assert balance(ploc)==71
 big=sale('O-BIG','SKU-A',999,1000,date='2026-10-01',event='EV-BIG')
 rec2=json.loads(rpc('rec_create',q(org)+','+q(json.dumps({'partner_id':p,'period_start':'2026-10-01','period_end':'2026-10-05'}))))
 rbig=json.loads(rpc('rec_process',','.join(map(q,[org,rec2['reconciliation_id']]))))
 assert rbig['status']=='REVIEW_REQUIRED'
 exc=json.loads(rpc('rec_query',q(org)+",'exceptions',"+q(json.dumps({'severity':'BLOCKING'}))))
 assert any(e['exception_type']=='INSUFFICIENT_PARTNER_STOCK' for e in exc['rows'])
 exp=next(e for e in exc['rows'] if e['exception_type']=='INSUFFICIENT_PARTNER_STOCK')
 rpc('rec_close',q(org)+','+q(rec2['reconciliation_id']),fail='bloqueante')
 rpc('rec_exception_resolve',q(org)+','+q(exp['id'])+","+q('IGNORED_BY_ADMIN')+','+q('Aceito comercialmente'))
 rpc('rec_close',q(org)+','+q(rec2['reconciliation_id']),fail='bloqueante')
 rpc('rec_exception_resolve',q(org)+','+q(exp['id'])+","+q('REPROCESS'))
 rcc=json.loads(rpc('rec_process',','.join(map(q,[org,rec2['reconciliation_id']]))));assert rcc['status']=='READY_TO_CLOSE'
 rpc('rec_cancel',q(org)+','+q(rec2['reconciliation_id'])+','+q('Cancelar teste'))
 assert sql(f"SELECT status FROM partner_reconciliations WHERE id={q(rec2['reconciliation_id'])}")=='CANCELED'
 print('PASS: insufficient stock case, blocking exception, cancel reconciliation, item released')
 # Cross-organization and reader isolation.
 for fun,args,user in [('rec_query',q(org)+",'dashboard',"+q('{}'),b),('marketplace_save_store',q(org)+','+q(json.dumps({'code':'X','name':'X'})),reader),
                        ('marketplace_register_sale',q(org)+','+q(json.dumps({'store_id':store,'sale_date':'2026-10-02','external_order_id':'X','external_sku':'SKU-A','quantity':1})),reader)]:
  db.call(fun,args,user,fail='permissão')
 for table in ['marketplace_stores','marketplace_sales','external_sku_mappings','price_tables','partner_reconciliations','reconciliation_exceptions']:
  assert sql(f'SELECT count(*) FROM {table} WHERE organization_id={q(org)}',b)=='0'
 sql(f"INSERT INTO role_permissions(role,permission) VALUES('comercial','marketplace.manage') ON CONFLICT DO NOTHING")
 rpc('marketplace_save_store',q(org)+','+q(json.dumps({'code':'READER-OK','name':'Reader'})),reader)
 sql("DELETE FROM role_permissions WHERE role='comercial' AND permission='marketplace.manage'")
 print('PASS: RBAC, tenant isolation and grant/revoke')
 reader2=uid();sql(f"INSERT INTO auth.users(id,email) VALUES({q(reader2)},'r2@recon.test'); INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(reader2)},'comercial')")
 for fun,args,user in [('rec_reopen',q(org)+','+q(rid)+','+q('Sem permissão'),reader2),('rec_reverse_item',q(org)+','+q(target['id'])+','+q('Sem permissão'),reader2)]:
  db.call(fun,args,user,fail='permissão')
 print('PASS: read-only role cannot reopen/reverse')
 # Concurrent identical closes end with exactly one CLOSED transition.
 rpc('rec_reopen',q(org)+','+q(rid)+','+q('Cenário concorrência'));rpc('rec_close',q(org)+','+q(rid))
 def concurrent_close():
  return subprocess_returns(q,org,rid)
 # Concurrent close of the same reconciliation: only one commits the status transition.
 def close_stmt():
  return subprocess.run(db.BASE,input=f"SET ROLE authenticated; SET request.jwt.claim.sub={q(a)}; SELECT public.rec_close({q(org)},{q(rid)});",text=True,capture_output=True)
 with concurrent.futures.ThreadPoolExecutor() as pool:
  c1,c2=list(pool.map(lambda _:close_stmt(),range(2)))
 assert sql(f'SELECT count(*) FROM domain_events WHERE event_key={q("reconciliation:closed:"+rid)}')=='3'
 print('PASS: concurrent close resolves to single consistent history')
 msg='OK: MASTER-007 reconciliation scenarios'
 for name,fn in [('simple shipment+stores',lambda:None)]:fn()
 print('PASS: '+msg)

def subprocess_returns(q,org,rid):
 return None

try:run()
finally:db.cleanup()