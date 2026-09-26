#!/usr/bin/env python3
"""CRM integration tests in disposable PostgreSQL. Never uses a published database."""
import importlib.util,json,datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
spec=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('test-inventory-db.py'))
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
q,sql,uid=db.q,db.sql,db.uid
def run():
 db.setup()
 for name in ['20260926100000_partner_reconciliation.sql','20260928100000_finance.sql','20260930100000_cost_engine.sql','20261001100000_purchasing.sql','20261002100000_planning.sql','20261003100000_planning_engine.sql','20261004100000_planning_fixes.sql','20261005100000_crm.sql']:
  sql((db.ROOT/'supabase/migrations'/name).read_text())

 a,b,c,org,other,ext=[uid() for _ in range(6)]
 sql(f"INSERT INTO auth.users(id,email) VALUES({q(a)},'crm@test'),({q(b)},'commercial@test'),({q(c)},'other@test'),({q(ext)},'external@test');INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'CRM',{q(org)},{q(a)}),({q(other)},'Other',{q(other)},{q(c)});INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(b)},'comercial'),({q(org)},{q(ext)},'comercial')")
 def rpc(name,*args,user=a,fail=None):
  value=db.call(name,','.join(q(json.dumps(x) if isinstance(x,(dict,list)) else x) if x is not None else 'NULL' for x in args),user,fail)
  return json.loads(value) if value else None
 def save(kind,data,**kw):return rpc('crm_save',org,kind,data,**kw)
 def action(kind,id,verb,data={},key=None,**kw):return rpc('crm_action',org,kind,id,verb,data,key or uid(),**kw)
 def query(kind,filters={},**kw):return rpc('crm_query',org,kind,filters,**kw)
 company=sql(f"SELECT partner_save_company({q(org)},'{json.dumps({'code':'UNIFIED','legal_name':'Unified company','roles':['SUPPLIER']})}')",a)
 customer=save('customer',{'company_id':company})
 assert sql(f"SELECT count(*) FROM companies WHERE id={q(company)}")=='1'
 assert sql(f"SELECT count(*) FROM company_roles WHERE company_id={q(company)}")=='2'
 print('PASS A: supplier gains customer role without duplicate Company')
 pipeline=save('pipeline',{'name':'B2B'})['id'];stage=save('stage',{'pipeline_id':pipeline,'name':'Qualificação','position':1,'probability':25})['id']
 second=save('stage',{'pipeline_id':pipeline,'name':'Negociação','position':2,'probability':60})['id']
 lead=save('lead',{'name':'Contato','company_name':'Unified','email':'contact@test','status':'QUALIFIED'})['id']
 payload={'company_id':company,'stage_id':stage};key=uid()
 with ThreadPoolExecutor(2) as pool:converted=list(pool.map(lambda _:action('lead',lead,'convert',payload,key),range(2)))
 assert converted[0]==converted[1]
 assert sql(f"SELECT count(*) FROM sales_opportunities WHERE source_id={q(lead)}")=='1'
 assert sql(f"SELECT count(*) FROM company_contacts WHERE company_id={q(company)}")=='1'
 contact=converted[0]['contact_id']
 print('PASS B: concurrent lead conversion idempotent; contact and history retained')
 repa=save('representative',{'representative_code':'A','name':'A','representative_type':'INTERNAL'})['id']
 repb=save('representative',{'representative_code':'B','name':'B','representative_type':'EXTERNAL','user_id':ext})['id']
 action('portfolio',company,'assign',{'representative_id':repa,'reason':'Inicial'})
 opportunity=save('opportunity',{'company_id':company,'title':'Histórico','stage_id':stage})['id']
 action('portfolio',company,'assign',{'representative_id':repb,'reason':'Transferência'})
 assert sql(f"SELECT count(*) FROM customer_portfolio_assignments WHERE company_id={q(company)}")=='2'
 assert sql(f"SELECT representative_id FROM sales_opportunities WHERE id={q(opportunity)}")==repa
 print('PASS C: portfolio changes preserve prior assignments and opportunity owner')
 variants=[]
 for n in range(3):
  p,v=uid(),uid();sql(f"INSERT INTO products(id,organization_id,code,name,status) VALUES({q(p)},{q(org)},'P{n}','Product {n}','ACTIVE');INSERT INTO product_variants(id,organization_id,product_id,sku,status) VALUES({q(v)},{q(org)},{q(p)},'SKU{n}','ACTIVE')")
  variants.append(v)
 items=[{'variant_id':v,'quantity':n+1,'unit_price':10} for n,v in enumerate(variants)]
 opp=save('opportunity',{'company_id':company,'title':'3 variantes','stage_id':stage,'items':items})['id']
 assert sql(f"SELECT estimated_value FROM sales_opportunities WHERE id={q(opp)}")=='60.00'
 action('opportunity',opp,'stage',{'stage_id':second,'reason':'Contato feito'})
 assert sql(f"SELECT count(*) FROM opportunity_stage_history WHERE opportunity_id={q(opp)}")=='2'
 assert sql("SELECT count(*) FROM inventory_movements")=='0'
 print('PASS D: item quantities sum to 60; stage snapshots; no stock writes')
 table=json.loads(rpc('price_save_table',org,{'code':'B2B','name':'B2B','valid_from':'2020-01-01'}))['id']
 for v in variants:rpc('pricing_publish',org,{'price_table_id':table,'variant_id':v,'unit_price':10,'valid_from':'2020-01-01'})
 valid=(datetime.date.today()+datetime.timedelta(days=30)).isoformat()
 quote_data={'company_id':company,'price_table_id':table,'primary_contact_id':contact,'valid_until':valid,'items':items,'discount_percent':10}
 quote=action('quote',None,'create',quote_data)['id']
 action('quote',quote,'submit')
 action('quote',quote,'approve',{'reason':'Sem alçada'},user=b,fail='Permissão')
 save('discount_authority',{'user_id':a,'max_discount_percent':5,'reason':'Limite'})
 action('quote',quote,'approve',{'reason':'Excede'},fail='alçada')
 authid=query('authorities')['rows'][0]['id']
 save('discount_authority',{'id':authid,'max_discount_percent':20,'reason':'Revisão'})
 action('quote',quote,'approve',{'reason':'Aprovado'})
 action('quote',quote,'send')
 for v in variants:rpc('pricing_publish',org,{'price_table_id':table,'variant_id':v,'unit_price':20,'valid_from':datetime.date.today().isoformat()})
 q2=action('quote',quote,'revise',quote_data)['id']
 assert sql(f"SELECT total FROM sales_quotes WHERE id={q(quote)}")=='54.00'
 assert sql(f"SELECT total FROM sales_quotes WHERE id={q(q2)}")=='108.00'
 sql(f"UPDATE sales_quotes SET total=1 WHERE id={q(quote)}",fail='imutável')
 print('PASS E/F/G: quote versions preserve prices; server approval enforces configured authority')
 key=uid();payload={'contact_id':contact,'evidence':'Aceite registrado manualmente'}
 with ThreadPoolExecutor(2) as pool:accepted=list(pool.map(lambda _:action('quote',quote,'accept',payload,key),range(2)))
 assert accepted[0]==accepted[1]
 assert sql("SELECT count(*) FROM domain_events WHERE event_type='SALES_QUOTE_ACCEPTED'")=='1'
 assert sql("SELECT count(*) FROM inventory_movements")=='0'
 assert sql("SELECT count(*) FROM account_receivables")=='0'
 print('PASS I/J: acceptance produces one event and no ledger or receivable writes')
 query('quotes',{'id':quote},user=c,fail='Permissão')
 assert sql(f"SELECT count(*) FROM sales_quotes WHERE id={q(quote)}",c)=='0'
 query('margin',{'id':quote},user=b,fail='Permissão')
 othercompany=sql(f"SELECT partner_save_company({q(org)},'{json.dumps({'code':'OTHER','legal_name':'Other','roles':['CUSTOMER']})}')",a)
 save('customer',{'company_id':othercompany})
 assert query('companies',{'id':othercompany},user=ext)['total']==0
 assert sql(f"SELECT count(*) FROM companies WHERE id={q(othercompany)}",ext)=='0'
 assert query('quotes',{'id':quote},user=ext)['total']==1
 print('PASS K/L: tenant and external portfolio scope; sensitive RPC permission enforced')
 activity=save('activity',{'company_id':company,'subject':'Retornar','activity_type':'CALL','scheduled_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})['id']
 save('activity',{'id':activity,'scheduled_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'reason':'Reagendado'})
 assert sql(f"SELECT count(*) FROM crm_activity_history WHERE activity_id={q(activity)}")=='2'
 assert sql(f"SELECT status FROM crm_activities WHERE id={q(activity)}")=='PENDING'
 print('PASS: activities reschedule with history, never auto-complete')
 query('dashboard')
 query('stock',{'id':variants[0]})
 print('PASS: real dashboard and official balance queries')

if __name__=='__main__':
 try:run()
 finally:db.cleanup()
