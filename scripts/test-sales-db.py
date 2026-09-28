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
 for name in ['20260926100000_partner_reconciliation.sql','20260928100000_finance.sql','20260930100000_cost_engine.sql','20261001100000_purchasing.sql','20261002100000_planning.sql','20261003100000_planning_engine.sql','20261004100000_planning_fixes.sql','20261005100000_crm.sql','20261006100000_crm_integrity.sql','20261006100000_sales_orders.sql','20261007100000_crm_documents.sql','20261008100000_crm_company_services.sql','20261009100000_crm_customer_history.sql','20261010100000_sales_integrity.sql','20261011100000_sales_planning.sql','20261012100000_sales_screen_fixes.sql']:
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
 def execute(operation,identifier=None,verb='',data={},user=a,**kw):return rpc('sales_execute',org,operation,identifier,verb,data,uid(),user=user,**kw)
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
 crm('discount_authority',{'user_id':a,'max_discount_percent':5,'reason':'Alçada do cenário'})
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
 # Expediu o que foi CONFERIDO (19), nunca o que foi separado: a divergencia
 # ja virou excecao e o saldo de 1 fica pendente, nao some.
 dispatched=rpc('sales_shipment_dispatch',org,shipment['id'],{'dispatch_key':'DISP-1'},user=picker)
 assert float(dispatched['quantity'])==19.0 and balance(variants['SAP-001']['v'],warehouse)==81.0
 assert float(sql(f"SELECT fulfilled_quantity FROM sales_order_items WHERE sales_order_id={q(order['id'])}"))==19.0
 assert sql(f"SELECT status FROM sales_orders WHERE id={q(order['id'])}")=='PARTIALLY_FULFILLED'
 assert sql(f"SELECT status FROM sales_orders WHERE id={q(order['id'])} AND approved_by={q(approver)}")=='PARTIALLY_FULFILLED'
 repeat=rpc('sales_shipment_dispatch',org,shipment['id'],{'dispatch_key':'DISP-1'},user=picker)
 assert repeat['deduped'] is True and balance(variants['SAP-001']['v'],warehouse)==81.0
 assert sql(f"SELECT count(*) FROM inventory_movements WHERE movement_type='SALE' AND direction='OUT'")=='1'
 print('PASS L: expedicao baixa o ledger uma unica vez; reenvio nao duplica a baixa')

 # Expedicao exige as duas permissoes: quem nao move estoque nao despacha.
 second=save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'items':[{'variant_id':variants['SAP-002']['v'],'quantity':5}]})
 action(second['id'],'submit',user=commercial);action(second['id'],'approve',user=approver)
 rpc('sales_reserve',org,second['id'],{},user=picker)
 rpc('sales_shipment_create',org,second['id'],{'items':[
   {'sales_order_item_id':sql(f"SELECT id FROM sales_order_items WHERE sales_order_id={q(second['id'])}"),'quantity':5}]},user=commercial)
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
 assert float(sql(f"SELECT delivered_quantity FROM sales_order_items WHERE sales_order_id={q(order['id'])}"))==19.0
 assert balance(variants['SAP-001']['v'],warehouse)==81.0
 # Saldo residual: o pedido nao se fecha sozinho nem some a pendencia.
 assert sql(f"SELECT status FROM sales_orders WHERE id={q(order['id'])}")=='PARTIALLY_FULFILLED'
 assert sql(f"SELECT closed_at IS NULL FROM sales_orders WHERE id={q(order['id'])}")=='t'
 print('PASS N: entrega exige prova; entrega nao mexe no saldo e nao fecha pedido com saldo')

 # ------------------------------------------------------------- devolucao
 ret=rpc('sales_return_create',org,order['id'],{'reason':'Produto errado','shipment_id':shipment['id'],
   'items':[{'sales_order_item_id':sql(f"SELECT id FROM sales_order_items WHERE sales_order_id={q(order['id'])}"),'quantity':5,'condition':'RESELLABLE'}]},user=a)
 assert ret['status']=='DRAFT'
 rpc('sales_return_action',org,ret['id'],'submit',{},user=a)
 # Quem abriu a devolucao nao pode aprovar: a segregacao vale para devolucao.
 rpc('sales_return_action',org,ret['id'],'approve',{},user=a,fail='Segrega')
 rpc('sales_return_action',org,ret['id'],'approve',{},user=approver)
 rpc('sales_return_action',org,ret['id'],'receive',{'quantity':5,'destination':'SELLABLE','financial_action':'CREDIT_NOTE'},user=picker)
 # Vendavel volta para o MESMO local de origem da expedicao: o destino nunca e inventado.
 assert balance(variants['SAP-001']['v'],warehouse)==86.0
 assert float(sql(f"SELECT returned_quantity FROM sales_order_items WHERE sales_order_id={q(order['id'])}"))==5.0
 assert sql(f"SELECT financial_action FROM customer_returns WHERE id={q(ret['id'])}")=='CREDIT_NOTE'
 # A devolucao pede ajuste, mas nao cria titulo: nenhum titulo aponta para a
 # devolucao e os dois pedidos expedidos seguem com exatamente um cada.
 assert sql("SELECT count(*) FROM account_receivables")=='2'
 assert sql(f"SELECT count(*) FROM account_receivables WHERE source_id={q(ret['id'])}")=='0'
 assert sql("SELECT count(*) FROM domain_events WHERE event_type='CUSTOMER_RETURN_FINANCIAL_REQUESTED'")=='1'
 print('PASS O: recebimento da devolucao devolve estoque; ajuste financeiro fica como SOLICITACAO, sem execucao')

 # Mercadoria danificada nunca volta a vendavel.
 ret2=rpc('sales_return_create',org,order['id'],{'reason':'Avarias','shipment_id':shipment['id'],
   'items':[{'sales_order_item_id':sql(f"SELECT id FROM sales_order_items WHERE sales_order_id={q(order['id'])}"),'quantity':2,'condition':'DAMAGED'}]},user=commercial)
 rpc('sales_return_action',org,ret2['id'],'submit',{},user=commercial);rpc('sales_return_action',org,ret2['id'],'approve',{},user=approver)
 sql(f"UPDATE customer_return_items SET destination='SELLABLE' WHERE customer_return_id={q(ret2['id'])}")
 rpc('sales_return_action',org,ret2['id'],'receive',{'quantity':2,'destination':'SELLABLE','destination_location_id':quarantine},user=picker,fail='para estoque')
 rpc('sales_return_action',org,ret2['id'],'receive',{'quantity':2,'destination':'QUARANTINE','destination_location_id':quarantine},user=picker)
 assert balance(variants['SAP-001']['v'],warehouse)==86.0
 # Os 2 aviados ficamfisicos na quarentena, nunca no estoque vendivel.
 assert float(sql(f"SELECT inventory_get_balance({q(org)},{q(variants['SAP-001']['v'])},{q(quarantine)})",a))==2.0
 assert float(raw('sales_available',','.join(map(q,[org,variants['SAP-001']['v'],quarantine])),a))==0.0
 print('PASS P: danificado so pode ir para quarentena; saldo em quarentena nao e vendavel')

 # ------------------------------------------- titulo financeiro unico
 assert sql(f"SELECT count(*) FROM account_receivables WHERE source_type='SALE' AND source_id={q(order['id'])}")=='1'
 sql("UPDATE account_receivables SET source_type='SALE'")
 call('sales_create_receivables',org,order['id'],'ON_DISPATCH',user=fin,fail='permission denied')
 assert sql(f"SELECT count(*) FROM account_receivables WHERE source_type='SALE' AND source_id={q(order['id'])}")=='1'
 # Titulo proporcional ao que saiu: 19 de 20 unidades aprovadas de 500,00.
 assert sql(f"SELECT open_amount FROM account_receivables WHERE source_id={q(order['id'])} LIMIT 1")=='475.00'
 print('PASS Q: gatilho ON_DISPATCH gera UM titulo por pedido, proporcional ao expedido; repetir nao duplica')

 # ------------------------------------------ proposta -> conversao unica
 contact=crm('contact',{'company_id':company,'name':'Contato Alfa','email':'alfa@test'})['id']
 valid=(today+datetime.timedelta(days=30)).isoformat()
 quote=crmact('quote',None,'create',{'company_id':company,'price_table_id':table,'primary_contact_id':contact,
   'valid_until':valid,'items':[{'variant_id':variants['SAP-001']['v'],'quantity':8,'unit_price':22.00}]})['id']
 crmact('quote',quote,'submit');crmact('quote',quote,'approve',{'reason':'Comercial'})
 # Com desconto, a alcada do aprovador volta a valer.
 discounted=crmact('quote',None,'create',{'company_id':company,'price_table_id':table,'primary_contact_id':contact,
   'valid_until':valid,'discount_percent':10,'items':[{'variant_id':variants['SAP-001']['v'],'quantity':1}]})['id']
 crmact('quote',discounted,'submit')
 crmact('quote',discounted,'approve',{'reason':'Sem alcada'},fail='alçada')
 crmact('quote',quote,'send');crmact('quote',quote,'accept',{'contact_id':contact,'evidence':'Aceite'})
 key=uid()
 with ThreadPoolExecutor(2) as pool:
  converted=list(pool.map(lambda _:rpc('sales_convert_quote',org,quote,{},key,user=commercial),range(2)))
 assert converted[0]['id']==converted[1]['id'], converted
 assert sql(f"SELECT count(*) FROM sales_orders WHERE sales_quote_id={q(quote)}")=='1'
 assert float(sql(f"SELECT unit_price FROM sales_order_items WHERE sales_order_id={q(converted[0]['id'])}"))==25.00
 again=rpc('sales_convert_quote',org,quote,{},uid(),user=commercial)
 assert again['deduped'] is True and again['id']==converted[0]['id']
 assert sql("SELECT count(*) FROM inventory_movements WHERE movement_type='SALE'")=='2'
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
 assert balance(variants['SAP-001']['v'],warehouse)==86.0
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
 # O pedido principal ficou com saldo (19 de 20): so a expedicao direta e FULFILLED.
 assert dash['open_exceptions']>=1 and dash['by_status'].get('FULFILLED')==1, dash
 assert 'DISPONÍVEL = SALDO FÍSICO - RESERVAS ATIVAS' in dash['definitions']['available_formula']
 activity=rpc('sales_company_activity',org,company,user=fin)
 assert len(activity['orders'])==7 and activity['totals']['orders']==5
 assert len(activity['shipments'])==2 and len(activity['returns'])==2
 full=detail(order['id'])
 assert len(full['items'])==1 and len(full['shipments'])==1 and len(full['returns'])==2
 assert len(full['movements'])==3 and len(full['receivables'])==1
 assert full['availability']['required_quantity']==20
 print('PASS U: painel e Customer 360 leem dos dados oficiais e declaram as formulas')

 # ------------------------------------------------------------- isolamento
 call('sales_query',org,'orders',{},user=outsider,fail='Sem permiss')
 assert sql(f"SELECT count(*) FROM sales_orders WHERE organization_id={q(org)}",outsider)=='0'
 assert sql(f"SELECT count(*) FROM sales_orders WHERE organization_id={q(org)}",fin)=='7'
 sql(f"UPDATE sales_orders SET status='CANCELED' WHERE id={q(order['id'])}",fin,fail='permission denied')
 sql(f"DELETE FROM sales_orders WHERE id={q(order['id'])}",approver,fail='permission denied')
 print('PASS V: isolamento por organizacao; escrita direta bloqueada; rascunho terminal e imutavel')

 # Cliente de outra organizacao nunca enxerga o pedido.
 assert sql(f"SELECT count(*) FROM companies WHERE id={q(company)}",outsider)=='0'
 print('PASS W: empresa do cliente tambem fica presa a organizacao')

 # Segurança em acesso direto: helper, coluna sensível e ID de outro tenant.
 for helper,args in [('sales_next_number',[org,'order']),('sales_settings',[org]),('sales_credit_check',[org,company,100,None]),('sales_emit',[org,'FAKE','FAKE',{}])]:
  call(helper,*args,user=commercial,fail='permission denied')
 call('sales_order_detail',org,order['id'],user=outsider,fail='Sem permiss')
 call('sales_available',org,variants['SAP-001']['v'],warehouse,user=outsider,fail='Sem permiss')
 sql(f"SELECT credit_check_result FROM sales_orders WHERE id={q(order['id'])}",commercial,fail='permission denied')
 assert detail(order['id'],user=picker)['financial_position'] is None
 assert detail(order['id'],user=picker)['receivables']==[]
 print('PASS X: direct RPC, tenant IDs, internal helpers and financial columns protected')

 # UI usa gateway transacional: duplo clique cria exatamente um pedido.
 payload={'company_id':company,'price_table_id':table,'shipping_address_id':address,'payment_terms_snapshot':'15/30','items':[{'variant_id':variants['SAP-002']['v'],'quantity':2}]}
 key=uid()
 with ThreadPoolExecutor(2) as pool:
  created=list(pool.map(lambda _:rpc('sales_execute',org,'save',None,'',payload,key,user=commercial),range(2)))
 assert created[0]['id']==created[1]['id']
 call('sales_execute',org,'save',None,'',{**payload,'commercial_notes':'Outro conteúdo'},key,user=commercial,fail='outro conteúdo')
 assert sql(f"SELECT payment_terms_snapshot FROM sales_orders WHERE id={q(created[0]['id'])}")=='15/30'
 assert query('settings')['receivable_trigger']=='ON_DISPATCH'
 assert len(query('addresses',{'company_id':company})['rows'])==1
 assert any(x['id']==warehouse for x in query('locations')['rows'])
 print('PASS Y: UI creation gateway idempotency, explicit terms and real lookup contracts')

 # Pedido com duas variantes diferentes, expedições parciais, obrigação monetária proporcional.
 multi=save({'company_id':company,'price_table_id':table,'shipping_address_id':address,'payment_terms_snapshot':'30','items':[
  {'variant_id':variants['SAP-001']['v'],'quantity':4}, {'variant_id':variants['SAP-002']['v'],'quantity':6}], 'freight_amount':10})
 action(multi['id'],'submit',user=commercial);action(multi['id'],'approve',user=approver)
 lines=detail(multi['id'])['items'];one=next(x for x in lines if x['product_variant_id']==variants['SAP-001']['v']);two=next(x for x in lines if x['product_variant_id']==variants['SAP-002']['v'])
 stock_before=balance(variants['SAP-001']['v'],warehouse)
 for quantities in [(1,2),(3,4)]:
  sh=rpc('sales_shipment_create',org,multi['id'],{'source_location_id':warehouse,'items':[{'sales_order_item_id':one['id'],'quantity':quantities[0]},{'sales_order_item_id':two['id'],'quantity':quantities[1]}]},user=picker)
  rpc('sales_shipment_dispatch',org,sh['id'],{},user=picker)
  rpc('sales_shipment_dispatch',org,sh['id'],{},user=picker)
 assert sql(f"SELECT fulfilled_quantity FROM sales_order_items WHERE id={q(one['id'])}")=='4.000'
 assert sql(f"SELECT fulfilled_quantity FROM sales_order_items WHERE id={q(two['id'])}")=='6.000'
 assert sql(f"SELECT status FROM sales_orders WHERE id={q(multi['id'])}")=='FULFILLED'
 assert float(sql(f"SELECT sum(original_amount) FROM account_receivables WHERE source_type='SALE' AND source_id={q(multi['id'])}"))==173
 assert balance(variants['SAP-001']['v'],warehouse)==stock_before-4
 assert sql(f"SELECT count(*) FROM sales_demands WHERE sales_order_id={q(multi['id'])} AND status='CLOSED'")=='2'
 print('PASS Z: multi-SKU partial dispatch, historical lines, incremental receivables including freight and demand synchronization')

 # Crédito inclui valor avaliado, exclui rascunhos e não duplica valor já faturado.
 crm('credit',{'company_id':company,'credit_limit':1,'block_over_limit':True,'reason':'Teste de limite'})
 blocked=save(payload);action(blocked['id'],'submit',user=commercial)
 action(blocked['id'],'approve',user=approver,fail='Crédito insuficiente')
 crm('credit',{'id':sql(f"SELECT id FROM customer_credit_policies WHERE company_id={q(company)}"),'company_id':company,'credit_limit':100000,'block_over_limit':False,'reason':'Encerrar cenário'})
 print('PASS AA: credit policy enforced with evaluated amount at approval')

 # Corrida: ambas pretendem reservar todo o mesmo estoque; soma <= disponível.
 before_available=float(raw('sales_available',','.join(map(q,[org,variants['SAP-002']['v'],warehouse])),a))
 concurrent=[]
 for n in range(2):
  ro=save({**payload,'items':[{'variant_id':variants['SAP-002']['v'],'quantity':before_available}]})
  action(ro['id'],'submit',user=commercial);action(ro['id'],'approve',user=approver);concurrent.append(ro['id'])
 with ThreadPoolExecutor(2) as pool:
  reserved=list(pool.map(lambda oid:rpc('sales_reserve',org,oid,{},user=picker),concurrent))
 assert sum(x['reserved_total'] for x in reserved)==before_available
 assert float(raw('sales_available',','.join(map(q,[org,variants['SAP-002']['v'],warehouse])),a))==0
 noreserve=next(oid for oid,x in zip(concurrent,reserved) if x['reserved_total']==0)
 line=detail(noreserve)['items'][0]
 ship=rpc('sales_shipment_create',org,noreserve,{'source_location_id':warehouse,'items':[{'sales_order_item_id':line['id'],'quantity':1}]},user=picker)
 movements_before=sql('SELECT count(*) FROM inventory_movements')
 rpc('sales_shipment_dispatch',org,ship['id'],{},user=picker,fail='insuficiente')
 assert sql('SELECT count(*) FROM inventory_movements')==movements_before
 print('PASS AB: concurrent reservations and dispatch cannot consume stock reserved by another order; atomic rejection')

 # Recebimento de devolução repetido e limite acumulado.
 movements_before=sql('SELECT count(*) FROM inventory_movements')
 assert rpc('sales_return_action',org,ret['id'],'receive',{'quantity':5,'destination':'SELLABLE'},user=picker)['deduped']
 assert sql('SELECT count(*) FROM inventory_movements')==movements_before
 rpc('sales_return_create',org,order['id'],{'reason':'Excesso','shipment_id':shipment['id'],'items':[{'sales_order_item_id':sql(f"SELECT id FROM sales_order_items WHERE sales_order_id={q(order['id'])}"),'quantity':13}]},user=a,fail='Quantidade inválida')
 print('PASS AC: return receive replay and accumulated return ceiling')

 # ------------------------------------------- gateway exercitado pela tela
 # Cada botao da interface chama sales_execute. Este grupo percorre o ciclo
 # completo apenas pelo gateway, com o papel que a interface usaria, para que
 # nenhum botao exista sem caminho funcional no servidor.
 cycle=execute('save',None,'',{'company_id':company,'price_table_id':table,'shipping_address_id':address,
   'payment_terms_snapshot':'30','items':[{'variant_id':variants['SAP-001']['v'],'quantity':4}]},user=commercial)
 cycle_id=cycle['id']
 execute('order',cycle_id,'submit',{'reason':'Enviado pela tela'},user=commercial)
 execute('order',cycle_id,'approve',{'reason':'Alcada do gestor'},user=approver)
 execute('reserve',cycle_id,'',{'source_location_id':warehouse},user=commercial)
 reservation=next(x for x in query('reservations',{'status':'ACTIVE'})['rows'] if x['sales_order_id']==cycle_id)
 fulfillment=execute('fulfillment_create',cycle_id,'',{'source_location_id':warehouse,
  'items':[{'sales_order_item_id':x['id'],'quantity':x['approved_quantity']-x['fulfilled_quantity']}
   for x in detail(cycle_id)['items']]},user=picker)
 state=detail(cycle_id);order_state=state['fulfillments'][0]
 task=next(t for t in state['picking_tasks'] if t['fulfillment_order_id']==order_state['id'])
 execute('fulfillment',order_state['id'],'start',{},user=picker)
 scanned=execute('scan',task['id'],'',{'code':'SAP-001','quantity':4},user=picker)
 execute('fulfillment',order_state['id'],'pick',{},user=picker)
 picked=next(p for p in detail(cycle_id)['picking_items'] if p['picking_task_id']==task['id'])
 execute('confirm',task['id'],'',{'items':[{'picking_task_item_id':picked['id'],'confirmed_quantity':4}]},user=picker)
 execute('fulfillment',order_state['id'],'pack',{},user=picker)
 execute('pack',order_state['id'],'',{'items':[{'picking_task_item_id':picked['id'],'quantity':4}],
  'gross_weight_kg':12.5,'length_cm':40,'width_cm':30,'height_cm':20},user=picker)
 execute('fulfillment',order_state['id'],'ready',{},user=picker)
 created=execute('shipment_create',cycle_id,'',{'fulfillment_order_id':order_state['id'],
   'source_location_id':warehouse,'tracking_code':'BR123','expected_delivery_at':'2026-12-01T12:00:00Z'},user=commercial)
 execute('dispatch',created['id'],'',{},user=picker)
 execute('shipment',created['id'],'track',{'tracking_code':'BR123','tracking_source':'MANUAL'},user=picker)
 execute('shipment',created['id'],'proof',{'proof_type':'SIGNATURE','signature_name':'Recepcionista'},user=commercial)
 execute('shipment',created['id'],'deliver',{},user=commercial)
 cycle_items=detail(cycle_id)['items']
 delivery=execute('return_create',cycle_id,'',{'shipment_id':created['id'],'reason':'Excesso',
   'items':[{'sales_order_item_id':cycle_items[0]['id'],'quantity':1}]},user=commercial)
 execute('return',delivery['id'],'submit',{},user=commercial)
 execute('return',delivery['id'],'approve',{'reason':'Conferido'},user=fin)
 return_items=next(r for r in detail(cycle_id)['return_items'] if r['customer_return_id']==delivery['id'])
 execute('return',delivery['id'],'receive',{'destination_location_id':quarantine,'destination':'QUARANTINE',
   'items':[{'customer_return_item_id':return_items['id'],'quantity':1}]},user=picker)
 execute('return',delivery['id'],'complete',{'reason':'Encerrada'},user=commercial)
 execute('reservation',reservation['id'],'release',{'reason':'Expedicao concluida'},user=picker)
 execute('order',cycle_id,'close',{'reason':'Pedido encerrado'},user=approver)
 assert sql(f"SELECT status FROM sales_orders WHERE id={q(cycle_id)}")=='CLOSED'
 assert sql(f"SELECT status FROM customer_returns WHERE id={q(delivery['id'])}")=='COMPLETED'
 assert float(sql(f"SELECT count(*)::numeric FROM packing_records WHERE sales_order_id={q(cycle_id)}"))==1
 assert sql(f"SELECT gross_weight_kg FROM packing_records WHERE sales_order_id={q(cycle_id)}")=='12.500'
 print('PASS AD: every button of the sales screen has a working gateway path')

 # Politicas: tela altera cada uma e o servidor valida e persiste.
 policies={'reservation_policy':'ALLOW_PARTIAL','reservation_expiry_hours':'48','make_to_order_enabled':'true',
  'credit_exposure_policy':'OPEN_RECEIVABLES_PLUS_OPEN_ORDERS','approval_segregation':'true','max_discount_percent':'7.5',
  'price_override_policy':'ALLOW_WITH_AUTHORIZATION','receivable_trigger':'ON_DISPATCH',
  'allow_partial_fulfillment':'true','shipment_requires_full_confirmation':'false','tracking_mode':'MANUAL',
  'require_shipping_address':'true'}
 saved=execute('settings',None,'',policies,user=a)
 for key,value in policies.items():
  expected='true' if value=='true' else 'false' if value=='false' else value
  actual=saved[key]
  assert str(actual).lower().replace('.00','')==str(expected).lower().replace('.00','') or float(actual)==float(expected), (key,actual,expected)
 call('sales_execute',org,'settings',None,'',{**policies,'receivable_trigger':'INVALID'},uid(),user=a,fail='financeiro inválido')
 call('sales_execute',org,'settings',None,'',{**policies,'max_discount_percent':'150'},uid(),user=a,fail='entre 0 e 100')
 call('sales_execute',org,'settings',None,'',{**policies,'reservation_expiry_hours':'0'},uid(),user=a,fail='entre 1 e 8760')
 call('sales_execute',org,'settings',None,'',{**policies,'approval_segregation':'sim'},uid(),user=a,fail='booleano inválido')
 assert query('settings')['reservation_policy']=='ALLOW_PARTIAL'
 print('PASS AE: all twelve policies are editable from the screen and validated by the server')

 # Transportadora e ocorrencia tambem passam pelo gateway da tela.
 carrier=execute('carrier',None,'',{'name':'Transportes Rapidos','document_number':'12345678000199',
  'document_type':'CNPJ','contact_name':'Central'},user=commercial)
 assert carrier['modality']=='COURIER'
 assert any(x['id']==carrier['id'] for x in query('carriers')['rows'])
 updated=execute('carrier',carrier['id'],'',{'name':'Transportes Rapidos','modality':'ROAD'},user=commercial)
 assert updated['modality']=='ROAD' and updated['document_type']=='CNPJ'
 call('sales_execute',org,'carrier',None,'',{'name':'Invalida','document_type':'CNPJ','document_number':'123'},uid(),user=commercial,fail='CNPJ inválido')
 call('sales_execute',org,'carrier',None,'',{'name':'Modalidade','modality':'TELETRANSPORTE'},uid(),user=commercial,fail='Modalidade de transporte inválida')
 call('sales_execute',org,'carrier',None,'',{'name':'   '},uid(),user=commercial,fail='Informe o nome')
 call('sales_execute',org,'carrier',None,'',{'name':'Negado'},uid(),user=picker,fail='Sem permiss')
 pending=next((x for x in query('exceptions')['rows'] if x['status']=='OPEN'),None)
 if pending:
  execute('exception',pending['id'],'resolve',{'resolution':'Conferido com o transportador'},user=picker)
  assert sql(f"SELECT status FROM logistics_exceptions WHERE id={q(pending['id'])}")=='RESOLVED'
 execute('expire',None,'',{},user=picker)
 print('PASS AF: carrier, exception resolution and reservation expiry work from the screen gateway')


if __name__=='__main__':
 try:run()
 finally:db.cleanup()
