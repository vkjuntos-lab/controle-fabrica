#!/usr/bin/env python3
"""MASTER 008 acceptance tests in a disposable PostgreSQL cluster, no real organization data."""
import importlib.util
import json
import subprocess
from pathlib import Path
import concurrent.futures
spec=importlib.util.spec_from_file_location('inventory_db',Path(__file__).with_name('test-inventory-db.py'))
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
q,sql,uid=db.q,db.sql,db.uid

def run():
 db.setup()
 dir=Path(__file__).parent.parent/'supabase/migrations'
 db.sql((dir/'20260926100000_partner_reconciliation.sql').read_text())
 db.sql((dir/'20260928100000_finance.sql').read_text())
 a,b,reader,fz,org,other,company,profile=[uid() for _ in range(8)]
 sql(f"INSERT INTO auth.users(id,email) VALUES({q(a)},'a@fin.test'),({q(b)},'b@fin.test'),({q(reader)},'r@fin.test'),({q(fz)},'f@fin.test'); INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'A','a',{q(a)}),({q(other)},'B','b',{q(b)}); INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(reader)},'comercial'),({q(org)},{q(fz)},'financeiro');")
 sql(f"INSERT INTO companies(id,organization_id,code,legal_name) VALUES({q(company)},{q(org)},'R1','Parceiro R1'); INSERT INTO partner_profiles(id,organization_id,company_id,partner_code) VALUES({q(profile)},{q(org)},{q(company)},'P-R1');")
 def rpc(name,args,user=a,fail=None): return db.call(name,args,user,fail)
 def recv(extra='{}'): return json.loads(rpc('fin_query',q(org)+",'receivables',"+q(extra)))
 def acct_bal(acc):
  return float(next(x['balance'] for x in json.loads(rpc('fin_query',q(org)+",'accounts',"+q('{}')))['rows'] if x['id']==acc))

 # -- Catálogo financeiro -----------------------------------------------------
 cat_exp=rpc('fin_save_category',q(org)+','+q(json.dumps({'code':'FREV','name':'Receitas','type':'REVENUE'})))
 cat_cost=rpc('fin_save_category',q(org)+','+q(json.dumps({'code':'FCUST','name':'Custos','type':'EXPENSE'})))
 sub=rpc('fin_save_category',q(org)+','+q(json.dumps({'code':'ENRG','name':'Energia','type':'EXPENSE','parent_id':cat_cost})))
 rpc('fin_save_category',q(org)+','+q(json.dumps({'code':'ENRG','name':'Energia','type':'EXPENSE'})),fail='Categoria')
 cc=rpc('fin_save_cost_center',q(org)+','+q(json.dumps({'code':'CC-FAB','name':'Fábrica'})))
 acc1=rpc('fin_save_account',q(org)+','+q(json.dumps({'name':'Banco Beta','type':'BANK','bank_name':'Beta'})))
 acc2=rpc('fin_save_account',q(org)+','+q(json.dumps({'name':'Caixa','type':'CASH'})))
 pm=rpc('fin_save_payment_method',q(org)+','+q(json.dumps({'code':'PIX','name':'Pix'})))
 rpc('fin_save_settings',q(org)+','+q(json.dumps({'currency':'BRL','partner_receivable_due_days':7,'partner_receivable_installments':1})))
 cats=json.loads(rpc('fin_query',q(org)+",'categories',"+q('{}')))
 assert len(cats)==3 and any(c['code']=='ENRG' for c in cats)
 assert len(json.loads(rpc('fin_query',q(org)+",'cost_centers',"+q('{}'))))==1
 assert len(json.loads(rpc('fin_query',q(org)+",'accounts',"+q('{}')))['rows'])==2 and acct_bal(acc1)==0 and acct_bal(acc2)==0
 assert json.loads(rpc('fin_query',q(org)+",'settings',"+q('{}')))['partner_receivable_due_days']==7
 print('PASS: catálogo financeiro, contas, centros, formas, ajustes e configurações')

 # -- Contas a receber manuais, parcelas e mutações ---------------------------
 r1=json.loads(rpc('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':100,'installments':2,'description':'Venda a prazo','due_date':'2026-10-05','financial_category_id':cat_exp,'cost_center_id':cc}))))
 assert r1['total_installments']==2
 rows=recv()['rows']
 assert len(rows)==2
 par1=next(x for x in rows if x['installment_number']==1); par2=next(x for x in rows if x['installment_number']==2)
 assert par1['parent_id'] is None and par2['parent_id']==par1['id']
 assert par1['document_number'].startswith('REC-') and round(par1['open_amount'],2)==50 and round(par2['original_amount'],2)==50
 r1a,r1b=par1['id'],par2['id']
 rpc('fin_document_mutate',','.join(map(q,[org,'receivable',r1a,'discount',json.dumps({'amount':20,'reason':'Desconto comercial'})])))
 rpc('fin_document_mutate',','.join(map(q,[org,'receivable',r1a,'adjust',json.dumps({'type':'CREDIT','amount':10,'reason':'Crédito'})])))
 rpc('fin_document_mutate',','.join(map(q,[org,'receivable',r1a,'charges',json.dumps({'interest_amount':5,'penalty_amount':2,'reason':'Juros'})])))
 rpc('fin_document_mutate',','.join(map(q,[org,'receivable',r1a,'due_date',json.dumps({'due_date':'2026-10-08','reason':'Reprogramado'})])))
 assert round(next(x for x in recv()['rows'] if x['id']==r1a)['open_amount'],2)==47
 rpc('fin_document_mutate',','.join(map(q,[org,'receivable',r1a,'adjust',json.dumps({'type':'X','amount':1,'reason':'Tipo'})])),fail='Tipo de ajuste')
 # Data de vencimento já se aplicou; validar valor de origem imutável ainda nesta fase.
 rc=json.loads(rpc('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':200,'description':'Cancelável','due_date':'2026-10-10'}))))
 rpc('fin_document_mutate',','.join(map(q,[org,'receivable',rc['id'],'cancel',json.dumps({'reason':'Desistência'})])))
 rw=json.loads(rpc('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':150,'description':'Baixável','due_date':'2026-10-11'}))))
 rpc('fin_document_mutate',','.join(map(q,[org,'receivable',rw['id'],'write_off',json.dumps({'reason':'Cliente sem condições'})])))
 assert sql(f"SELECT status FROM account_receivables WHERE id={q(rc['id'])}")=='CANCELED'
 assert sql(f"SELECT status FROM account_receivables WHERE id={q(rw['id'])}")=='WRITTEN_OFF'
 print('PASS: parcelamento, desconto/ajuste/juros, cancelamento e baixa')

 # -- Liquidação: parcial, total, overpayment e idempotência ------------------
 r100=json.loads(rpc('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':100,'description':'Título 100','due_date':'2026-09-30'}))))
 rid=r100['id']
 s1=json.loads(rpc('fin_settle',','.join(map(q,[org,'receivable',rid,json.dumps({'account_id':acc1,'amount':30,'payment_method_id':pm})]))))
 assert s1['open_amount']==70 and sql(f"SELECT status FROM account_receivables WHERE id={q(rid)}")=='PARTIALLY_PAID'
 detail=json.loads(rpc('fin_query',q(org)+",'receivable',"+q(json.dumps({'id':rid}))))
 assert round(detail['received_amount'],2)==30 and len(detail['settlements'])==1
 rpc('fin_settle',','.join(map(q,[org,'receivable',rid,json.dumps({'account_id':acc1,'amount':70})])))
 assert sql(f"SELECT status FROM account_receivables WHERE id={q(rid)}")=='PAID'
 assert sql(f"SELECT open_amount FROM account_receivables WHERE id={q(rid)}")=='0'
 rpc('fin_settle',','.join(map(q,[org,'receivable',rid,json.dumps({'account_id':acc1,'amount':1})])),fail='acima do saldo')
 r50=json.loads(rpc('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':50,'description':'Título 50','due_date':'2026-10-02'}))))
 rpc('fin_settle',''+''.join([','.join(map(q,[org,'receivable',r50['id'],json.dumps({'account_id':acc1,'amount':50,'receipt_key':'K1'}))])]))
 rpc('fin_settle',''+''.join([','.join(map(q,[org,'receivable',r50['id'],json.dumps({'account_id':acc1,'amount':50,'receipt_key':'K1'}))])]),fail='já registrada')
 assert acct_bal(acc1)==150
 print('PASS: recebimento parcial/total, overpayment bloqueado e idempotência por chave')

 # -- Contas a pagar com desconto e juros -------------------------------------
 p1=json.loads(rpc('fin_create_payable',q(org)+','+q(json.dumps({'company_id':company,'amount':100,'description':'Energia ago','due_date':'2026-09-25','competence_date':'2026-09-01','financial_category_id':cat_cost,'cost_center_id':cc}))))
 rpc('fin_settle',''+''.join([','.join(map(q,[org,'payable',p1['id'],json.dumps({'account_id':acc1,'amount':80,'discount_amount':20})]))]))
 assert sql(f"SELECT status FROM account_payables WHERE id={q(p1['id'])}")=='PAID'
 paid=round(json.loads(rpc('fin_query',q(org)+",'payable',"+q(json.dumps({'id':p1['id']}))))['paid_amount'],2)
 assert paid==80
 assert acct_bal(acc1)==70
 print('PASS: pagamento com desconto e status do título atualizado')

 # -- Saldo inicial, transferência e ledger -----------------------------------
 rpc('fin_opening_balance',q(org)+','+q(json.dumps({'account_id':acc2,'amount':2000,'reason':'Caixa herdado'})))
 rpc('fin_opening_balance',q(org)+','+q(json.dumps({'account_id':acc2,'amount':5,'reason':'Duplicado'})),fail='já registrado')
 t=json.loads(rpc('fin_transfer',q(org)+','+q(json.dumps({'from_account_id':acc2,'to_account_id':acc1,'amount':500,'notes':'Reforço','transfer_key':'T-1'}))))
 rpc('fin_transfer',q(org)+','+q(json.dumps({'from_account_id':acc2,'to_account_id':acc1,'amount':500,'transfer_key':'T-1'})),fail='duplicada')
 rpc('fin_transfer',q(org)+','+q(json.dumps({'from_account_id':acc2,'to_account_id':acc2,'amount':10})),fail='diferentes')
 rpc('fin_transfer',q(org)+','+q(json.dumps({'from_account_id':acc1,'to_account_id':acc2,'amount':99999})),fail='Saldo insuficiente')
 assert acct_bal(acc1)==570 and acct_bal(acc2)==1500
 tr=json.loads(rpc('fin_query',q(org)+",'transactions',"+q('{}')))
 assert tr['total']==7
 print('PASS: saldo inicial único, transferência atômica e idempotência/saldos')

 # -- Movimento avulso (ledger oficial) ---------------------------------------
 d=json.loads(rpc('fin_direct_movement',q(org)+','+q(json.dumps({'account_id':acc1,'direction':'IN','amount':100,'description':'Receita avulsa','company_id':company,'financial_category_id':cat_exp}))))
 rpc('fin_direct_movement',q(org)+','+q(json.dumps({'account_id':acc1,'direction':'IN','amount':100,'description':'Receita avulsa','receipt_key':'D-1'})),fail='já registrada')
 assert acct_bal(acc1)==670
 print('PASS: movimento avulso no ledger com deduplicação')

 # -- Reversão: original preservado, compensação, reinício do saldo -----------
 r60=json.loads(rpc('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':60,'description':'Título a estornar','due_date':'2026-10-10'}))))
 st=json.loads(rpc('fin_settle',','.join(map(q,[org,'receivable',r60['id'],json.dumps({'account_id':acc1,'amount':60})]))))
 assert acct_bal(acc1)==730
 rev=json.loads(rpc('fin_reverse_transaction',q(org)+','+q(st['transaction_id'])+','+q('Cliente devolveu')))
 assert acct_bal(acc1)==670
 assert sql(f"SELECT status FROM account_receivables WHERE id={q(r60['id'])}")=='OPEN' and sql(f"SELECT open_amount FROM account_receivables WHERE id={q(r60['id'])}")=='60'
 assert sql(f"SELECT is_reversal FROM receivable_settlements WHERE financial_transaction_id={q(rev['reversal_id'])}")=='t'
 rpc('fin_reverse_transaction',q(org)+','+q(st['transaction_id'])+','+q('Repetido'),fail='já estornado')
 rpc('fin_reverse_transaction',q(org)+','+q(rev['reversal_id'])+','+q('Vira estorno'),fail='já é um estorno')
 assert round(float(sql(f"SELECT public.finance_document_open({q(org)},'receivable',{q(r60['id'])})")),2)==60
 print('PASS: reversão por compensação, original imutável, saldo reconstruído')

 # -- Evento PARTNER_RECONCILIATION_CLOSED -> conta a receber -------------------
 recon=uid(); recon2=uid()
 def feed_recon(rid,net,closed):
  sn={'totals':{'net_billable':net}}
  sql(f"INSERT INTO partner_reconciliations(id,organization_id,partner_id,period_start,period_end,status,closed_at,snapshot) VALUES({q(rid)},{q(org)},{q(profile)},'2026-09-01','2026-09-30','CLOSED',{q(closed)}::timestamptz,{q(json.dumps(sn))})")
 feed_recon(recon,120,'2026-09-20 10:00:00')
 pr1=json.loads(rpc('fin_process_reconciliation',q(org)+','+q(recon)))
 assert pr1['created']==1 and pr1['net_billable']==120
 assert json.loads(rpc('fin_process_reconciliation',q(org)+','+q(recon)))['already']
 assert sql(f"SELECT count(*) FROM account_receivables WHERE organization_id={q(org)} AND source_type='PARTNER_RECONCILIATION' AND source_id={q(recon)}")=='1'
 assert sql(f"SELECT due_date FROM account_receivables WHERE source_type='PARTNER_RECONCILIATION' AND source_id={q(recon)}")=='2026-09-27'
 rpc('fin_process_reconciliation',q(org)+','+q(recon),a)
 print('PASS: fechamento de parceiro gera recebível D+7 idempotente')
 recon2=uid()
 rpc('fin_save_settings',q(org)+','+q(json.dumps({'partner_receivable_installments':2})))
 feed_recon(recon2,120,'2026-09-21 10:00:00')
 pr2=json.loads(rpc('fin_process_reconciliation',q(org)+','+q(recon2)))
 assert pr2['created']==2 and pr2['installments']==2
 subs=[x for x in recv()['rows'] if x['source_id']==recon2]
 assert len(subs)==2 and {round(x['original_amount'],2) for x in subs}=={60.0}
 assert all(x['due_date']=='2026-09-28' for x in subs)
 rpc('fin_save_settings',q(org)+','+q(json.dumps({'partner_receivable_installments':1})))
 print('PASS: parcelamento configurável do fechamento (2 x 60, vencimento D+7)')
 # -- Reabertura da reconciliação sinaliza SOURCE_REOPENED ---------------------
 rpc('rec_reopen',q(org)+','+q(recon)+','+q('Ajuste pós-fechamento'))
 assert sql(f"SELECT source_status FROM account_receivables WHERE source_type='PARTNER_RECONCILIATION' AND source_id={q(recon)}")=='SOURCE_REOPENED'
 assert sql(f"SELECT status FROM account_receivables WHERE source_type='PARTNER_RECONCILIATION' AND source_id={q(recon)}")=='OPEN'
 print('PASS: reabertura marca SOURCE_REOPENED sem apagar o recebível')

 # -- Recorrência mensal idempotente -------------------------------------------
 rule=json.loads(rpc('fin_save_recurrence',q(org)+','+q(json.dumps({'name':'Aluguel','direction':'OUT','amount':500,'day_of_month':5,'start_date':'2026-10-01','end_date':'2026-12-31','financial_category_id':cat_cost,'cost_center_id':cc,'payment_method_id':pm}))))
 rpc('fin_save_recurrence',q(org)+','+q(json.dumps({'name':'Receita','direction':'IN','amount':100,'day_of_month':1,'start_date':'2026-10-01'})),fail='exige empresa')
 assert json.loads(rpc('fin_generate_recurrences',q(org)+','+q('2026-10')))['created']==1
 assert json.loads(rpc('fin_generate_recurrences',q(org)+','+q('2026-10')))['created']==0
 assert json.loads(rpc('fin_generate_recurrences',q(org)+','+q('2026-11')))['created']==1
 assert json.loads(rpc('fin_generate_recurrences',q(org)+','+q('2026-12')))['created']==1
 assert sql(f"SELECT count(*) FROM account_payables WHERE organization_id={q(org)} AND source_type='RECURRENCE'")=='3'
 assert sql(f"SELECT due_date FROM account_payables WHERE source_type='RECURRENCE' AND source_id LIKE {q('%|2026-11')}")=='2026-11-05'
 print('PASS: recorrência mensal com geração idempotente por período')

 # -- Inadimplência e aging derivados -------------------------------------------
 rove=json.loads(rpc('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':55,'description':'Atrasado','due_date':'2026-08-10'}))))
 late=recv('{"late":"1"}')['rows']
 assert any(x['id']==rove['id'] and x['status_effective']=='OVERDUE' for x in late)
 fin=json.loads(rpc('fin_query',q(org)+",'finances',"+q('{}')))
 assert fin['total']==1 and fin['rows'][0]['days_overdue']>0
 aging=json.loads(rpc('fin_query',q(org)+",'aging',"+q('{}')))
 assert aging['side']=='receivable' and abs(sum(r['total'] for r in aging['rows'])-452)<0.01
 print('PASS: inadimplência e aging derivados (sem job, sem regra inventada)')

 # -- Fluxo de caixa e relatórios ----------------------------------------------
 cf=json.loads(rpc('fin_query',q(org)+",'cashflow',"+q(json.dumps({'from':'2026-01-01','to':'2050-01-01'}))))
 assert round(cf['balance'],2)==2170
 assert round(cf['realized_in']-cf['realized_out'],2)==2170 and len(cf['days'])>0
 rep=json.loads(rpc('fin_query',q(org)+",'report_category',"+q(json.dumps({'from':'2026-01-01','to':'2050-01-01'}))))
 frev=next(r for r in rep['rows'] if r['code']=='FREV'); fc=next(r for r in rep['rows'] if r['code']=='FCUST')
 assert round(frev['inflows_realized'],2)==100 and round(fc['outflows_realized'],2)==80
 rcc=json.loads(rpc('fin_query',q(org)+",'report_cost_center',"+q(json.dumps({'from':'2026-01-01','to':'2050-01-01'}))))
 assert round(rcc['rows'][0]['outflows_realized'],2)==80
 pf=json.loads(rpc('fin_query',q(org)+",'partner_finance',"+q(json.dumps({'company_id':company}))))
 assert round(pf['receivable_open'],2)==452 and len(pf['next_due'])>0 and len(pf['history'])>0
 trx=json.loads(rpc('fin_query',q(org)+",'transactions',"+q('{}')))
 assert trx['total']==10
 hist=json.loads(rpc('fin_query',q(org)+",'history',"+q(json.dumps({'id':r1a}))))
 assert len(hist)>0
 print('PASS: fluxo de caixa, relatórios por categoria/centro e extrato de auditoria')

 # -- Concorrência: uma liquidação vence, idempotência do evento ----------------
 r500=json.loads(rpc('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':500,'description':'Concorrente','due_date':'2026-10-20'}))))
 def settle_stmt(key,amt):
  data={'account_id':acc1,'amount':amt,'receipt_key':key}
  return subprocess.run(db.BASE,input=f"SET ROLE authenticated; SET request.jwt.claim.sub={q(a)}; SELECT public.fin_settle({q(org)},{q('receivable')},{q(r500['id'])},{q(json.dumps(data))});",text=True,capture_output=True)
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  res=list(pool.map(lambda k:settle_stmt(*k),[('CA',400),('CB',500)]))
 assert sum(r.returncode==0 for r in res)==1
 assert sql(f"SELECT count(*) FROM receivable_settlements WHERE receivable_id={q(r500['id'])}")=='1'
 wtx=sql(f"SELECT financial_transaction_id FROM receivable_settlements WHERE receivable_id={q(r500['id'])}")
 rpc('fin_reverse_transaction',q(org)+','+q(wtx)+','+q('Desfazer cenário de corrida'))
 assert acct_bal(acc1)==670
 rpc('fin_document_mutate',','.join(map(q,[org,'receivable',r500['id'],'cancel',json.dumps({'reason':'Encerrar corrida'})])))
 print('PASS: liquidações concorrentes resolvem o saldo em uma única linha')
 recon3=uid(); feed_recon(recon3,700,'2026-09-22 10:00:00')
 def proc_stmt(rid):
  return subprocess.run(db.BASE,input=f"SET ROLE authenticated; SET request.jwt.claim.sub={q(a)}; SELECT public.fin_process_reconciliation({q(org)},{q(rid)});",text=True,capture_output=True)
 with concurrent.futures.ThreadPoolExecutor(2) as pool:
  res2=list(pool.map(lambda _:proc_stmt(recon3),range(2)))
 assert sum(r.returncode==0 for r in res2)==2
 assert sql(f"SELECT count(*) FROM account_receivables WHERE organization_id={q(org)} AND source_type='PARTNER_RECONCILIATION' AND source_id={q(recon3)}")=='1'
 print('PASS: evento processado concorrentemente sem duplicar título')

 # -- RLS, RBAC, imutabilidade e isolamento por organização ---------------------
 for fun,args,user in [('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':10,'description':'X','due_date':'2026-10-30'})),reader),
                       ('fin_save_account',q(org)+','+q(json.dumps({'name':'Bloqueada'})),reader),
                       ('fin_settle',','.join(map(q,[org,'receivable',r60['id'],json.dumps({'account_id':acc1,'amount':1})])),reader)]:
  db.call(fun,args,user,fail='permissão')
 assert json.loads(rpc('fin_query',q(org)+",'dashboard',"+q('{}'),reader)) is not None
 assert json.loads(rpc('fin_query',q(org)+",'dashboard',"+q('{}'),fz)) is not None
 json.loads(rpc('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':1,'description':'FZ','due_date':'2026-10-30'})),fz))
 db.call('fin_query',q(org)+",'dashboard',"+q('{}'),b,fail='permissão')
 assert sql(f'SELECT count(*) FROM account_receivables WHERE organization_id={q(org)}',b)=='0'
 sql(f'UPDATE financial_transactions SET amount=1 WHERE organization_id={q(org)}',a,fail='imutável')
 sql(f'DELETE FROM financial_transactions WHERE organization_id={q(org)}',fail='excluído')
 sql(f'UPDATE account_receivables SET original_amount=1 WHERE id={q(r1a)}',a,fail='Dados de origem')
 sql(f'DELETE FROM financial_categories WHERE id={q(cat_cost)}',fail='excluído')
 sql(f'INSERT INTO financial_transactions(organization_id,financial_account_id,type,direction,amount) VALUES({q(org)},{q(acc1)},\'DIRECT\',\'IN\',5)',a,fail='permission')
 print('PASS: RBAC por papel, isolamento por organização e imutabilidade do ledger')

 # -- Totais finais do dashboard e reconstrução do saldo ------------------------
 dash=json.loads(rpc('fin_query',q(org)+",'dashboard',"+q('{}')))
 assert round(dash['balance'],2)==2170
 assert round(dash['receivable_open'],2)==452 and round(dash['receivable_overdue'],2)==55
 assert dash['payable_open']==1500 and dash['payable_overdue']==0
 first_r=sql(f"SELECT id FROM account_receivables WHERE source_type='PARTNER_RECONCILIATION' AND source_id={q(recon)}")
 assert float(sql(f"SELECT public.finance_document_open({q(org)},'receivable',{q(first_r)})"))==float(sql(f"SELECT open_amount FROM account_receivables WHERE id={q(first_r)}"))
 print('OK: MASTER-008 finance scenarios')

try:run()
finally:db.cleanup()