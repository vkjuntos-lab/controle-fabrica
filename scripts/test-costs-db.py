#!/usr/bin/env python3
"""Cost engine acceptance, actual PostgreSQL/RLS, isolated disposable database."""
import importlib.util
import json
from pathlib import Path
spec = importlib.util.spec_from_file_location('inventory_db',Path(__file__).with_name('test-inventory-db.py'))
db = importlib.util.module_from_spec(spec); spec.loader.exec_module(db)
q,sql,uid = db.q,db.sql,db.uid

def run():
 db.setup()
 for name in ['20260926100000_partner_reconciliation.sql','20260928100000_finance.sql','20260930100000_cost_engine.sql']:
  sql((db.ROOT/'supabase/migrations'/name).read_text())
 a,b,reader,org,other=[uid() for _ in range(5)]
 sql(f"INSERT INTO auth.users(id,email) VALUES({q(a)},'cost@test'),({q(b)},'other@test'),({q(reader)},'reader@test'); INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'Cost','cost',{q(a)}),({q(other)},'Other','other',{q(b)}); INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(reader)},'comercial')")
 def rpc(name,*args,user=a,fail=None):return db.call(name,','.join(q(json.dumps(x) if isinstance(x,(dict,list)) else x) for x in args),user,fail)
 unit=sql("SELECT id FROM units_of_measure WHERE code='un'")
 def variant(code,typ='FINISHED_GOOD'):
  p,v=uid(),uid();sql(f"INSERT INTO products(id,organization_id,code,name,item_type) VALUES({q(p)},{q(org)},{q(code)},{q(code)},{q(typ)}); INSERT INTO product_variants(id,organization_id,product_id,sku,unit_of_measure_id) VALUES({q(v)},{q(org)},{q(p)},{q(code)},{q(unit)})");return v
 finished=variant('Produto X');m1=variant('Material A','RAW_MATERIAL');m2=variant('Material B','COMPONENT');pack=variant('Caixa','PACKAGING')
 bom=uid();sql(f"INSERT INTO bill_of_materials(id,organization_id,product_variant_id,code,status,effective_from) VALUES({q(bom)},{q(org)},{q(finished)},'BOM-X','ACTIVE','2026-01-01')")
 for v,cost in [(m1,10),(m2,5),(pack,2)]:
  rpc('cost_save_input',org,'material',{'variant_id':v,'unit_of_measure_id':unit,'unit_cost':cost,'effective_from':'2026-01-01','reason':'Custo inicial'})
  sql(f"INSERT INTO bill_of_materials_items(organization_id,bom_id,component_variant_id,quantity,unit_of_measure_id) VALUES({q(org)},{q(bom)},{q(v)},1,{q(unit)})")
 rpc('cost_save_input',org,'labor',{'activity':'Montagem','hourly_cost':40,'effective_from':'2026-01-01','reason':'Custo-hora'})
 rpc('cost_save_input',org,'routing',{'bom_id':bom,'activity':'Montagem','standard_minutes':12,'effective_from':'2026-01-01','reason':'Tempo padrão'})
 rpc('cost_save_input',org,'overhead',{'name':'Fábrica','method':'PER_UNIT','rate':5,'effective_from':'2026-01-01','reason':'Rateio aprovado'})
 data={'variants':[finished],'effective_from':'2026-01-01'}
 result=json.loads(rpc('cost_calculate',org,data))['results'][0]
 assert result.get('total_unit_cost')==30,result
 version=result['id'];assert json.loads(rpc('cost_calculate',org,data))['results'][0]['id']==version
 rpc('cost_version_action',org,version,'publish',fail='aprovado')
 rpc('cost_version_action',org,version,'approve');rpc('cost_version_action',org,version,'publish')
 assert sql(f"SELECT status FROM product_cost_versions WHERE id={q(version)}")=='ACTIVE'
 print('PASS: BOM 10+5+2+8+5=30, calculation deduplication, approval and publication')
 for kind in ['dashboard','options','materials','labor','overhead','routing','runs','versions','price_tables','settings','sales','profitability']:
  json.loads(rpc('cost_query',org,kind))
 print('PASS: query contracts')
 def calculate(v,date='2026-01-01',**extra):
  return json.loads(rpc('cost_calculate',org,{'variants':[v],'effective_from':date,**extra}))['results'][0]
 def publish(v,date):
  row=calculate(v,date);rpc('cost_version_action',org,row['id'],'approve');rpc('cost_version_action',org,row['id'],'publish');return row
 def simple(code,cost,scrap=0):
  v=variant(code);m=variant(code+'-MAT','RAW_MATERIAL');bid=uid()
  sql(f"INSERT INTO bill_of_materials(id,organization_id,product_variant_id,code,status,effective_from) VALUES({q(bid)},{q(org)},{q(v)},{q(code)},'ACTIVE','2026-01-01'); INSERT INTO bill_of_materials_items(organization_id,bom_id,component_variant_id,quantity,unit_of_measure_id,scrap_percentage) VALUES({q(org)},{q(bid)},{q(m)},1,{q(unit)},{scrap})")
  if cost is not None:rpc('cost_save_input',org,'material',{'variant_id':m,'unit_of_measure_id':unit,'unit_cost':cost,'effective_from':'2026-01-01','reason':'Base'})
  return v,m,bid
 loss,lossmat,lossbom=simple('PERDA',20,5);r=calculate(loss)
 assert r['material_cost']==20 and r['loss_cost']==1 and r['total_unit_cost']==26,r # +5 configured overhead
 missing,missingmat,missingbom=simple('SEM-CUSTO',None);r=calculate(missing)
 assert r['completeness']=='INCOMPLETE' and r['total_unit_cost'] is None and any(x['code']=='MATERIAL_COST_MISSING' for x in r['issues']),r
 rpc('cost_version_action',org,r['id'],'approve',fail='completo')
 before=sql('SELECT count(*) FROM product_cost_versions')
 sim=json.loads(rpc('cost_calculate',org,{'variants':[finished],'effective_from':'2026-01-01','overrides':{'materials':{m1:20}}},'true'))['results'][0]
 assert sim['total_unit_cost']==40 and sql('SELECT count(*) FROM product_cost_versions')==before
 rpc('cost_calculate',org,{'variants':[finished],'effective_from':'2026-01-01','overrides':{'materials':{m1:20}}},fail='simulador')
 # No implicit conversion: configured roll 50m, R$1500/roll, BOM .4m = R$12.
 convv,convm,convb=simple('CONVERSAO',None);meter=sql("SELECT id FROM units_of_measure WHERE code='m'");roll=sql("SELECT id FROM units_of_measure WHERE code='rolo'")
 sql(f"UPDATE bill_of_materials_items SET quantity=.4,unit_of_measure_id={q(meter)} WHERE bom_id={q(convb)}")
 rpc('cost_save_input',org,'material',{'variant_id':convm,'unit_of_measure_id':roll,'unit_cost':1500,'effective_from':'2026-01-01','reason':'Rolo 50m'})
 assert calculate(convv)['completeness']=='INCOMPLETE'
 rpc('cost_save_input',org,'conversion',{'from_unit_id':roll,'to_unit_id':meter,'factor':50,'reason':'Rolo de 50m'})
 assert calculate(convv)['material_cost']==12
 print('PASS: scrap 20+1, missing cost/conversion blocks publication, official roll conversion, isolated simulation')
 for payload,expected in [({'cost':40,'mode':'MARKUP','markup':2.5},{'suggested_price':100}),({'cost':50,'mode':'PRICE','price':100},{'gross_margin_percent':50,'markup':2}),({'cost':40,'mode':'PRICE','price':100,'commission_percent':15,'fee_percent':5,'freight':10},{'contribution':30}),({'cost':40,'mode':'TARGET_MARGIN','target_margin_percent':30,'commission_percent':15,'fee_percent':5,'freight':10},{'suggested_price':100})]:
  result=json.loads(rpc('pricing_simulate',org,payload));assert all(result[k]==v for k,v in expected.items()),result
 rpc('pricing_simulate',org,{'cost':40,'mode':'TARGET_MARGIN','target_margin_percent':90,'commission_percent':15},fail='inviabilizam')
 print('PASS: markup, gross margin, marketplace contribution and target price use distinct formulas')
 # Actual production through existing production + ledger RPCs (no fabricated source records).
 actual,actualmat,actualbom=simple('REAL',10);factory,dest=uid(),uid()
 sql(f"INSERT INTO inventory_locations(id,organization_id,code,name,type) VALUES({q(factory)},{q(org)},'MAT','Matérias-primas','FACTORY'),({q(dest)},{q(org)},'ACAB','Acabados','WAREHOUSE')")
 rpc('inventory_post_movement',org,actualmat,factory,'OPENING_BALANCE',1000)
 order=json.loads(rpc('production_create_order',org,actual,100,factory,dest,actualbom));order=order.get('order',order)['id']
 rpc('production_release_order',org,order);rpc('production_start_order',org,order)
 om=sql(f"SELECT id FROM production_order_materials WHERE production_order_id={q(order)}")
 # 360 * 10 + 80 * 5 overhead = 4000; good output 80, not planned 100.
 rpc('production_record_consumption',org,order,om,360)
 rpc('production_record_output',org,order,80,20)
 rpc('production_complete_order',org,order)
 r=calculate(actual,'2026-09-24',production_order_id=order)
 assert r['total_unit_cost']==50 and r['material_cost']==45 and r['overhead_cost']==5,r
 print('PASS: actual production/ledger 4000 / good 80 = 50, planned 100 ignored')
 # Historical standard cost and own-store sale economics.
 hist,histmat,histbom=simple('HISTORICO',35);jan=publish(hist,'2026-01-01');assert jan['total_unit_cost']==40
 store=json.loads(rpc('marketplace_save_store',org,{'code':'OWN','name':'Própria','marketplace':'TEST','ownership_type':'OWN'}))['id']
 rpc('marketplace_save_mapping',org,{'external_sku':'HIST','variant_id':hist})
 sale=json.loads(rpc('marketplace_register_sale',org,{'store_id':store,'sale_date':'2026-01-15','external_order_id':'JAN','external_sku':'HIST','quantity':1,'gross_amount':100,'platform_fee':5}))['id']
 rpc('cost_save_input',org,'economics',{'sale_id':sale,'commission_amount':15,'company_shipping_amount':10,'company_discount_amount':0,'marketplace_discount_amount':0,'tax_amount':0,'other_amount':0,'source_reference':'Relatório efetivo'})
 rpc('profitability_capture',org,{'sales':[sale]});snap=json.loads(sql(f"SELECT to_jsonb(s) FROM sale_cost_snapshots s WHERE sale_id={q(sale)}"))
 assert snap['cogs']==40 and snap['contribution']==30 and snap['gross_margin']==60,snap
 rpc('cost_save_input',org,'material',{'variant_id':histmat,'unit_of_measure_id':unit,'unit_cost':40,'effective_from':'2026-03-01','reason':'Reajuste'})
 march=publish(hist,'2026-03-01');assert march['total_unit_cost']==45
 rpc('profitability_capture',org,{'sales':[sale]});assert sql(f"SELECT count(*) FROM sale_cost_snapshots WHERE sale_id={q(sale)}")=='1'
 assert sql(f"SELECT cogs FROM sale_cost_snapshots WHERE sale_id={q(sale)}")=='40.000000'
 sql(f"UPDATE product_cost_versions SET total_unit_cost=999 WHERE id={q(jan['id'])}",fail='imutável')
 table=json.loads(rpc('price_save_table',org,{'code':'PRICE','name':'Tabela','valid_from':'2026-01-01'}))['id']
 rpc('pricing_publish',org,{'price_table_id':table,'variant_id':hist,'unit_price':100,'valid_from':'2026-01-01'})
 rpc('pricing_publish',org,{'price_table_id':table,'variant_id':hist,'unit_price':120,'valid_from':'2026-03-01'})
 assert sql(f"SELECT unit_price FROM price_table_items WHERE price_table_id={q(table)} AND valid_from='2026-01-01'")=='100.00'
 assert sql(f"SELECT revenue FROM sale_cost_snapshots WHERE sale_id={q(sale)}")=='100.000000'
 print('PASS: January COGS40/revenue100 survives March cost45/price120, own contribution30 and immutable snapshots')
 # Real partner close uses billable 80, not marketplace gross 150.
 company=rpc('partner_save_company',org,{'code':'PARTNER','legal_name':'Parceiro','roles':['PARTNER']});partner=json.loads(rpc('partner_query',org,'company',{'id':company}))['profile'];pid=partner['id'];ploc=partner['default_inventory_location_id']
 pst=json.loads(rpc('marketplace_save_store',org,{'code':'P','name':'Parceiro','marketplace':'TEST','ownership_type':'PARTNER','partner_id':pid}))['id']
 rpc('inventory_post_movement',org,hist,ploc,'OPENING_BALANCE',10,'Saldo inicial','2026-03-01')
 pt=json.loads(rpc('price_save_table',org,{'code':'PARTNER','name':'Preço parceiro','valid_from':'2026-01-01'}))['id']
 rpc('pricing_publish',org,{'price_table_id':pt,'variant_id':hist,'unit_price':80,'valid_from':'2026-01-01'})
 rpc('price_link_partner',org,{'partner_id':pid,'price_table_id':pt,'valid_from':'2026-01-01'})
 psale=json.loads(rpc('marketplace_register_sale',org,{'store_id':pst,'sale_date':'2026-03-15','external_order_id':'PARTNER','external_sku':'HIST','quantity':1,'gross_amount':150}))['id']
 rpc('cost_save_input',org,'variable_rule',{'channel':'PARTNER','effective_from':'2026-01-01','commission_percent':0,'tax_percent':0,'fee_percent':0,'freight_per_unit':0,'other_per_unit':0,'reason':'Nenhuma despesa variável assumida neste contrato'})
 rec=json.loads(rpc('rec_create',org,{'partner_id':pid,'period_start':'2026-03-01','period_end':'2026-03-31'}))['reconciliation_id'];rpc('rec_process',org,rec);rpc('rec_close',org,rec)
 snap=json.loads(sql(f"SELECT to_jsonb(s) FROM sale_cost_snapshots s WHERE sale_id={q(psale)}"));assert snap['revenue']==80 and snap['cogs']==45 and snap['gross_margin']==35 and snap['contribution']==35,snap
 rpc('rec_close',org,rec);assert sql(f"SELECT count(*) FROM sale_cost_snapshots WHERE sale_id={q(psale)}")=='1'
 for group in ['product','variant','marketplace','store','partner','sale']:
  report=json.loads(rpc('cost_query',org,'profitability',{'group':group}));assert report['total']>0,report
 assert json.loads(rpc('cost_query',org,'profitability',{'store_id':pst}))['rows'][0]['revenue']==80
 rpc('rec_reopen',org,rec,'Revisão auditável');assert json.loads(rpc('cost_query',org,'profitability',{'store_id':pst}))['total']==0
 rpc('rec_close',org,rec);assert sql(f"SELECT count(*) FROM sale_cost_snapshots WHERE sale_id={q(psale)}")=='2'
 print('PASS: partner close billable80 - COGS45 = 35; close retry, reopen history and grouped server queries')
 # Tenant and sensitive access (product-only role cannot read costs, even through helpers/direct IDs).
 for user in [b,reader]:
  for name,args in [('cost_query',(org,'versions',{'id':jan['id']})),('pricing_simulate',(org,{'cost':40,'markup':2})),('cost_calculate',(org,data)),('cost_version_action',(org,version,'approve')),('profitability_capture',(org,{'sales':[sale]}))]:rpc(name,*args,user=user,fail='permissão')
  for t in ['material_cost_versions','labor_rates','overhead_rules','cost_routing_steps','production_labor_entries','cost_calculation_runs','product_cost_versions','pricing_variable_rules','profitability_settings','sale_economics','sale_cost_snapshots']:
   assert sql(f"SELECT count(*) FROM {t} WHERE organization_id={q(org)}",user)=='0',t
  sql(f"SELECT cost_price FROM product_variants WHERE id={q(hist)}",user,fail='permission denied')
  db.call('cost_compute',','.join(map(q,[org,hist,'2026-01-01'])),user,fail='permission denied')
 rpc('cost_save_input',other,'material',{'variant_id':hist,'unit_of_measure_id':unit,'unit_cost':1,'effective_from':'2026-01-01','reason':'Cross tenant'},user=b,fail='organização')
 sql(f"INSERT INTO price_table_items(organization_id,price_table_id,variant_id,unit_price) VALUES({q(org)},{q(pt)},{q(hist)},1)",a,fail='permission denied')
 assert int(sql("SELECT count(*) FROM audit_log WHERE resource='cost_engine'"))>10
 print('PASS: tenant RLS across all new tables, direct-ID RPC/column/helper permissions, no direct price write, audit')
 for kind,filters in [('impact',{'material_id':histmat,'unit_cost':'50'}),('comparison',{}),('snapshot',{'id':snap['id']})]:
  json.loads(rpc('cost_query',org,kind,filters))
 print('PASS: impact, standard/actual comparison and snapshot detail contracts')
 # Concurrent retry must reuse one version; direct writes remain protected.
 from concurrent.futures import ThreadPoolExecutor
 concurrent_data={'variants':[hist],'effective_from':'2026-04-01'}
 with ThreadPoolExecutor(max_workers=2) as pool:
  results=list(pool.map(lambda _:json.loads(rpc('cost_calculate',org,concurrent_data))['results'][0],range(2)))
 assert results[0]['id']==results[1]['id'],results
 assert sql(f"SELECT count(*) FROM product_cost_versions WHERE variant_id={q(hist)} AND effective_from='2026-04-01'")=='1'
 # Unknown actual deductions must not become zero or a fabricated contribution.
 unknown=json.loads(rpc('marketplace_register_sale',org,{'store_id':store,'sale_date':'2026-01-16','external_order_id':'UNKNOWN-FEES','external_event_id':'UNKNOWN-FEES-EVENT','external_sku':'HIST','quantity':1,'gross_amount':100}))['id']
 rpc('profitability_capture',org,{'sales':[unknown]})
 pending=json.loads(sql(f"SELECT to_jsonb(s) FROM sale_cost_snapshots s WHERE sale_id={q(unknown)}"))
 assert pending['completeness']=='INCOMPLETE' and pending['contribution'] is None and pending['cogs']==40,pending
 sql(f"UPDATE sale_cost_snapshots SET cogs=1 WHERE id={q(pending['id'])}",fail='imutável')
 assert sql(f"SELECT count(*) FROM product_variants WHERE id={q(hist)}",reader)=='1'
 print('PASS: concurrent calculation deduplicates, unknown fees remain incomplete, snapshots immutable and catalogue still readable')
try:run()
finally:db.cleanup()
