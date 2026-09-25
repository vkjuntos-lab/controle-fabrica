#!/usr/bin/env python3
"""MASTER 011 acceptance against disposable PostgreSQL; no production data."""
import importlib.util,json,datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
spec=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('test-inventory-db.py'))
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
q,sql,uid=db.q,db.sql,db.uid

def run():
 db.setup()
 for name in ['20260926100000_partner_reconciliation.sql','20260928100000_finance.sql','20260930100000_cost_engine.sql','20261001100000_purchasing.sql','20261002100000_planning.sql','20261003100000_planning_engine.sql']:sql((db.ROOT/'supabase/migrations'/name).read_text())
 a,b,c,org,other=[uid() for _ in range(5)]
 sql(f"INSERT INTO auth.users(id,email) VALUES({q(a)},'plan@test'),({q(b)},'approve@test'),({q(c)},'other@test');INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'Planning',{q(org)},{q(a)}),({q(other)},'Other',{q(other)},{q(c)});INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(b)},'gestor')")
 today=datetime.date.fromisoformat(sql('SELECT current_date'))
 def date(n):return (today+datetime.timedelta(days=n)).isoformat()
 def rpc(name,*args,user=a,fail=None):return db.call(name,','.join(q(json.dumps(x) if isinstance(x,(dict,list)) else x) for x in args),user,fail)
 def jrpc(name,*args,**kw):return json.loads(rpc(name,*args,**kw))
 un=sql("SELECT id FROM units_of_measure WHERE code='un'")
 def variant(code,typ='RAW_MATERIAL'):
  p,v=uid(),uid();sql(f"INSERT INTO products(id,organization_id,code,name,item_type,status) VALUES({q(p)},{q(org)},{q(code)},{q(code)},{q(typ)},'ACTIVE');INSERT INTO product_variants(id,organization_id,product_id,sku,unit_of_measure_id,replenishment_policy) VALUES({q(v)},{q(org)},{q(p)},{q(code)},{q(un)},'MANUAL')");return v
 def location(code,typ='FACTORY'):
  x=uid();sql(f"INSERT INTO inventory_locations(id,organization_id,code,name,type,status) VALUES({q(x)},{q(org)},{q(code)},{q(code)},{q(typ)},'ACTIVE')");return x
 factory=location('FAB');dest=location('ACAB','WAREHOUSE');partner=location('PARCEIRO','PARTNER');transit=location('TRANSITO','TRANSIT')
 def opening(v,qty,loc=factory):return rpc('inventory_post_movement',org,v,loc,'OPENING_BALANCE',qty)
 company=rpc('supplier_save_company',org,{'code':'SUP','legal_name':'Fornecedor preferencial','preferred':True});supplier=sql(f"SELECT id FROM supplier_profiles WHERE company_id={q(company)}")
 sql(f"UPDATE supplier_profiles SET preferred=true WHERE id={q(supplier)}")
 def catalog(v,moq=1,multiple=None,lead=15):
  ident=rpc('supplier_product_save',org,{'supplier_id':supplier,'variant_id':v,'supplier_sku':v,'purchase_unit_id':un,'inventory_unit_id':un,'conversion_factor':1,'minimum_order_quantity':moq,'lead_time_days':lead})
  ident=sql(f"SELECT id FROM supplier_products WHERE supplier_id={q(supplier)} AND variant_id={q(v)}")
  if multiple:rpc('planning_save',org,'supplier_product',{'id':ident,'order_multiple':multiple})
  return ident
 def po(v,qty,day):
  ident=rpc('po_save',org,{'supplier_id':supplier,'expected_delivery_date':date(day),'destination_location_id':factory,'items':[{'variant_id':v,'ordered_quantity':qty,'unit_price':1}]})
  rpc('po_action',org,ident,'submit');rpc('po_action',org,ident,'approve',user=b);return ident
 def bom(v,child,qty=1,lead=2,scrap=0):
  bid=uid();sql(f"INSERT INTO bill_of_materials(id,organization_id,product_variant_id,code,status,production_lead_time_days,effective_from) VALUES({q(bid)},{q(org)},{q(v)},{q(bid)},'ACTIVE',{lead},{q(date(-100))});INSERT INTO bill_of_materials_items(organization_id,bom_id,component_variant_id,quantity,unit_of_measure_id,scrap_percentage) VALUES({q(org)},{q(bid)},{q(child)},{qty},{q(un)},{scrap})");return bid
 def forecast(v,qty,day):rpc('planning_save',org,'forecast',{'variant_id':v,'quantity':qty,'adjustment_date':date(day),'reason':'Aceite controlado'})
 def execute(**extra):
  data={'name':uid(),'idempotency_key':uid(),'horizon_start':date(0),'horizon_end':date(30),**extra};r=jrpc('planning_execute',org,data);assert r['status']!='FAILED',r;return r,data
 def rows(run,kind,**filters):return jrpc('planning_query',org,kind,{'run_id':run['id'],**filters})['rows']
 rpc('planning_save',org,'settings',{'demand_sources':['MANUAL_FORECAST','MINIMUM_STOCK'],'history_days':30,'min_history_days':1,'time_bucket':'DAILY'})
 v=variant('REPOSICAO');catalog(v);opening(v,30);po(v,20,0)
 sql(f"UPDATE product_variants SET target_stock=100,replenishment_policy='TARGET_STOCK' WHERE id={q(v)}")
 r,data=execute();orders=rows(r,'orders',variant_id=v);assert len(orders)==1 and orders[0]['quantity']==50,(r,orders,rows(r,'items'),rows(r,'exceptions'))
 assert jrpc('planning_execute',org,data)['id']==r['id']
 counts={t:sql(f'SELECT count(*) FROM {t}') for t in ['inventory_movements','purchase_orders','production_orders','account_payables']}
 execute()
 assert counts=={t:sql(f'SELECT count(*) FROM {t}') for t in counts}
 print('PASS: target100 - onhand30 - pending20 = 50; run retry; planning has no operational/financial writes')
 finished=variant('PRODUTO','FINISHED_GOOD');material=variant('MATERIAL');catalog(material);bid=bom(finished,material,.5);opening(material,20);po(material,10,18);forecast(finished,100,20)
 r,_=execute();req=rows(r,'requirements',variant_id=material)[0];assert [req['required_quantity'],req['available_quantity'],req['scheduled_receipt_quantity'],req['net_requirement']]==[50,20,10,20],req
 order=rows(r,'orders',variant_id=material)[0];assert order['suggested_order_date']==date(3),order
 assert order['why']['lead_time_days']==15 and order['why']['net_requirement']==20
 print('PASS: production100 × BOM .5 = material50; onhand20 + receipt10 -> net20; required minus 15 calendar days')
 # A receipt after the need date cannot cover the shortage.
 late=variant('COMPRA-TARDIA');catalog(late);po(late,100,25);forecast(late,50,1)
 r,_=execute();assert rows(r,'orders',variant_id=late)[0]['quantity']==50
 print('PASS: late receipt does not cover early demand')
 moq=variant('MOQ');catalog(moq,100);forecast(moq,70,20)
 mult=variant('MULTIPLO');catalog(mult,1,12);forecast(mult,20,20)
 both=variant('MOQ-MULTIPLO');catalog(both,100,12);forecast(both,70,20)
 r,_=execute();assert [rows(r,'orders',variant_id=x)[0]['quantity'] for x in [moq,mult,both]]==[100,24,108]
 print('PASS: MOQ70->100, multiple20->24, combined MOQ then multiple ->108, explained')
 ext=variant('TERCEIROS');catalog(ext);opening(ext,20);opening(ext,100,partner);opening(ext,8,transit);forecast(ext,50,20)
 r,_=execute();assert rows(r,'orders',variant_id=ext)[0]['quantity']==30
 item=rows(r,'items',variant_id=ext)[0];assert [item['opening_quantity'],item['partner_quantity'],item['transit_quantity']]==[20,100,8]
 rpc('planning_save',org,'availability',{'items':[{'location_id':partner,'include_in_planning':True}]},fail='Parceiro')
 print('PASS: partner100 and transit8 remain separate from factory20; inclusion rejected')
 # Partial PO through actual receiving/posting APIs.
 partial=variant('COMPRA-PARCIAL');catalog(partial);pid=po(partial,100,10)
 receipt=rpc('po_receive',org,pid,{'items':[{'variant_id':partial,'received_quantity':60}]})
 rpc('receipt_action',org,receipt,'inspect');rpc('receipt_action',org,receipt,'post')
 r,_=execute();facts=rows(r,'facts',variant_id=partial);fact=next(x for x in facts if x['source_type']=='PURCHASE_RECEIPT');assert fact['quantity']==40,facts
 print('PASS: PO100 - posted receipt60 = scheduled40')
 # Production partial through existing order and output services.
 prod=variant('PRODUCAO-PARCIAL','FINISHED_GOOD');pmb=variant('MP-PARCIAL');catalog(pmb);pb=bom(prod,pmb)
 op=jrpc('production_create_order',org,prod,100,factory,dest,pb,date(0),date(15));op=op.get('order',op)['id'];rpc('production_release_order',org,op);rpc('production_start_order',org,op);rpc('production_record_output',org,op,40)
 r,_=execute();facts=rows(r,'facts',variant_id=prod);assert next(x for x in facts if x['source_type']=='PRODUCTION_RECEIPT')['quantity']==60,facts
 print('PASS: planned production100 - ledger output40 = scheduled60')
 # Shared multi-level components consume a single stock pool.
 common=variant('COMPARTILHADO');catalog(common);opening(common,10)
 semi=variant('SEMI','SEMI_FINISHED_GOOD');bom(semi,common,2,0,5)
 top1=variant('TOP1','FINISHED_GOOD');top2=variant('TOP2','FINISHED_GOOD');bom(top1,semi,1,0);bom(top2,semi,1,0);forecast(top1,10,20);forecast(top2,10,20)
 r,_=execute();assert rows(r,'orders',variant_id=semi)[0]['quantity']==20
 assert rows(r,'orders',variant_id=common)[0]['quantity']==32 # 20*2*1.05 -10
 print('PASS: multilevel/shared component netting and BOM scrap (42 gross -10 stock =32)')
 # Human conversion is partial, permissioned, atomic and idempotent.
 order=rows(r,'orders',variant_id=moq)[0];rpc('planning_order_action',org,order['id'],'convert',{'quantity':60,'idempotency_key':uid()},fail='Aprove')
 rpc('planning_order_action',org,order['id'],'approve',{'reason':'Necessidade confirmada'})
 payload={'quantity':60,'idempotency_key':uid()}
 with ThreadPoolExecutor(max_workers=2) as pool:converted=list(pool.map(lambda _:jrpc('planning_order_action',org,order['id'],'convert',payload),range(2)))
 assert converted[0]['source_id']==converted[1]['source_id']
 assert sql(f"SELECT converted_qty FROM planned_orders WHERE id={q(order['id'])}")=='60.000'
 assert sql(f"SELECT source_type FROM purchase_request_items WHERE purchase_request_id={q(converted[0]['source_id'])}")=='MRP'
 rpc('planning_order_action',org,order['id'],'convert',{'quantity':40,'idempotency_key':uid()});assert sql(f"SELECT status FROM planned_orders WHERE id={q(order['id'])}")=='CONVERTED'
 op=rows(r,'orders',variant_id=top1)[0];rpc('planning_order_action',org,op['id'],'approve',{'reason':'Produzir'})
 cv=jrpc('planning_order_action',org,op['id'],'convert',{'quantity':10,'source_location_id':factory,'destination_location_id':dest,'idempotency_key':uid()});assert sql(f"SELECT status FROM production_orders WHERE id={q(cv['source_id'])}")=='DRAFT'
 print('PASS: approved partial purchase60+40, concurrent retry one request, real production DRAFT conversion')
 # Scenario and historical input independence.
 scenario=jrpc('planning_save',org,'scenario',{'name':'20% a mais','demand_multiplier':1.2,'lead_time_adjustment_days':10,'safety_stock_multiplier':1,'scenario_type':'CUSTOM'})['id']
 sr,_=execute(scenario_id=scenario,simulated=True);so=rows(sr,'orders',variant_id=top2)[0];assert so['quantity']==12
 rpc('planning_order_action',org,so['id'],'approve',{'reason':'Não executar simulação'},fail='Simulação')
 assert jrpc('planning_query',org,'compare',{'run_id':r['id'],'other_run_id':sr['id']})['total']>0
 old=rows(r,'orders',variant_id=material)[0]['why'];catalog(material,lead=10);r2,_=execute();assert rows(r,'orders',variant_id=material)[0]['why']==old and rows(r2,'orders',variant_id=material)[0]['why']['lead_time_days']==10
 sql(f"UPDATE planning_runs SET name='changed' WHERE id={q(r['id'])}",fail='imutável')
 sql(f"DELETE FROM planning_runs WHERE id={q(r['id'])}",fail='imutável')
 sql(f"UPDATE planned_orders SET quantity=1 WHERE id={q(order['id'])}",fail='imutável')
 print('PASS: simulation isolated, run comparison, lead-time snapshot and immutable completed run')
 # All read paths and helpers enforce isolation. No new source table permits direct writes.
 for table in ['planning_settings','planning_scenarios','planning_availability','forecast_adjustments','planning_runs','planned_orders','material_requirements','projected_shortages','planning_exceptions','planning_projections','planning_item_snapshots','planning_source_facts','planning_conversions']:
  assert sql(f"SELECT count(*) FROM {table} WHERE organization_id={q(org)}",c)=='0',table
 rpc('planning_query',other,'run',{'run_id':r['id']},user=c,fail='não encontrado')
 rpc('planning_execute',org,{'name':'Intruso','idempotency_key':uid()},user=c,fail='permissão')
 rpc('planning_save',other,'forecast',{'variant_id':moq,'quantity':1,'adjustment_date':date(1),'reason':'Intruso'},user=c,fail='organização')
 sql(f"UPDATE planned_orders SET status='APPROVED' WHERE id={q(order['id'])}",a,fail='permission denied')
 rpc('pln_supplier',org,moq,user=a,fail='permission denied')
 assert int(sql("SELECT count(*) FROM audit_log WHERE action LIKE 'planning.%'"))>10
 print('PASS: RLS all planning entities, direct IDs, permissions, private helpers, audit')
 # The graph cycle blocks the entire run without generating suggestions.
 x=variant('CYCLE-A','SEMI_FINISHED_GOOD');y=variant('CYCLE-B','SEMI_FINISHED_GOOD');bom(x,y);bom(y,x);forecast(x,10,10)
 bad=jrpc('planning_execute',org,{'name':uid(),'idempotency_key':uid(),'horizon_end':date(30)})
 assert bad['status']=='FAILED' and bad['error']=='BOM_CYCLE_DETECTED',bad
 assert rows(bad,'orders')==[] and rows(bad,'exceptions')[0]['exception_type']=='BOM_CYCLE_DETECTED'
 print('PASS: BOM cycle fails safely without suggestions or operational writes')
try:run()
finally:db.cleanup()
