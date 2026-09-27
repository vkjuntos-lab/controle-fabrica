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
 for name in ['20260926100000_partner_reconciliation.sql','20260928100000_finance.sql','20260930100000_cost_engine.sql','20261001100000_purchasing.sql','20261002100000_planning.sql','20261003100000_planning_engine.sql','20261004100000_planning_fixes.sql','20261005100000_crm.sql','20261006100000_crm_integrity.sql','20261007100000_crm_documents.sql','20261008100000_crm_company_services.sql','20261009100000_crm_customer_history.sql']:
  sql((db.ROOT/'supabase/migrations'/name).read_text())

 a,b,c,org,other,ext=[uid() for _ in range(6)]
 sql(f"INSERT INTO auth.users(id,email) VALUES({q(a)},'crm@test'),({q(b)},'commercial@test'),({q(c)},'other@test'),({q(ext)},'external@test');INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'CRM',{q(org)},{q(a)}),({q(other)},'Other',{q(other)},{q(c)});INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(b)},'comercial'),({q(org)},{q(ext)},'comercial')")
 def call(name,*args,user=a,fail=None):
  return db.call(name,','.join(q(json.dumps(x) if isinstance(x,(dict,list)) else x) if x is not None else 'NULL' for x in args),user,fail)
 def rpc(name,*args,**kw):
  value=call(name,*args,**kw)
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
 table=json.loads(call('price_save_table',org,{'code':'B2B','name':'B2B','valid_from':'2020-01-01'}))['id']
 for v in variants:call('pricing_publish',org,{'price_table_id':table,'variant_id':v,'unit_price':10,'valid_from':'2020-01-01'})
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
 for v in variants:call('pricing_publish',org,{'price_table_id':table,'variant_id':v,'unit_price':20,'valid_from':datetime.date.today().isoformat()})
 q2=action('quote',quote,'revise',quote_data)['id']
 assert sql(f"SELECT total FROM sales_quotes WHERE id={q(quote)}")=='54.00'
 assert sql(f"SELECT total FROM sales_quotes WHERE id={q(q2)}")=='108.00'
 assert query('quotes',{'quote_number':str(query('quotes',{'id':quote})['rows'][0]['quote_number'])})['total']==2
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

 # H: real overdue receivable and explicit credit policies, isolated from basic commercial users.
 sql(f"INSERT INTO account_receivables(organization_id,company_id,source_type,source_id,document_number,description,issue_date,due_date,original_amount,open_amount) VALUES({q(org)},{q(company)},'MANUAL','acceptance-credit','CRM-CREDIT','Aceite crédito',current_date-10,current_date-1,75,75)")
 policy=save('credit',{'company_id':company,'credit_limit':100,'block_overdue':True,'block_over_limit':True,'reason':'Política de teste'})['id']
 position=query('finance',{'company_id':company})
 assert float(position['open_amount'])==75 and float(position['overdue_amount'])==75 and float(position['credit_available'])==25,position
 query('finance',{'company_id':company},user=b,fail='Permissão')
 action('quote',q2,'submit')
 action('quote',q2,'approve',{'reason':'Deve bloquear vencido'},fail='Política')
 save('credit',{'id':policy,'block_overdue':False,'reason':'Somente limite'})
 action('quote',q2,'approve',{'reason':'Deve bloquear exposição'},fail='Política')
 save('credit',{'id':policy,'credit_limit':1000,'reason':'Revisão autorizada'})
 action('quote',q2,'approve',{'reason':'Dentro da política explícita'})
 assert sql(f"SELECT status FROM sales_quotes WHERE id={q(q2)}")=='APPROVED'
 sql(f"UPDATE companies SET status='BLOCKED' WHERE id={q(company)}")
 action('quote',q2,'send',fail='bloqueado')
 sql(f"UPDATE companies SET status='ACTIVE' WHERE id={q(company)}")
 print('PASS H: overdue/credit and blocked-company rules; sensitive financial reads protected')
 # Partial patches preserve assignment. An external user cannot steal another activity.
 otherlead=save('lead',{'name':'Interno','assigned_user_id':b})['id']
 save('lead',{'id':otherlead,'notes':'Patch'})
 assert sql(f"SELECT assigned_user_id FROM leads WHERE id={q(otherlead)}")==b
 private_activity=save('activity',{'company_id':othercompany,'subject':'Interna','activity_type':'TASK','assigned_user_id':b,'scheduled_at':datetime.datetime.now(datetime.timezone.utc).isoformat()})['id']
 save('activity',{'id':private_activity,'description':'Patch','reason':'Revisão'})
 assert sql(f"SELECT assigned_user_id FROM crm_activities WHERE id={q(private_activity)}")==b
 save('activity',{'id':private_activity,'company_id':company,'assigned_user_id':ext,'reason':'Tentativa'},user=ext,fail='carteira')
 save('activity',{'company_id':company,'lead_id':otherlead,'subject':'Tentativa','activity_type':'TASK','scheduled_at':datetime.datetime.now(datetime.timezone.utc).isoformat()},user=ext,fail='carteira')
 assert sql(f"SELECT has_permission({q(org)},'partners.read')",ext)=='f'
 rpc('partner_query',org,'companies',{},user=ext,fail='permissão')
 assert sql(f"SELECT has_permission({q(org)},'reconciliation.read')",ext)=='f'
 assert sql(f"SELECT has_permission({q(org)},'costs.read')",ext)=='f'
 print('PASS: patch retains owners; external cross-link/hijack and broad ERP permission denied')
 assert int(sql("SELECT count(*) FROM audit_log WHERE action LIKE 'crm.%'"))>20
 for table in ['customer_profiles','leads','sales_quotes','sales_opportunities','crm_activities','customer_portfolio_assignments','crm_operation_keys']:
  assert sql(f"SELECT count(*) FROM {table}",c)=='0',table
  sql(f"UPDATE {table} SET updated_at=now()",b,fail='permission denied')
 print('PASS: audit events and direct RLS/write restrictions')
 # Private storage metadata and policies are tested locally; object delivery needs deployed Storage.
 sql("ALTER TABLE storage.objects ADD COLUMN metadata jsonb")
 doc=rpc('crm_document',org,'prepare',{'company_id':company,'key':uid(),'name':'contrato.pdf','mime_type':'application/pdf','size_bytes':120,'purpose':'Contrato comercial'})
 rpc('crm_document',org,'complete',{'id':doc['id']},fail='ausente')
 sql(f"INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('crm-documents',{q(doc['storage_path'])},'{json.dumps({'size':120,'mimetype':'application/pdf'})}')",a)
 rpc('crm_document',org,'complete',{'id':doc['id']})
 assert query('documents',{'company_id':company})['total']==1
 rpc('crm_document',org,'download',{'id':doc['id']},user=c,fail='Permissão')
 assert sql("SELECT count(*) FROM storage.objects",c)=='0'
 rpc('crm_document',org,'prepare',{'company_id':company,'key':uid(),'name':'bad.html','mime_type':'text/html','size_bytes':120,'purpose':'Teste'},fail='check constraint')
 rpc('crm_document',org,'prepare',{'company_id':company,'key':uid(),'name':'large.pdf','mime_type':'application/pdf','size_bytes':10485761,'purpose':'Teste'},fail='check constraint')
 timeline=query('timeline',{'company_id':company})
 assert {'LEAD','CONTACT','OPPORTUNITY','QUOTE','ACTIVITY','RECEIVABLE'}<=set(r['kind'] for r in timeline['rows'])
 timeline=query('timeline',{'company_id':company},user=ext)
 assert 'RECEIVABLE' not in [r['kind'] for r in timeline['rows']]
 assert all(r.get('href') for r in timeline['rows'])
 query('availability',{'id':variants[0]})
 print('PASS: private documents size/type/scope; real timeline filters financial facts; planning query')


 # Commercial user creates a new Company through the shared kernel without Partner privileges.
 newlead=save('lead',{'name':'Novo contato','company_name':'Nova empresa','status':'QUALIFIED','email':'new@test'},user=b)['id']
 converted=action('lead',newlead,'convert',{'stage_id':stage,'company':{'code':'NEW-B2B','legal_name':'Nova empresa'}},user=b)
 assert sql(f"SELECT count(*) FROM companies WHERE id={q(converted['company_id'])}")=='1'
 assert sql(f"SELECT count(*) FROM partner_profiles WHERE company_id={q(converted['company_id'])}")=='0'
 save('contact',{'id':contact,'company_id':company,'name':'Contato atualizado'},user=ext)
 assert sql(f"SELECT email FROM company_contacts WHERE id={q(contact)}")=='contact@test'
 sql(f"SELECT company_save_core({q(org)},'{{}}')",b,fail='permission denied')
 sql(f"SELECT partner_save_company({q(org)},'{{}}')",ext,fail='Permissão')
 assert query('customers',{'q':'Unified','status':'ACTIVE','representative_id':repb})['total']==1
 tag=save('tag',{'name':'Dança'})['id'];save('customer_tag',{'company_id':company,'tag_id':tag})
 assert query('customers',{'tag_id':tag})['total']==1
 assert query('customers',{'tag_id':uid()})['total']==0
 # Dashboard aggregates all records, not just the first fifty, with responsible filters.
 sql(f"INSERT INTO sales_opportunities(organization_id,company_id,pipeline_id,stage_id,title,probability,estimated_value,representative_id) SELECT {q(org)},{q(company)},{q(pipeline)},{q(stage)},'Volume',25,2,{q(repb)} FROM generate_series(1,55)")
 dashboard=query('dashboard',{'assigned_user_id':ext})
 assert int(dashboard['open_opportunities'])>=55
 assert sum(int(r['count']) for r in dashboard['stage_breakdown'])==int(dashboard['open_opportunities'])
 assert all(r['name']=='B' for r in dashboard['representative_breakdown'])
 run=rpc('planning_execute',org,{'name':uid(),'idempotency_key':uid(),'horizon_start':datetime.date.today().isoformat(),'horizon_end':valid})
 assert run['status']!='FAILED',run
 availability=query('availability',{'id':variants[0]})
 assert len(availability['rows'])>0 and availability['promise_of_delivery']==False
 print('PASS: commercial Company/contact service; filters; full dashboard; planning snapshots')

 # Multi-role history integrates reconciliation without leaking it to basic commercial users.
 call('partner_save_company',org,{'code':'UNIFIED','legal_name':'Unified company','roles':['PARTNER']},company)
 partner=sql(f"SELECT id FROM partner_profiles WHERE company_id={q(company)}")
 reconciliation=uid()
 sql(f"INSERT INTO partner_reconciliations(id,organization_id,partner_id,period_start,period_end) VALUES({q(reconciliation)},{q(org)},{q(partner)},current_date,current_date)")
 timeline=query('timeline',{'company_id':company})['rows']
 assert any(r['kind']=='RECONCILIATION' and r['id']==reconciliation for r in timeline)
 assert not any(r['kind']=='RECONCILIATION' for r in query('timeline',{'company_id':company},user=b)['rows'])
 first=rpc('crm_query',org,'opportunities',{'company_id':company},1)['rows']
 secondpage=rpc('crm_query',org,'opportunities',{'company_id':company},2)['rows']
 assert len(first)==50 and secondpage and not(set(r['id'] for r in first)&set(r['id'] for r in secondpage))
 print('PASS: Customer 360 reconciliation permission and distinct pages beyond 50 facts')

if __name__=='__main__':
 try:run()
 finally:db.cleanup()
