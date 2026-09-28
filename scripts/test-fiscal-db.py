#!/usr/bin/env python3
"""MASTER 014 integration tests in disposable PostgreSQL. Never uses a published database."""
import importlib.util, json, datetime
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('test-inventory-db.py'))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
q, sql, uid = db.q, db.sql, db.uid

MIGRATIONS = [
    '20260926100000_partner_reconciliation.sql', '20260928100000_finance.sql',
    '20260930100000_cost_engine.sql', '20261001100000_purchasing.sql',
    '20261002100000_planning.sql', '20261003100000_planning_engine.sql',
    '20261004100000_planning_fixes.sql', '20261005100000_crm.sql',
    '20261006100000_crm_integrity.sql', '20261006100000_sales_orders.sql',
    '20261007100000_crm_documents.sql', '20261008100000_crm_company_services.sql',
    '20261009100000_crm_customer_history.sql', '20261010100000_sales_integrity.sql',
    '20261011100000_sales_planning.sql', '20261012100000_sales_screen_fixes.sql',
    '20261013100000_fiscal_core.sql', '20261013200000_fiscal_tax_engine.sql',
]


def run():
    db.setup()
    for name in MIGRATIONS:
        sql((db.ROOT / 'supabase/migrations' / name).read_text())
    print("MIGRATIONS OK")


if __name__ == '__main__':
    try:
        run()
    finally:
        db.cleanup()
