#!/usr/bin/env python3
"""Fiscal workflow integration tests; isolated PostgreSQL only."""
import importlib.util, json
from pathlib import Path
spec=importlib.util.spec_from_file_location('fiscal',Path(__file__).with_name('test-fiscal-db.py'))
f=importlib.util.module_from_spec(spec);spec.loader.exec_module(f)
db=f.db;sql=db.sql;q=db.q

def run():
 f.run()
 for name in ['20261014100000_fiscal_integrity.sql','20261014200000_fiscal_documents.sql','20261014300000_fiscal_inbound.sql','20261014400000_fiscal_workspace.sql']:
  sql((db.ROOT/'supabase/migrations'/name).read_text())
 print('WORKFLOW MIGRATIONS OK')
 org=sql('SELECT id FROM organizations LIMIT 1');admin=sql("SELECT id FROM auth.users WHERE email='adm@test'")
 reviewer=sql("SELECT id FROM auth.users WHERE email='apr@test'");outsider=sql("SELECT id FROM auth.users WHERE email='out@test'")
 est=sql('SELECT id FROM fiscal_establishments LIMIT 1'); company=sql('SELECT id FROM companies LIMIT 1')
 variant=sql("SELECT id FROM product_variants WHERE sku='BAL-34-ROSA'")
 op=sql("SELECT id FROM fiscal_operation_types WHERE kind='DIRECT_SALE'")
 def call(name,args,user=admin,fail=None):
  r=db.call(name,','.join(q(json.dumps(a)) if isinstance(a,(dict,list)) else ('NULL' if a is None else q(a)) for a in args),user,fail)
  return json.loads(r) if r and not fail else r
 def execute(operation,data,id=None,user=admin,fail=None): return call('fiscal_execute',[org,operation,id,data],user,fail)
 # Legacy data passes after the additive repair; the new lifecycle cannot skip review.
 rule=execute('rule',{'operation_type_id':op,'document_model':'NFe','version':9,'taxes':[]})['rule']['id']
 execute('rule_action',{'action':'approve','reason':'Teste'},rule,reviewer,'não pode ser aprovada')
 execute('rule_action',{'action':'submit','reason':'Revisão'},rule)
 execute('rule_action',{'action':'approve','reason':'Teste'},rule,reviewer)
 execute('rule_action',{'action':'activate','reason':'Teste'},rule,reviewer,'regressão')
 print('PASS W1: revisão obrigatória e ativação exige evidência de regressão')
 layout=execute('layout',{'document_model':'NFe','version':'TEST-1','source_reference':'Fixture interna, não homologação oficial',
 'valid_from':'2020-01-01','implanted_at':'2020-01-01','required_fields':['establishment.tax_registration','recipient.tax_registration'],
 'homologation_notes':'Fixture validada apenas no teste','status':'ACTIVE'})['id']
 nature=execute('nature',{'operation_type_id':op,'cfop_code':'TEST','fiscal_nature':'Teste','version':1})['id']
 for action in ['submit','approve','activate']: execute('nature_action',{'action':action,'reason':'Teste'},nature,reviewer if action!='submit' else admin)
 cp=execute('company',{'company_id':company,'tax_registration':'TEST'})['id']
 execute('profile_action',{'table':'company_fiscal_profiles','action':'approve','reason':'Teste'},cp,reviewer)
 execute('company',{'tax_registration':'EDIT'},cp,admin,'imutável')
 # Operational fixture: 100 ordered, exactly 60 officially dispatched.
 order,oi,shipment,si,loc=[db.uid() for _ in range(5)]
 sql(f"INSERT INTO inventory_locations(id,organization_id,code,name,type) VALUES({q(loc)},{q(org)},'WF','WF','FACTORY');")
 sql(f"INSERT INTO sales_orders(id,organization_id,company_id,order_number,status) VALUES({q(order)},{q(org)},{q(company)},'WF100','APPROVED');")
 sql(f"INSERT INTO sales_order_items(id,organization_id,sales_order_id,product_variant_id,sku_snapshot,description_snapshot,ordered_quantity,approved_quantity,unit_price,line_total) VALUES({q(oi)},{q(org)},{q(order)},{q(variant)},'WF','Fixture',100,100,10,1000);")
 sql(f"INSERT INTO shipments(id,organization_id,sales_order_id,shipment_number,source_location_id,status,dispatched_at) VALUES({q(shipment)},{q(org)},{q(order)},'WF60',{q(loc)},'DISPATCHED',now());")
 sql(f"INSERT INTO shipment_items(id,organization_id,shipment_id,sales_order_item_id,variant_id,sku_snapshot,description_snapshot,quantity) VALUES({q(si)},{q(org)},{q(shipment)},{q(oi)},{q(variant)},'WF','Fixture',60);")
 counts=sql('SELECT (SELECT count(*) FROM inventory_movements)||\',\'||(SELECT count(*) FROM account_receivables)||\',\'||(SELECT count(*) FROM account_payables)')
 data={'source_type':'SHIPMENT','source_id':shipment,'establishment_id':est,'operation_type_id':op,'layout_version_id':layout,'nature_id':nature}
 doc=execute('prepare',data);assert doc['status']=='DRAFT';assert execute('prepare',data)['id']==doc['id']
 assert sql(f"SELECT quantity FROM fiscal_document_items WHERE document_id={q(doc['id'])}")=='60.000000'
 assert execute('document_action',{'action':'validate'},doc['id'])['status']=='VALIDATED'
 assert execute('document_action',{'action':'approve','reason':'Conferido'},doc['id'])['status']=='READY_TO_SEND'
 result=execute('document_action',{'action':'submit'},doc['id']);assert result['blocked'] and result['status']=='READY_TO_SEND'
 execute('document_action',{'action':'submit'},doc['id'],outsider,'Sem permissão')
 assert sql(f"SELECT count(*) FROM fiscal_documents WHERE organization_id={q(org)}",outsider)=='0'
 assert counts==sql('SELECT (SELECT count(*) FROM inventory_movements)||\',\'||(SELECT count(*) FROM account_receivables)||\',\'||(SELECT count(*) FROM account_payables)')
 assert sql(f"SELECT count(*) FROM tax_calculation_snapshots WHERE document_id={q(doc['id'])}")=='3'
 print('PASS W2: 100/60, origem deduplicada, snapshot, conferência, transmissão bloqueada, RLS, nenhum efeito físico/financeiro')
 result=execute('reconcile',{},doc['id']);assert result['status']=='PENDING'
 assert any(i['type']=='COMMERCIAL_BALANCE' and i['ordered_quantity']==100 and i['covered_quantity']==60 for i in result['findings'])
 for kind in ['dashboard','documents','inbound','events','exceptions','reconciliations','establishments','regimes','operations','natures','products','companies','taxes','layouts','rules','reviews','providers','simulations']:
  call('fiscal_query',[org,kind,{}])
 print('PASS W3: saldo comercial 40 preservado; consultas e dashboard executáveis')
 call('fiscal_import_xml',[org,est,db.uid(),'<!DOCTYPE x><x/>'],fail='DTD')
 call('fiscal_import_xml',[org,est,db.uid(),'<x/>'],fail='Somente')
 sql(f"UPDATE fiscal_documents SET status='AUTHORIZED' WHERE id={q(doc['id'])}",admin,'permission denied')
 assert sql(f"SELECT fiscal_storage_allowed({q(org+'/unknown.xml')},false)",outsider)=='f'
 print('PASS W4: XML arbitrário, DTD, autorização forjada e acesso a arquivo recusados')

 # Accepted XML remains UNVERIFIED. Supplier and recipient must belong to the selected operation.
 supplier,po,poi,receipt,ri,pay=[db.uid() for _ in range(6)]
 sql(f"UPDATE companies SET document_number='12345678000195' WHERE id={q(company)};")
 sql(f"INSERT INTO supplier_profiles(id,organization_id,company_id,supplier_code) VALUES({q(supplier)},{q(org)},{q(company)},'WF-SUP');")
 sql(f"INSERT INTO purchase_orders(id,organization_id,supplier_id,order_number) VALUES({q(po)},{q(org)},{q(supplier)},'WF-PO');")
 sql(f"INSERT INTO purchase_order_items(id,organization_id,purchase_order_id,variant_id,ordered_quantity,unit_price,line_total) VALUES({q(poi)},{q(org)},{q(po)},{q(variant)},60,10,600);")
 sql(f"INSERT INTO goods_receipts(id,organization_id,purchase_order_id,supplier_id,receipt_number,status) VALUES({q(receipt)},{q(org)},{q(po)},{q(supplier)},'WF-GR','POSTED');")
 sql(f"INSERT INTO goods_receipt_items(id,organization_id,goods_receipt_id,purchase_order_item_id,variant_id,received_quantity,accepted_quantity,unit_cost,line_total) VALUES({q(ri)},{q(org)},{q(receipt)},{q(poi)},{q(variant)},60,60,10,600);")
 sql(f"INSERT INTO account_payables(id,organization_id,company_id,source_type,source_id,document_number,description,issue_date,due_date,original_amount) VALUES({q(pay)},{q(org)},{q(company)},'GOODS_RECEIPT',{q(receipt)},'WF-AP','Fixture',current_date,current_date,600);")
 prefix='3526091234567800019555001000000001100000000'
 assert len(prefix)==43
 acc=sum(int(c)*(2+i%8) for i,c in enumerate(reversed(prefix)));dv=11-acc%11;key=prefix+str(0 if dv>=10 else dv)
 xml=f'''<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00"><NFe><infNFe Id="NFe{key}" versao="4.00"><ide><mod>55</mod><tpAmb>2</tpAmb><dhEmi>2026-09-29T12:00:00Z</dhEmi></ide><emit><CNPJ>12345678000195</CNPJ></emit><dest><CNPJ>00000000000191</CNPJ></dest><det nItem="1"><prod><cProd>FIXTURE</cProd><xProd>Teste</xProd><qCom>60</qCom><vUnCom>10</vUnCom><vProd>600</vProd><uCom>PAR</uCom><NCM>00000000</NCM></prod><imposto/></det><total><ICMSTot><vNF>600</vNF><vFrete>0</vFrete></ICMSTot></total></infNFe></NFe><protNFe><infProt><chNFe>{key}</chNFe><cStat>100</cStat><nProt>FIXTURE</nProt></infProt></protNFe></nfeProc>'''
 inbound=call('fiscal_import_xml',[org,est,supplier,xml]);assert inbound['authenticity_status']=='UNVERIFIED'
 assert call('fiscal_import_xml',[org,est,supplier,xml])['id']==inbound['id']
 call('fiscal_import_xml',[org,est,supplier,xml.replace('<vNF>600','<vNF>601')],fail='XML diferente')
 path=inbound['xml_storage_path']
 sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('fiscal-private',{q(path)})",admin)
 assert sql(f"SELECT count(*) FROM storage.objects WHERE name={q(path)}",outsider)=='0'
 sql(f"INSERT INTO storage.objects(bucket_id,name) VALUES('fiscal-private',{q(path)})",outsider,'row-level security')
 before=sql('SELECT (SELECT count(*) FROM inventory_movements)||chr(44)||(SELECT count(*) FROM account_payables)')
 result=execute('reconcile',{'inbound':True,'goods_receipt_id':receipt,'account_payable_id':pay,'item_mapping':{'1':{'receipt_item_id':ri}}},inbound['id'])
 assert result['status']=='PENDING' and all(i['type']!='QUANTITY_OR_PRICE_MISMATCH' for i in result['findings'])
 assert before==sql('SELECT (SELECT count(*) FROM inventory_movements)||chr(44)||(SELECT count(*) FROM account_payables)')
 print('PASS W5: XML estruturado, duplicidade por chave/hash, Storage entre organizações negado, vínculo com recebimento/título sem duplicação')
 for kind in ['company_options','variant_options','address_options','supplier_options','shipment_options','receipt_options']:
  call('fiscal_query',[org,kind,{}])
 exception=sql("SELECT id FROM fiscal_exceptions LIMIT 1")
 execute('exception',{'status':'IN_REVIEW','reason':'Atribuição','responsible_id':admin},exception)
 print('PASS W6: seletores de cadastro e atribuição auditada de exceções')

 from datetime import date,timedelta
 today=date.today();start=today-timedelta(days=10);end=today+timedelta(days=10)
 remop=execute('operation',{'kind':'PARTNER_REMITTANCE','code':'WF-REM','label':'Remessa teste'})['id']
 tax=sql("SELECT id FROM fiscal_taxes WHERE code='ICMS'")
 rr=execute('rule',{'operation_type_id':remop,'document_model':'NFe','valid_from':str(start),'valid_to':str(end),
  'taxes':[{'tax_id':tax,'rate':0.1,'treatment_code':'TEST'}]})['rule']['id']
 execute('rule_action',{'action':'submit','reason':'Teste de fronteiras'},rr)
 cases=[{'on_date':str(start-timedelta(days=1)),'quantity':1,'unit_price':10,'expected_total':0,'expected_applicable':False},
 {'on_date':str(start),'quantity':1,'unit_price':10,'expected_total':1,'expected_applicable':True},
 {'on_date':str(end+timedelta(days=1)),'quantity':1,'unit_price':10,'expected_total':0,'expected_applicable':False}]
 regression=execute('test_rule',{'cases':cases},rr);assert regression['passed']
 execute('rule_action',{'action':'approve','reason':'Teste aprovado'},rr,reviewer)
 execute('rule_action',{'action':'activate','reason':'Teste aprovado','regression_evidence':{'passed':True,'reference':'inventada'}},rr,reviewer,'regressão')
 execute('rule_action',{'action':'activate','reason':'Teste aprovado','regression_evidence':{'reference':regression['id']}},rr,reviewer)
 print('PASS W7: regressão calcula no servidor antes/durante/depois; referência inventada não ativa regra')
 nat=execute('nature',{'operation_type_id':remop,'cfop_code':'TEST','fiscal_nature':'Remessa teste'})['id']
 for action in ['submit','approve','activate']:execute('nature_action',{'action':action,'reason':'Teste'},nat,reviewer if action!='submit' else admin)
 partner,dest,transfer,rem,remitem=[db.uid() for _ in range(5)]
 sql(f"INSERT INTO partner_profiles(id,organization_id,company_id,partner_code) VALUES({q(partner)},{q(org)},{q(company)},'WF-PART');")
 sql(f"INSERT INTO inventory_locations(id,organization_id,code,name,type,partner_id) VALUES({q(dest)},{q(org)},'WF-PART','Parceiro','PARTNER',{q(partner)});")
 sql(f"INSERT INTO inventory_transfers(id,organization_id,source_location_id,destination_location_id) VALUES({q(transfer)},{q(org)},{q(loc)},{q(dest)});")
 sql(f"INSERT INTO partner_shipments(id,organization_id,shipment_number,partner_id,source_location_id,destination_location_id,status,transfer_id) VALUES({q(rem)},{q(org)},'WF-50',{q(partner)},{q(loc)},{q(dest)},'DRAFT',{q(transfer)});")
 sql(f"INSERT INTO partner_shipment_items(id,organization_id,shipment_id,variant_id,quantity) VALUES({q(remitem)},{q(org)},{q(rem)},{q(variant)},50);")
 sql(f"UPDATE partner_shipments SET status='SHIPPED' WHERE id={q(rem)};")
 before=sql('SELECT (SELECT count(*) FROM inventory_movements)||chr(44)||(SELECT count(*) FROM account_receivables)||chr(44)||(SELECT count(*) FROM sales_orders)')
 remdoc=execute('prepare',{'source_type':'PARTNER_SHIPMENT','source_id':rem,'establishment_id':est,'operation_type_id':remop,'layout_version_id':layout,'nature_id':nat,'remittance_prices':{remitem:10},'valuation_reason':'Valor fiscal aprovado na fixture'})
 assert remdoc['total_amount']==500
 assert before==sql('SELECT (SELECT count(*) FROM inventory_movements)||chr(44)||(SELECT count(*) FROM account_receivables)||chr(44)||(SELECT count(*) FROM sales_orders)')
 sql(f"UPDATE tax_calculation_snapshots SET rounded_amount=0 WHERE document_id={q(remdoc['id'])}",fail='imutável')
 print('PASS W8: remessa 50 não cria venda/recebível/baixa; snapshot imutável até para escrita privilegiada')
 import concurrent.futures
 def number(_):return sql(f"SELECT fiscal_allocate_number({q(org)},{q(est)},'HOMOLOGATION','NFe','TEST')")
 with concurrent.futures.ThreadPoolExecutor() as pool: numbers=list(pool.map(number,range(8)))
 assert len(set(numbers))==8
 assert sql(f"SELECT fiscal_allocate_number({q(org)},{q(est)},'PRODUCTION','NFe','TEST')")=='1'
 db.call('fiscal_allocate_number',','.join(map(q,[org,est,'HOMOLOGATION','NFe','TEST'])),admin,'permission denied')
 print('PASS W9: numeração concorrente única, ambientes separados, alocador privado')

 # Exercise each additional source resolver with real tenant-bound operational records.
 cr,cri,sr,sri,pr,pri,tr,tri=[db.uid() for _ in range(8)]
 sql(f"INSERT INTO customer_returns(id,organization_id,company_id,sales_order_id,shipment_id,return_number,reason) VALUES({q(cr)},{q(org)},{q(company)},{q(order)},{q(shipment)},'WF-CR','Teste');")
 sql(f"INSERT INTO customer_return_items(id,organization_id,customer_return_id,sales_order_item_id,shipment_item_id,variant_id,sku_snapshot,quantity,received_quantity) VALUES({q(cri)},{q(org)},{q(cr)},{q(oi)},{q(si)},{q(variant)},'WF',5,5);")
 sql(f"UPDATE customer_returns SET status='RECEIVED',received_at=now() WHERE id={q(cr)};")
 sql(f"INSERT INTO supplier_returns(id,organization_id,supplier_id,goods_receipt_id,return_number) VALUES({q(sr)},{q(org)},{q(supplier)},{q(receipt)},'WF-SR');")
 sql(f"INSERT INTO supplier_return_items(id,organization_id,supplier_return_id,variant_id,quantity) VALUES({q(sri)},{q(org)},{q(sr)},{q(variant)},5);")
 sql(f"UPDATE supplier_returns SET status='POSTED' WHERE id={q(sr)};")
 sql(f"INSERT INTO partner_returns(id,organization_id,partner_id,shipment_id,source_location_id,destination_location_id,return_number,transfer_id) VALUES({q(pr)},{q(org)},{q(partner)},{q(rem)},{q(dest)},{q(loc)},'WF-PR',{q(transfer)});")
 sql(f"INSERT INTO partner_return_items(id,organization_id,return_id,variant_id,quantity,condition,reason) VALUES({q(pri)},{q(org)},{q(pr)},{q(variant)},5,'SELLABLE','Teste');")
 sql(f"UPDATE partner_returns SET status='RECEIVED' WHERE id={q(pr)};")
 destest=execute('establishment',{'legal_name':'Destino fiscal','company_id':company})['id']
 execute('location_establishment',{'establishment_id':est},loc);execute('location_establishment',{'establishment_id':destest},dest)
 sql(f"INSERT INTO inventory_transfers(id,organization_id,source_location_id,destination_location_id) VALUES({q(tr)},{q(org)},{q(loc)},{q(dest)});")
 sql(f"INSERT INTO inventory_transfer_items(id,organization_id,transfer_id,variant_id,quantity) VALUES({q(tri)},{q(org)},{q(tr)},{q(variant)},5);")
 sql(f"UPDATE inventory_transfers SET status='COMPLETED' WHERE id={q(tr)};")
 for typ,origin,item in [('CUSTOMER_RETURN',cr,cri),('SUPPLIER_RETURN',sr,sri),('PARTNER_RETURN',pr,pri),('INTERNAL_TRANSFER',tr,tri)]:
  oper=execute('operation',{'kind':typ,'code':typ,'label':typ})['id']
  rule2=execute('rule',{'operation_type_id':oper,'document_model':'NFe','valid_from':str(start),'valid_to':str(end),'taxes':[{'tax_id':tax,'rate':0.1,'treatment_code':'TEST'}]})['rule']['id']
  execute('rule_action',{'action':'submit','reason':'Teste'},rule2)
  rg=execute('test_rule',{'cases':cases},rule2)
  execute('rule_action',{'action':'approve','reason':'Teste'},rule2,reviewer)
  execute('rule_action',{'action':'activate','reason':'Teste','regression_evidence':{'reference':rg['id']}},rule2,reviewer)
  nt=execute('nature',{'operation_type_id':oper,'cfop_code':'TEST','fiscal_nature':'Teste'})['id']
  for a in ['submit','approve','activate']:execute('nature_action',{'action':a,'reason':'Teste'},nt,reviewer if a!='submit' else admin)
  out=execute('prepare',{'source_type':typ,'source_id':origin,'establishment_id':est,'operation_type_id':oper,'layout_version_id':layout,'nature_id':nt,'remittance_prices':{item:10},'valuation_reason':'Valor aprovado','original_document_id':doc['id']})
  assert out['total_amount']==50 and out['total_taxes']==5
  assert len(call('fiscal_query',[org,'source_options',{'source_type':typ}]))>0
 assert call('fiscal_query',[org,'inbound_context',{'receipt_id':receipt}])['receipt_items']
 print('PASS W10: devoluções de cliente/fornecedor/parceiro e transferência usam fatos e regras próprias')
 print('FISCAL WORKFLOW OK')

if __name__=='__main__':
 try: run()
 finally: db.cleanup()
