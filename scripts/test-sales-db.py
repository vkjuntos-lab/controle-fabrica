#!/usr/bin/env python3
"""MASTER 013 integration tests in disposable PostgreSQL. Never uses a published database."""
import importlib.util,json,datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
spec=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('test-inventory-db.py'))
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
q,sql,uid=db.q,db.sql,db.uid
def run():
 db.setup()
 for name in ['20260926100000_partner_reconciliation.sql','20260928100000_finance.sql','20260930100000_cost_engine.sql','20261001100000_purchasing.sql','20261002100000_planning.sql','20261003100000_planning_engine.sql','20261004100000_planning_fixes.sql','20261005100000_crm.sql','20261006100000_sales_orders.sql']:
  sql((db.ROOT/'supabase/migrations'/name).read_text())
 today=datetime.date.today()
 (a,commercial,approver,picker,fin,outsider,org,other)=(uid() for _ in range(8))
 sql(f"""INSERT INTO auth.users(id,email) VALUES({q(a)},'admin@test'),({q(commercial)},'comercial@test'),({q(approver)},'gestor@test'),
  ({q(picker)},'estoque@test'),({q(fin)},'financeiro@test'),({q(outsider)},'externo@test');
  INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'Vendas','vendas',{q(a)}),({q(other)},'Outra','outra',{q(outsider)});
  INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(a)},'admin'),({q(org)},{q(commercial)},'comercial'),
  ({q(org)},{q(approver)},'gestor'),({q(org)},{q(picker)},'estoque'),({q(org)},{q(fin)},'financeiro') ON CONFLICT DO NOTHING;
  INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(other)},{q(outsider)},'comercial') ON CONFLICT DO NOTHING""")
 def call(name,*args,user=a,fail=None):
  return db.call(name,','.join(q(json.dumps(x) if isinstance(x,(dict,list)) else x) if x is not None else 'NULL' for x in args),user,fail)
 def rpc(name,*args,**kw):
  value=call(name,*args,**kw)
  return json.loads(value) if value else None
 def crm(kind,data,**kw):return rpc('crm_save',org,kind,data,**kw)
 def crmact(kind,i,verb,data={},key=None,**kw):return rpc('crm_action',org,kind,i,verb,data,key or uid(),**kw)
 def save(data,**kw):return rpc('sales_save',org,data,**kw)
 def action(order,verb,data={},**kw):return rpc('sales_order_action',org,order,verb,data,**kw)
 def query(kind,filters={},**kw):return rpc('sales_query',org,kind,filters,**kw)
 def detail(order,**kw):return rpc('sales_order_detail',org,order,**kw)
 def raw(name,args,user,fail=None):return db.call(name,args,user,fail)
 def arg(x):return q(json.dumps(x)) if isinstance(x,(dict,list)) else q(x)
 def nw(variant,loc):return raw('inventory_post_movement',','.join(map(q,[org,variant,loc,'OPENING_BALANCE',100]))+",_reason=>'Saldo inicial'",a)
 def balance(variant,loc):return float(sql(f"SELECT inventory_get_balance({q(org)},{q(variant)},{q(loc)})",a))

 # ---------------------------------------------------------------- cenario
 company=raw('partner_save_company',q(org)+','+arg({'code':'ACLIENTE','legal_name':'Cliente Alfa','roles':['CUSTOMER']}),a)
 crm('customer',{'company_id':company})
 address=raw('partner_save_detail',q(org)+','+q(company)+",'address',"+arg({'type':'SHIPPING','postal_code':'01310-100','street':'Av. Paulista','number':'1000','district':'Bela Vista','city':'Sao Paulo','state':'SP','is_primary':True})+',NULL',a)
 warehouse=sql(f"SELECT id FROM inventory_locations WHERE organization_id={q(org)} AND name='Fábrica'",a) or sql(f"""INSERT INTO inventory_locations(id,organization_id,code,name,type) VALUES({q(uid())},{q(org)},'PRINCIPAL','Fábrica','FACTORY') RETURNING id""",a)
 quarantine=sql(f"INSERT INTO inventory_locations(id,organization_id,code,name,type,operational_purpose) VALUES({q(uid())},{q(org)},'QUAR','Quarentena','OTHER','QUARANTINE') RETURNING id",a)
 table=json.loads(raw('price_save_table',q(org)+','+arg({'code':'VAREJO','name':'Varejo','valid_from':'2020-01-01'}),a))['id']
 variants={}
 for code,price,bc in [('SAP-001',25.00,'7891000100017'),('SAP-002',10.50,'7891000100024'),('SAP-003',7.25,None)]:
  p,v=uid(),uid()
  sql(f"INSERT INTO products(id,organization_id,code,name,status) VALUES({q(p)},{q(org)},'P-{code}','Produto {code}','ACTIVE');INSERT INTO product_variants(id,organization_id,product_id,sku,status,barcode) VALUES({q(v)},{q(org)},{q(p)},{q(code)},'ACTIVE',{q(bc) if bc else 'NULL'})")
  raw('pricing_publish',q(org)+','+arg({'price_table_id':table,'variant_id':v,'unit_price':price,'valid_from':'2020-01-01'}),a)
  variants[code]={'v':v,'price':price,'barcode':bc}
 nw(variants['SAP-001']['v'],warehouse);nw(variants['SAP-002']['v'],warehouse)
 assert balance(variants['SAP-001']['v'],warehouse)==100.0
 print('PASS A: cenario montado; saldo fisico oficial em 100')

 # ------------------------------------------------- criacao e preco oficial
 order=save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'items':[
   {'variant_id':variants['SAP-001']['v'],'quantity':10},
   {'variant_id':variants['SAP-002']['v'],'quantity':4,'discount_amount':2.00}]})
 assert order['status']=='DRAFT' and float(order['total_amount'])==290.0, order
 assert sql(f"SELECT subtotal||'/'||discount_total||'/'||total_amount FROM sales_orders WHERE id={q(order['id'])}")=='292.00/2.00/290.00'
 assert float(sql(f"SELECT unit_price FROM sales_order_items WHERE sales_order_id={q(order['id'])} AND sku_snapshot='SAP-001'"))==25.0
 sql(f"SELECT count(*) FROM inventory_movements",fail=None)=='0'
 print('PASS B: pedido nasce com preco oficial da tabela e subtotal correto; nenhum movimento')

 # Preco abaixo do minimo e preco Forcado: o servidor decide, nunca o front.
 below=save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'items':[{'variant_id':variants['SAP-001']['v'],'quantity':1,'unit_price':1.00}]})
 assert float(sql(f"SELECT unit_price FROM sales_order_items WHERE sales_order_id={q(below['id'])}"))==25.0
 sql(f"DELETE FROM sales_orders WHERE id={q(below['id'])}",a,fail='permission denied')
 print('PASS C: preco enviado pelo cliente e ignorado; a tabela oficial prevalece')

 # Variante descontinuada nao entra em pedido novo.
 sql(f"UPDATE product_variants SET status='DISCONTINUED' WHERE id={q(variants['SAP-003']['v'])}")
 save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'items':[{'variant_id':variants['SAP-003']['v'],'quantity':1}]},user=commercial,fail='descontinuada')
 sql(f"UPDATE product_variants SET status='ACTIVE' WHERE id={q(variants['SAP-003']['v'])}")
 # A力和 comercial: quem tem o cargo, e nao a tela, decide.
 save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'items':[{'variant_id':variants['SAP-001']['v'],'quantity':1}]},user=picker,fail='Sem permiss')
 save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'items':[{'variant_id':variants['SAP-001']['v'],'quantity':1}]},user=outsider,fail='Sem permiss')
 print('PASS D: variante descontinuada bloqueada e permissao aplicada no servidor')

 # Edicao so em rascunho; depois da aprovacao o preco fica congelado.
 edited=save({'id':order['id'],'items':[{'variant_id':variants['SAP-001']['v'],'quantity':20}],'commercial_notes':'Revisado'})
 assert float(edited['total_amount'])==500.0
 assert sql(f"SELECT count(*) FROM sales_order_items WHERE sales_order_id={q(order['id'])}")=='1'
 save({'id':order['id'],'items':[{'variant_id':variants['SAP-002']['v'],'quantity':1}]})
 assert float(sql(f"SELECT total_amount FROM sales_orders WHERE id={q(order['id'])}"))==10.50
 save({'id':order['id'],'items':[{'variant_id':variants['SAP-001']['v'],'quantity':20}]})
 print('PASS E: edicao substitui itens e recalcula total; rascunho permanece editavel')

 # ------------------------------------------------------- aprovacao e credito
 action(order['id'],'submit',user=commercial)
 action(order['id'],'submit',user=commercial,fail='rascunho')
 action(order['id'],'approve',user=commercial,fail='sales_orders.approve')
 action(order['id'],'approve',user=a,fail='Segrega')
 assert sql(f"SELECT count(*) FROM sales_credit_checks WHERE sales_order_id={q(order['id'])}")=='0'
 action(order['id'],'approve',user=approver)
 assert sql(f"SELECT status FROM sales_orders WHERE id={q(order['id'])}")=='APPROVED'
 assert sql(f"SELECT count(*) FROM sales_credit_checks WHERE sales_order_id={q(order['id'])}")=='1'
 assert float(sql(f"SELECT approved_quantity FROM sales_order_items WHERE sales_order_id={q(order['id'])}"))==20.0
 assert sql(f"SELECT count(*) FROM sales_demands WHERE sales_order_id={q(order['id'])}")=='1'
 save({'id':order['id'],'items':[{'variant_id':variants['SAP-001']['v'],'quantity':1}]},user=approver,fail='rascunho')
 print('PASS F: aprovacao exige outro usuario, preserva a consulta de credito e gera demanda')

 # -------------------------------------------- disponibilidade e reserva
 avail=rpc('sales_availability',org,order['id'],None,user=a)
 assert avail['sufficient'] and avail['pending_quantity']==20, avail
 reserved=rpc('sales_reserve',org,order['id'],{},user=picker)
 assert reserved['reserved_total']==20, reserved
 assert balance(variants['SAP-001']['v'],warehouse)==100.0
 assert float(sql(f"SELECT inventory_get_balance({q(org)},{q(variants['SAP-001']['v'])})",a))==100.0
 assert float(raw('sales_available',','.join(map(q,[org,variants['SAP-001']['v'],warehouse])),a))==80.0
 assert float(raw('sales_reserved',','.join(map(q,[org,variants['SAP-001']['v'],warehouse])),a))==20.0
 assert sql(f"SELECT count(*) FROM inventory_movements WHERE movement_type='SALE'")=='0'
 again=rpc('sales_reserve',org,order['id'],{},user=picker)
 assert again['created']==0, again
 print('PASS G: DISPONIVEL = SALDO FISICO - RESERVAS; reserva nao cria movimento e e idempotente')

 # Local de quarentena nunca atende venda direta.
 rpc('sales_reserve',org,order['id'],{'items':[{'sales_order_item_id':sql(f"SELECT id FROM sales_order_items WHERE sales_order_id={q(order['id'])}"),'quantity':1,'inventory_location_id':quarantine}]},user=picker,fail='não é autorizada')
 # Um segundo pedido do mesmo cliente ve o disponibilidade reduzido.
 order2=save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'items':[{'variant_id':variants['SAP-001']['v'],'quantity':100}]})
 a2=rpc('sales_availability',org,order2['id'],None,user=a)
 assert a2['items'][0]['available']==80.0 and a2['items'][0]['required_quantity']==100.0, a2
 assert a2['sufficient'] is False and a2['make_to_order_quantity']==20, a2
 print('PASS H: reserva de um pedido reduz o disponivel do outro; quarentena nao atende venda direta')

 # ------------------------------------------------- atendimento e picking
 fulfillment=rpc('sales_fulfillment_create',org,order['id'],{'items':[
   {'sales_order_item_id':sql(f"SELECT id FROM sales_order_items WHERE sales_order_id={q(order['id'])}"),'quantity':20}]},user=picker)
 assert fulfillment['status']=='READY_FOR_PICKING', fulfillment
 action(below['id'],'cancel',{},user=approver,fail='Motivo')
 action(below['id'],'cancel',{'reason':'Preco invalido'},user=approver)
 rpc('sales_fulfillment_action',org,fulfillment['id'],'start',{},user=picker)
 rpc('sales_pick_scan',org,fulfillment['picking_task_id'],{'code':variants['SAP-002']['barcode'],'quantity':1},user=picker,fail='não está neste')
 scanned=rpc('sales_pick_scan',org,fulfillment['picking_task_id'],{'code':variants['SAP-001']['barcode'],'quantity':12},user=picker)
 assert scanned['remaining']==8
 rpc('sales_pick_scan',org,fulfillment['picking_task_id'],{'code':'SAP-001','quantity':8},user=picker)
 rpc('sales_pick_scan',org,fulfillment['picking_task_id'],{'code':variants['SAP-001']['barcode'],'quantity':1},user=picker,fail='Excesso')
 assert sql("SELECT count(*) FROM inventory_movements WHERE movement_type='SALE'")=='0'
 print('PASS I: leitura por codigo de barras e SKU; item errado e excesso recusados; separar nao baixa estoque')

 rpc('sales_fulfillment_action',org,fulfillment['id'],'pick',{},user=picker)
 item_id=sql(f"SELECT id FROM picking_task_items WHERE picking_task_id={q(fulfillment['picking_task_id'])}")
 rpc('sales_pick_confirm',org,fulfillment['picking_task_id'],{'items':[{'picking_task_item_id':item_id,'confirmed_quantity':19}]},user=picker)
 assert sql(f"SELECT count(*) FROM logistics_exceptions WHERE exception_type='PICKING_DIFFERENCE' AND status='OPEN'")=='1'
 assert sql(f"SELECT status FROM picking_tasks WHERE id={q(fulfillment['picking_task_id'])}")=='CONFIRMED'
 # Conferido e imutavel: a divergencia vira excecao, nunca ajuste silencioso.
 rpc('sales_pick_confirm',org,fulfillment['picking_task_id'],{'items':[{'picking_task_item_id':item_id,'confirmed_quantity':20}]},user=picker,fail='não está em conferência')
 assert float(sql(f"SELECT confirmed_quantity FROM picking_task_items WHERE id={q(item_id)}"))==19.0
 print('PASS J: divergencia entre separado e conferido vira excecao; conferencia e imutavel')

 rpc('sales_fulfillment_action',org,fulfillment['id'],'pack',{},user=picker)
 rpc('sales_fulfillment_action',org,fulfillment['id'],'start',{},user=picker,fail='não está pronto para separação')
 rpc('sales_fulfillment_action',org,fulfillment['id'],'pack',{},user=picker)
 packed=rpc('sales_pack',org,fulfillment['id'],{'items':[{'picking_task_item_id':item_id,'quantity':20}],
   'gross_weight_kg':3.4,'length_cm':40,'width_cm':30,'height_cm':20,
   'volumes':[{'volume_number':'CX-1','gross_weight_kg':3.4}]},user=picker)
 assert packed['weight_informed'] is True and packed['volumes']==1
 assert float(sql(f"SELECT quantity FROM packing_record_items WHERE packing_record_id={q(packed['packing_record_id'])}"))==20.0
 print('PASS K: peso e dimensao sao os informados; nunca estimados; volumes registrados')

 # ------------------------------------------ expedicao: baixa no ledger
 rpc('sales_fulfillment_action',org,fulfillment['id'],'ready',{},user=picker)
 shipment=rpc('sales_shipment_create',org,order['id'],{'fulfillment_order_id':fulfillment['id'],
   'tracking_code':'BR123456789BR','expected_delivery_at':(datetime.datetime.now(datetime.timezone.utc)+datetime.timedelta(days=3)).isoformat()},user=picker)
 assert shipment['status']=='READY', shipment
 dispatched=rpc('sales_shipment_dispatch',org,shipment['id'],{'dispatch_key':'DISP-1'},user=picker)
 assert dispatched['quantity']==20 and balance(variants['SAP-001']['v'],warehouse)==80.0
 assert float(sql(f"SELECT fulfilled_quantity FROM sales_order_items WHERE sales_order_id={q(order['id'])}"))==20.0
 assert sql(f"SELECT status FROM sales_orders WHERE id={q(order['id'])}")=='FULFILLED'
 assert sql(f"SELECT status FROM sales_orders WHERE id={q(order['id'])} AND approved_by={q(approver)}")=='FULFILLED'
 repeat=rpc('sales_shipment_dispatch',org,shipment['id'],{'dispatch_key':'DISP-1'},user=picker)
 assert repeat['deduped'] is True and balance(variants['SAP-001']['v'],warehouse)==80.0
 assert sql(f"SELECT count(*) FROM inventory_movements WHERE movement_type='SALE' AND direction='OUT'")=='1'
 print('PASS L: expedicao baixa o ledger uma unica vez; reenvio nao duplica a baixa')

 # Expedicao exige as duas permissoes: quem nao move estoque nao despacha.
 second=save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'items':[{'variant_id':variants['SAP-002']['v'],'quantity':5}]})
 action(second['id'],'submit',user=commercial);action(second['id'],'approve',user=approver)
 rpc('sales_reserve',org,second['id'],{},user=picker)
 f2=rpc('sales_fulfillment_create',org,second['id'],{'items':[{'sales_order_item_id':sql(f"SELECT id FROM sales_order_items WHERE sales_order_id={q(second['id'])}"),'quantity':5}]},user=picker)
 rpc('sales_shipment_create',org,second['id'],{'fulfillment_order_id':f2['id']},user=commercial)
 sh2=sql(f"SELECT id FROM shipments WHERE sales_order_id={q(second['id'])}")
 rpc('sales_shipment_dispatch',org,sh2,{},user=commercial,fail='Sem permiss')
 rpc('sales_shipment_dispatch',org,sh2,{},user=picker)
 assert balance(variants['SAP-002']['v'],warehouse)==95.0
 print('PASS M: despachar exige permissao de expedicao E de movimentacao de inventario')

 # --------------------------------------------------- entrega e comprovante
 rpc('sales_shipment_action',org,shipment['id'],'deliver',{},user=commercial,fail='prova de entrega')
 rpc('sales_shipment_action',org,shipment['id'],'proof',{'proof_type':'SIGNATURE','signature_name':'Recebedor Alfa'},user=commercial)
 delivered=rpc('sales_shipment_action',org,shipment['id'],'deliver',{},user=commercial)
 assert delivered['status']=='DELIVERED', delivered
 assert float(sql(f"SELECT delivered_quantity FROM sales_order_items WHERE sales_order_id={q(order['id'])}"))==20.0
 assert balance(variants['SAP-001']['v'],warehouse)==80.0
 assert sql(f"SELECT closed_at IS NOT NULL FROM sales_orders WHERE id={q(order['id'])}")=='t'
 print('PASS N: entrega exige prova; entrega nao mexe no saldo (a baixa foi na expedicao)')

 # ------------------------------------------------------------- devolucao
 ret=rpc('sales_return_create',org,order['id'],{'reason':'Produto errado','shipment_id':shipment['id'],
   'items':[{'sales_order_item_id':sql(f"SELECT id FROM sales_order_items WHERE sales_order_id={q(order['id'])}"),'quantity':5,'condition':'RESELLABLE'}]},user=commercial)
 assert ret['status']=='DRAFT'
 rpc('sales_return_action',org,ret['id'],'submit',{},user=commercial)
 rpc('sales_return_action',org,ret['id'],'approve',{},user=commercial,fail='Segrega')
 rpc('sales_return_action',org,ret['id'],'approve',{},user=approver)
 rpc('sales_return_action',org,ret['id'],'receive',{'quantity':5,'destination':'SELLABLE','financial_action':'CREDIT_NOTE'},user=picker)
 assert balance(variants['SAP-001']['v'],warehouse)==85.0
 assert float(sql(f"SELECT returned_quantity FROM sales_order_items WHERE sales_order_id={q(order['id'])}"))==5.0
 assert sql(f"SELECT financial_action FROM customer_returns WHERE id={q(ret['id'])}")=='CREDIT_NOTE'
 assert sql(f"SELECT count(*) FROM account_receivables WHERE source_type='SALE'")=='0'
 assert sql("SELECT count(*) FROM domain_events WHERE event_type='CUSTOMER_RETURN_FINANCIAL_REQUESTED'")=='1'
 print('PASS O: recebimento da devolucao devolve estoque; ajuste financeiro fica como SOLICITACAO, sem execucao')

 # Mercadoria danificada nunca volta a vendavel.
 ret2=rpc('sales_return_create',org,order['id'],{'reason':'Avarias','shipment_id':shipment['id'],
   'items':[{'sales_order_item_id':sql(f"SELECT id FROM sales_order_items WHERE sales_order_id={q(order['id'])}"),'quantity':2,'condition':'DAMAGED'}]},user=commercial)
 rpc('sales_return_action',org,ret2['id'],'submit',{},user=commercial);rpc('sales_return_action',org,ret2['id'],'approve',{},user=approver)
 sql(f"UPDATE customer_return_items SET destination='SELLABLE' WHERE customer_return_id={q(ret2['id'])}")
 rpc('sales_return_action',org,ret2['id'],'receive',{'quantity':2,'destination':'SELLABLE','destination_location_id':quarantine},user=picker,fail='condi')
 rpc('sales_return_action',org,ret2['id'],'receive',{'quantity':2,'destination':'QUARANTINE','destination_location_id':quarantine},user=picker)
 assert balance(variants['SAP-001']['v'],warehouse)==85.0
 assert float(sql(f"SELECT quantity FROM inventory_get_balance({q(org)},{q(variants['SAP-001']['v'])})"))==2.0
 assert float(raw('sales_available',','.join(map(q,[org,variants['SAP-001']['v'],quarantine])),a))==0.0
 print('PASS P: danificado so pode ir para quarentena; saldo em quarentena nao e vendavel')

 # ------------------------------------------- titulo financeiro unico
 assert sql(f"SELECT count(*) FROM account_receivables WHERE source_type='SALE' AND source_id={q(order['id'])}")=='1'
 sql("UPDATE account_receivables SET source_type='SALE'")
 duplicate=rpc('sales_create_receivables',org,order['id'],'ON_DISPATCH',user=fin)
 assert duplicate==0, duplicate
 assert sql(f"SELECT count(*) FROM account_receivables WHERE source_type='SALE' AND source_id={q(order['id'])}")=='1'
 assert sql(f"SELECT open_amount FROM account_receivables WHERE source_id={q(order['id'])} LIMIT 1")=='500.00'
 print('PASS Q: gatilho ON_DISPATCH gera UM titulo por pedido; repetir a chamada nao duplica')

 # ------------------------------------------ proposta -> conversao unica
 contact=crmact('lead',None,'create',{'name':'Contato Alfa','company_name':'Cliente Alfa','email':'alfa@test'})['contact_id']
 valid=(today+datetime.timedelta(days=30)).isoformat()
 quote=crmact('quote',None,'create',{'company_id':company,'price_table_id':table,'primary_contact_id':contact,
   'valid_until':valid,'items':[{'variant_id':variants['SAP-001']['v'],'quantity':8,'unit_price':22.00}]})['id']
 crmact('quote',quote,'submit');crmact('quote',quote,'approve',{'reason':'Comercial'})
 crmact('quote',quote,'send');crmact('quote',quote,'accept',{'contact_id':contact,'evidence':'Aceite'})
 key=uid()
 with ThreadPoolExecutor(2) as pool:
  converted=list(pool.map(lambda _:rpc('sales_convert_quote',org,quote,{},key,user=commercial),range(2)))
 assert converted[0]['id']==converted[1]['id'], converted
 assert sql(f"SELECT count(*) FROM sales_orders WHERE sales_quote_id={q(quote)}")=='1'
 assert float(sql(f"SELECT unit_price FROM sales_order_items WHERE sales_order_id={q(converted[0]['id'])}"))==22.00
 again=rpc('sales_convert_quote',org,quote,{},uid(),user=commercial)
 assert again['deduped'] is True and again['id']==converted[0]['id']
 assert sql("SELECT count(*) FROM inventory_movements")=='3'
 print('PASS R: proposta aceita -> conversao idempotente por chave e por vinculo; preco aceito preservado')

 # ----------------------------------------------- cancelamento e reserva
 order3=save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'items':[{'variant_id':variants['SAP-001']['v'],'quantity':5}]})
 action(order3['id'],'submit',user=commercial);action(order3['id'],'approve',user=approver)
 rpc('sales_reserve',org,order3['id'],{},user=picker)
 assert float(sql(f"SELECT reserved_quantity FROM sales_order_items WHERE sales_order_id={q(order3['id'])}"))==5.0
 assert float(raw('sales_available',','.join(map(q,[org,variants['SAP-001']['v'],warehouse])),a))==80.0
 action(order3['id'],'cancel',{'reason':'Cliente desistiu'},user=approver)
 assert sql(f"SELECT status FROM sales_orders WHERE id={q(order3['id'])}")=='CANCELED'
 assert float(sql(f"SELECT reserved_quantity FROM sales_order_items WHERE sales_order_id={q(order3['id'])}"))==0.0
 assert float(raw('sales_available',','.join(map(q,[org,variants['SAP-001']['v'],warehouse])),a))==85.0
 assert balance(variants['SAP-001']['v'],warehouse)==85.0
 print('PASS S: cancelar libera a reserva e devolve o disponivel sem tocar no saldo fisico')

 # Expiracao automatica de reserva vencida.
 order4=save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'items':[{'variant_id':variants['SAP-001']['v'],'quantity':3}]})
 action(order4['id'],'submit',user=commercial);action(order4['id'],'approve',user=approver)
 rpc('sales_reserve',org,order4['id'],{'expires_hours':1},user=picker)
 assert sql(f"SELECT count(*) FROM inventory_reservations WHERE sales_order_id={q(order4['id'])} AND status='ACTIVE'")=='1'
 sql(f"UPDATE inventory_reservations SET expires_at=now()-interval '1 hour' WHERE sales_order_id={q(order4['id'])}")
 expired=rpc('sales_expire_reservations',org,{},user=picker)
 assert expired['expired']==1, expired
 assert sql(f"SELECT count(*) FROM inventory_reservations WHERE sales_order_id={q(order4['id'])} AND status='EXPIRED'")=='1'
 assert float(raw('sales_available',','.join(map(q,[org,variants['SAP-001']['v'],warehouse])),a))==85.0
 print('PASS T: reserva vencida expira por chamada idempotente e devolve o disponivel')

 # ------------------------------------------------ painel, cliente 360
 dash=rpc('sales_dashboard',org,{},user=a)
 assert dash['open_exceptions']>=1 and dash['by_status'].get('FULFILLED')==2, dash
 assert 'DISPONÍVEL = SALDO FÍSICO - RESERVAS ATIVAS' in dash['definitions']['available_formula']
 activity=rpc('sales_company_activity',org,company,user=fin)
 assert len(activity['orders'])==7 and activity['totals']['orders']==7
 assert len(activity['shipments'])==2 and len(activity['returns'])==2
 full=detail(order['id'])
 assert len(full['items'])==1 and len(full['shipments'])==1 and len(full['returns'])==2
 assert len(full['movements'])==2 and len(full['receivables'])==1
 assert full['availability']['required_quantity']==20
 print('PASS U: painel e Customer 360 leem dos dados oficiais e declaram as formulas')

 # ------------------------------------------------------------- isolamento
 assert query('orders',user=outsider)['total']==0
 assert sql(f"SELECT count(*) FROM sales_orders WHERE organization_id={q(org)}",outsider)=='0'
 assert sql(f"SELECT count(*) FROM sales_orders WHERE organization_id={q(org)}",fin)=='7'
 sql(f"UPDATE sales_orders SET status='CANCELED' WHERE id={q(order['id'])}",fin,fail='permissao de linha')
 sql(f"DELETE FROM sales_orders WHERE id={q(order['id'])}",approver,fail='imut')
 print('PASS V: isolamento por organizacao; escrita direta bloqueada; rascunho terminal e imutavel')

 # Cliente de outra organizacao nunca enxerga o pedido.
 assert sql(f"SELECT count(*) FROM companies WHERE id={q(company)}",outsider)=='0'
 print('PASS W: empresa do cliente tambem fica presa a organizacao')

if __name__=='__main__':
 try:run()
 finally:db.cleanup()
