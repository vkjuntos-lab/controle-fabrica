#!/usr/bin/env python3
"""MASTER 008 acceptance tests in a disposable PostgreSQL cluster, no real organization data."""
import importlib.util
import json
import subprocess
from pathlib import Path
import concurrent.futures
import datetime
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
 # Parceiro direto (empresa + perfil operacional) para exercitar o motor financeiro.
 sql(f"INSERT INTO companies(id,organization_id,code,legal_name) VALUES({q(company)},{q(org)},'R1','Parceiro R1'); INSERT INTO partner_profiles(id,organization_id,company_id,partner_code) VALUES({q(profile)},{q(org)},{q(company)},'P-R1');")
 def rpc(name,args,user=a,fail=None): return db.call(name,args,user,fail)
 def recv_query(extra='{}'): return json.loads(rpc('fin_query',q(org)+",'receivables',"+q(extra)))
 # -- Catálogo financeiro ----------------------------------------------------
 cat_exp=rpc('fin_save_category',q(org)+','+q(json.dumps({'code':'FREV','name':'Receitas','type':'REVENUE'})))
 cat_cost=rpc('fin_save_category',q(org)+','+q(json.dumps({'code':'FCUST','name':'Custos','type':'EXPENSE'})))
 sub=rpc('fin_save_category',q(org)+','+q(json.dumps({'code':'ENRG','name':'Energia','type':'EXPENSE','parent_id':cat_cost})))
 cc=rpc('fin_save_cost_center',q(org)+','+q(json.dumps({'code':'CC-FAB','name':'Fábrica'})))
 acc1=rpc('fin_save_account',q(org)+','+q(json.dumps({'name':'Banco Beta','type':'BANK','bank_name':'Beta'})))
 acc2=rpc('fin_save_account',q(org)+','+q(json.dumps({'name':'Caixa','type':'CASH'})))
 pm=rpc('fin_save_payment_method',q(org)+','+q(json.dumps({'code':'PIX','name':'Pix'})))
 rpc('fin_save_settings',q(org)+','+q(json.dumps({'currency':'BRL','partner_receivable_due_days':7,'partner_receivable_installments':1})))
 cats=json.loads(rpc('fin_query',q(org)+",'categories',"+q('{}')))
 assert len(cats)==3 and any(c['code']=='ENRG' for c in cats)
 assert len(json.loads(rpc('fin_query',q(org)+",'cost_centers',"+q('{}'))))==1
 acc_rows=json.loads(rpc('fin_query',q(org)+",'accounts',"+q('{}')))['rows']
 assert len(acc_rows)==2 and all(aa['balance']==0 for aa in acc_rows)
 assert json.loads(rpc('fin_query',q(org)+",'settings',"+q('{}')))['partner_receivable_due_days']==7
 print('PASS: catálogo financeiro, contas, centros, formas e configurações')
 # -- Contas a receber manuais, parcelas e mutações ---------------------------
 r1=json.loads(rpc('fin_create_receivable',q(org)+','+q(json.dumps({'company_id':company,'amount':100,'installments':2,'description':'Venda a prazo','due_date':'2026-10-05','financial_category_id':cat_exp,'cost_center_id':cc}))))
 assert r1['total_installments']==2
 rows=recv_query()['rows']
 assert len(rows)==2 and rows[0]['parent_id'] is None and rows[1]['parent_id']==rows[0]['id']
 assert rows[0]['document_number'].startswith('REC-') and round(rows[0]['open_amount'],2)==50 and round(rows[1]['original_amount'],2)==50
 r1a,r1b=rows[0]['id'],rows[1]['id']
 rpc('fin_document_mutate','','')  # placeholder nunca executado (mantém indentação)
 raise SystemExit

try:run()
finally:db.cleanup()