#!/usr/bin/env python3
"""Probe: run the migration, then execute each sales_query branch separately."""
import importlib.util,json,subprocess
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('test-inventory-db.py'))
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
q,sql,uid=db.q,db.sql,db.uid
def run():
 db.setup()
 for name in ['20260926100000_partner_reconciliation.sql','20260928100000_finance.sql','20260930100000_cost_engine.sql','20261001100000_purchasing.sql','20261002100000_planning.sql','20261003100000_planning_engine.sql','20261004100000_planning_fixes.sql','20261005100000_crm.sql','20261006100000_sales_orders.sql']:
  try:
   sql((db.ROOT/'supabase/migrations'/name).read_text())
  except AssertionError as e:
   print('FALHOU',name); print(e.args[0][:1500]); return
 print('MIGRATION OK')
 a,org=uid(),uid()
 sql(f"INSERT INTO auth.users(id,email) VALUES({q(a)},'a@test');INSERT INTO organizations(id,name,slug,created_by) VALUES({q(org)},'S','s',{q(a)}) ON CONFLICT DO NOTHING;INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(a)},'admin') ON CONFLICT DO NOTHING")
 for kind in ['orders','exceptions','shipments','returns','reservations','fulfillment','carriers','credits','desconhecido']:
  try:
   v=db.call('sales_query',f"{q(org)},{q(kind)},'{{}}'",a)
   print('OK  ',kind, (v or '')[:60])
  except AssertionError as e:
   print('ERRO',kind,'::',e.args[0][:400])
if __name__=='__main__':run()
