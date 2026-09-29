#!/usr/bin/env python3
"""Sonda descartavel: confirma divergencias de permissao e leitura por kind."""
import importlib.util, json, sys
from pathlib import Path

ROOT = Path('/root/Zheus AI Projects/controle-fabricas')
spec = importlib.util.spec_from_file_location('wf', ROOT / 'scripts/test-fiscal-workflow-db.py')
wf = importlib.util.module_from_spec(spec)
spec.loader.exec_module(wf)
db = wf.db
sql = db.sql
q = db.q

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
    '20261014100000_fiscal_integrity.sql', '20261014200000_fiscal_documents.sql',
    '20261014300000_fiscal_inbound.sql', '20261014400000_fiscal_workspace.sql',
]

CATALOG = [
 'fiscal.read','fiscal.dashboard','fiscal.configure','fiscal.simulate','fiscal.tax_rules.read',
 'fiscal.tax_rules.manage','fiscal.tax_rules.approve','fiscal.documents.create',
 'fiscal.documents.validate','fiscal.documents.issue','fiscal.documents.cancel',
 'fiscal.documents.download','fiscal.inbound.read','fiscal.inbound.import','fiscal.inbound.review',
 'fiscal.reconciliation.read','fiscal.reconciliation.manage','fiscal.exceptions.read',
 'fiscal.exceptions.manage','fiscal.events.read','fiscal.reports.export','fiscal.provider.manage',
]

def run():
    db.setup()
    for name in MIGRATIONS:
        sql((db.ROOT / 'supabase/migrations' / name).read_text())
    org = sql('SELECT id FROM organizations LIMIT 1')

    print('--- B2: permissoes concedidas fora do catalogo ---')
    rows = sql("SELECT DISTINCT permission FROM role_permissions WHERE permission LIKE 'fiscal%' ORDER BY 1").split('\n')
    orfa = [p for p in rows if p not in CATALOG]
    print('ORFAS:', orfa)

    print('--- catalogo sem nenhuma concessao ---')
    conceded = set(rows)
    print('SEM CONCESSAO:', [p for p in CATALOG if p not in conceded])

    print('--- B1: kind de configuracao lido por quem so tem fiscal.configure ---')
    uid = db.uid()
    sql(f"INSERT INTO auth.users(id,email) VALUES({q(uid)},'cfg@test');")
    sql(f"INSERT INTO organization_members(organization_id,user_id,role) VALUES({q(org)},{q(uid)},'fiscal');")
    sql(f"DELETE FROM role_permissions WHERE role='fiscal';")
    sql(f"INSERT INTO role_permissions(role,permission) VALUES('fiscal','fiscal.configure');")
    for kind in ['establishments', 'regimes', 'operations', 'natures', 'taxes', 'layouts',
                 'companies', 'products', 'rules', 'simulations', 'documents']:
        out = db.call('fiscal_query', ','.join([q(org), q(kind), q('{}')]), uid, 'permiss')
        print(f'  {kind:14s} ->', 'RECUSADO' if out is None else 'ok')

    print('--- B1b: mesmo cenario, papel com fiscal.configure + fiscal.tax_rules.read ---')
    sql(f"INSERT INTO role_permissions(role,permission) VALUES('fiscal','fiscal.tax_rules.read');")
    for kind in ['products', 'rules']:
        out = db.call('fiscal_query', ','.join([q(org), q(kind), q('{}')]), uid, 'permiss')
        print(f'  {kind:14s} ->', 'RECUSADO' if out is None else 'ok')

    print('--- B3: filtro de periodo esconde registro sem issue_date/created_at ---')
    for t in ['fiscal_documents', 'fbound']:
        pass
    tables = sql("SELECT table_name FROM information_schema.columns WHERE column_name='created_at' AND table_schema='public' AND table_name LIKE '%fiscal%' OR (table_schema='public' AND table_name IN ('tax_rules','tax_rule_items','tax_rule_reviews','tax_calculation_snapshots') AND column_name='created_at') ORDER BY 1").split('\n')
    print('  tabelas fiscais SEM created_at:', [t for t in sql("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND (table_name LIKE '%fiscal%' OR table_name LIKE 'tax_rule%') ORDER BY 1").split('\n') if t not in tables])

    print('--- B3b: filtro de data esconde linha com data nula ---')
    r = sql("SELECT count(*) FROM fiscal_documents WHERE organization_id=%s AND created_at IS NULL" % q(org))
    print('  documentos com created_at nulo:', r)

    print('--- I1: colunas reais por area (o que a tabela generica tenta ler) ---')
    for t in ['fiscal_documents', 'inbound_fiscal_documents', 'fiscal_events', 'fiscal_exceptions',
              'fiscal_reconciliations', 'product_fiscal_profiles', 'company_fiscal_profiles',
              'fiscal_simulations', 'tax_rules', 'fiscal_layout_versions']:
        cols = sql("SELECT string_agg(column_name,',' ORDER BY column_name) FROM information_schema.columns WHERE table_schema='public' AND table_name=%s" % q(t))
        mostrados = ['label', 'legal_name', 'fiscal_nature', 'sku', 'name', 'version', 'id']
        tem = [c for c in mostrados if (',' + cols + ',').find(',' + c + ',') >= 0]
        print(f'  {t:30s} label->{tem}')

    print('--- I2: detail nao devolve os snapshots de tributo ---')
    print(' ', sql("SELECT jsonb_object_keys(fiscal_query(%s,'detail',%s))" % (q(org), q(json.dumps({'id': db.uid()})))))

if __name__ == '__main__':
    try:
        run()
    finally:
        db.cleanup()
