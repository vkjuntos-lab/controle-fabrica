#!/usr/bin/env python3
"""MASTER 013 integration tests in disposable PostgreSQL. Never uses a published database."""
import importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('inventory',Path(__file__).with_name('test-inventory-db.py'))
db=importlib.util.module_from_spec(spec);spec.loader.exec_module(db)
q,sql,uid=db.q,db.sql,db.uid
def run():
 db.setup()
 for name in ['20260926100000_partner_reconciliation.sql','20260928100000_finance.sql','20260930100000_cost_engine.sql','20261001100000_purchasing.sql','20261002100000_planning.sql','20261003100000_planning_engine.sql','20261004100000_planning_fixes.sql','20261005100000_crm.sql','20261006100000_sales_orders.sql']:
  sql((db.ROOT/'supabase/migrations'/name).read_text())
 print('MIGRATION OK')
if __name__=='__main__':run()
