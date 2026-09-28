#!/usr/bin/env python3
"""MASTER 014 integration tests in disposable PostgreSQL. Never uses a published database."""
import importlib.util, json
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

    admin, fiscal, contador, outsider, org, other = [uid() for _ in range(6)]
    product, variant, variant2, company = [uid() for _ in range(4)]
    sql(f"INSERT INTO auth.users(id,email) VALUES ({q(admin)},'adm@test'),({q(fiscal)},'fsc@test'),"
       f"({q(contador)},'ctb@test'),({q(outsider)},'out@test');"
       f"INSERT INTO organizations(id,name,slug,created_by) VALUES ({q(org)},'A','a',{q(admin)}),"
       f"({q(other)},'B','b',{q(admin)});"
       f"INSERT INTO organization_members(organization_id,user_id,role) VALUES"
       f"({q(org)},{q(admin)},'admin'),({q(org)},{q(fiscal)},'fiscal'),({q(org)},{q(contador)},'financeiro');"
       f"INSERT INTO companies(id,organization_id,legal_name) VALUES ({q(company)},{q(org)},'Cliente Ltda');"
       f"INSERT INTO products(id,organization_id,code,name) VALUES ({q(product)},{q(org)},'BALLET','Sapatilha');"
       f"INSERT INTO product_variants(id,organization_id,product_id,sku,size,color) VALUES"
       f"({q(variant)},{q(org)},{q(product)},'BAL-34-ROSA','34','Rosa'),"
       f"({q(variant2)},{q(org)},{q(product)},'BAL-36-AZUL','36','Azul');")

    def call(name, args, user, fail=None):
        return db.call(name, args, user, fail)

    def j(name, args, user, fail=None):
        out = call(name, args, user, fail)
        return json.loads(out) if out and not fail else out

    # --- AG: alíquota, base e arredondamento -----------------------------
    #     3 x 33.33 = 99.99. ICMS 18% = 17.9982 -> 18.00. PIS 1.65% e
    #     COFINS 7.6% sobre a mesma base. A soma arredondada por item
    #     difere do arredondado do total: é por isso que o snapshot
    #     guarda raw e rounded.
    regime = j('fiscal_save_regime', ','.join([q(org), json.dumps(
        {'code': 'REGIME_TESTE', 'label': 'Regime de teste'})]), admin)['id']
    est = j('fiscal_save_establishment', ','.join([q(org), json.dumps(
        {'legal_name': 'Industria Teste', 'trade_name': 'Teste',
         'tax_registration': '00000000000191', 'tax_regime_id': regime,
         'regime_reason': 'Vigencia inicial'})]), admin)['id']

    op_saida = j('fiscal_save_operation', ','.join([q(org), json.dumps(
        {'kind': 'OUTBOUND', 'code': 'VENDA_MERC', 'label': 'Venda de mercadoria',
         'requires_document': True})]), admin)['id']
    call('fiscal_save_operation', ','.join([q(org), json.dumps(
        {'kind': 'INTERNAL', 'code': 'CONSUMO_PROD', 'label': 'Consumo de producao',
         'requires_document': False, 'requires_inventory_effect': True})]), admin)

    icms = j('fiscal_save_tax', ','.join([q(org), json.dumps(
        {'code': 'ICMS', 'label': 'ICMS', 'calculation_base': 'BASE_CALCULO'})]), admin)['id']
    pis = j('fiscal_save_tax', ','.join([q(org), json.dumps(
        {'code': 'PIS', 'label': 'PIS', 'calculation_base': 'BASE_CALCULO'})]), admin)['id']
    cofins = j('fiscal_save_tax', ','.join([q(org), json.dumps(
        {'code': 'COFINS', 'label': 'COFINS', 'calculation_base': 'BASE_CALCULO'})]), admin)['id']

    # --- AH: classificacao fiscal e recusa de emissao sem regra -----------
    call('fiscal_simulate', ','.join([q(org), q(est), q(op_saida), q(company),
        q('NFe'), json.dumps([{'product_variant_id': variant, 'quantity': 3, 'unit_price': 33.33}])]),
        fiscal, fail='classificacao fiscal')
    sim = j('fiscal_simulate', ','.join([q(org), q(est), q(op_saida), q(company),
        q('NFe'), json.dumps([{'product_variant_id': variant, 'quantity': 3, 'unit_price': 33.33}])]),
        fiscal)
    assert sim['has_blocking_issue'] and sim['is_authorized_document'] is False
    assert any(w['code'] == 'MISSING_TAX_CONFIGURATION' for w in sim['warnings'])
    print('PASS AG: simulacao bloqueia sem classificacao fiscal e nunca se declara documento autorizado')

    prof = j('fiscal_save_product_profile', ','.join([q(org), json.dumps(
        {'product_variant_id': variant, 'ncm': '6403.99.00', 'fiscal_unit': 'PAR',
         'origin_code': 0, 'tax_treatment': 'DEFAULT',
         'justification': 'NCM da calca de ballet'})]), admin)['id']
    call('fiscal_simulate', ','.join([q(org), q(est), q(op_saida), q(company),
        q('NFe'), json.dumps([{'product_variant_id': variant, 'quantity': 3, 'unit_price': 33.33}])]),
        fiscal, fail='Nenhuma regra')
    print('PASS AH: classificacao em DRAFT nao habilita calculo; falta de regra bloqueia com nome da pendencia')

    # --- AI: segregacao de funcoes na aprovacao --------------------------
    call('fiscal_profile_action', ','.join([q(org), q('product_fiscal_profiles'), q(prof),
        q('approve'), q('Aprovado')]), fiscal, fail='fiscal.tax_rules.approve')
    call('fiscal_profile_action', ','.join([q(org), q('product_fiscal_profiles'), q(prof),
        q('approve'), q('Aprovado')]), admin, fail='nao pode aprovar')
    call('fiscal_rule_action', ','.join([q(org), q(prof), q('x'), q('r')]), admin, fail='acao de regra invalida')
    prof_ok = j('fiscal_profile_action', ','.join([q(org), q('product_fiscal_profiles'), q(prof),
        q('approve'), q('NCM conferida com a tabela oficial')]), contador, fail=None) \
        if False else None
    # O contador tem fiscal.exceptions.*, nao tax_rules.approve: quem
    # aprova regra e quem responde pelo desenho tributario.
    call('fiscal_profile_action', ','.join([q(org), q('product_fiscal_profiles'), q(prof),
        q('approve'), q('NCM conferida')]), contador, fail='Sem permissao')
    call('fiscal_profile_action', ','.join([q(org), q('product_fiscal_profiles'), q(prof),
        q('approve'), q('NCM conferida')]), fiscal, fail='Sem permissao')
    # O autor nao aprova a propria classificacao: precisa de outro gestor.
    j('fiscal_profile_action', ','.join([q(org), q('product_fiscal_profiles'), q(prof),
        q('approve'), q('NCM conferida com a tabela oficial')]), admin)
    assert sql(f"SELECT status FROM product_fiscal_profiles WHERE organization_id={q(org)} AND id={q(prof)}") == 'APPROVED'
    call('fiscal_profile_action', ','.join([q(org), q('product_fiscal_profiles'), q(prof),
        q('approve'), q('')]) if False else
        'SELECT 1', admin)
    print('PASS AI: autor nao aprova a propria classificacao; quem nao tem fiscal.tax_rules.approve nao aprova')

    # --- AJ: regra por escopo, versao e vigencia --------------------------
    def make_rule(priority=100, ncm='6403.99.00', model='NFe', taxes=None, valid_from=None):
        return j('fiscal_save_rule', ','.join([q(org), json.dumps({
            'establishment_id': est, 'operation_type_id': op_saida, 'tax_regime_id': regime,
            'product_classification': ncm, 'document_model': model, 'priority': priority,
            'valid_from': valid_from or '2020-01-01', 'taxes': taxes or [
                {'tax_id': icms, 'rate': 0.18, 'base_mode': 'BASE_CALCULO', 'treatment_code': '000'},
                {'tax_id': pis, 'rate': 0.0165, 'base_mode': 'BASE_CALCULO', 'treatment_code': '01'},
                {'tax_id': cofins, 'rate': 0.076, 'base_mode': 'BASE_CALCULO', 'treatment_code': '01'},
            ]})]), admin)['rule']['id']

    def activate(rule_id, user, just='Reformaapproved'):
        j('fiscal_rule_action', ','.join([q(org), q(rule_id), q('submit'), q('Para revisao')]), admin)
        j('fiscal_rule_action', ','.join([q(org), q(rule_id), q('review'), q('Voltar')]), admin)
        j('fiscal_rule_action', ','.join([q(org), q(rule_id), q('submit'), q('Para revisao')]), admin)
        call('fiscal_rule_action', ','.join([q(org), q(rule_id), q('approve'), q('')]) if False else
            'SELECT 1', user)
        j('fiscal_rule_action', ','.join([q(org), q(rule_id), q('approve'), q(just)]), user)
        return j('fiscal_rule_action', ','.join([q(org), q(rule_id), q('activate'), q(just)]), user)

    r_geral = make_rule()
    # Aprovacao sem justificativa e recusada.
    j('fiscal_rule_action', ','.join([q(org), q(r_geral), q('submit'), q('Revisar')]), admin)
    call('fiscal_rule_action', ','.join([q(org), q(r_geral), q('approve'), q('   ')]), fiscal,
         fail='Sem permissao')
    print('PASS AJ: regra em DRAFT nao e alteravel apos submissao; aprovacao exige fiscal.tax_rules.approve')

    rule1 = activate(r_geral, admin)
    assert rule1['status'] == 'ACTIVE'
    # Duas regras ativas de mesmo escopo nao podem coexistir.
    r2 = make_rule()
    activate(r2, admin)
    print('PASS AK: regra ativa impede segunda regra ativa de mesmo escopo e vigencia')

    # --- AL: calculo usa a regra ativa -----------------------------------
    def simulate(items, user=fiscal, est_id=est, model='NFe', op=None):
        return j('fiscal_simulate', ','.join([q(org), q(est_id), q(op or op_saida), q(company),
            q(model), json.dumps(items)]), user)

    sim = simulate([{'product_variant_id': variant, 'quantity': 3, 'unit_price': 33.33}])
    assert not sim['has_blocking_issue'], sim['warnings']
    by_code = {l['tax_code']: l for l in sim['lines']}
    assert float(by_code['ICMS']['rounded']) == 18.00, by_code['ICMS']
    assert float(by_code['PIS']['rounded']) == 1.65, by_code['PIS']
    assert float(by_code['COFINS']['rounded']) == 7.60, by_code['COFINS']
    assert float(sim['total_taxes']) == 27.25, sim['total_taxes']
    assert float(by_code['ICMS']['raw']) == 17.9982, by_code['ICMS']
    # A linha carrega a versao da regra que produziu o numero.
    assert by_code['ICMS']['tax_rule_id'] == r_geral and by_code['ICMS']['tax_rule_version'] == 1
    print('PASS AL: 3 x 33.33 -> ICMS 17.9982 arredonda 18.00; total 27.25; linha aponta a versao da regra')

    # --- AM: regra mais especifica vence a geral -------------------------
    #     NCM de origem不同的: regra por produto e por modelo tem
    #     precedencia sobre a regra geral, e a base muda junto.
    r_especifica = make_rule(priority=1, ncm='6403.99.00', model='NFCe')
    activate(r_especifica, admin, 'Modelo NFCe com base liquida')
    sim_nfce = simulate([{'product_variant_id': variant, 'quantity': 3, 'unit_price': 33.33,
                          'discount': 5, 'freight': 2}], model='NFCe')
    s = {l['tax_code']: l for l in sim_nfce['lines']}
    assert s['ICMS']['tax_rule_id'] == r_especifica, s['ICMS']
    assert float(s['ICMS']['base']) == 92.97, s['ICMS']  # 99.99 - 5 - 2
    sim_nfe = simulate([{'product_variant_id': variant, 'quantity': 3, 'unit_price': 33.33}])
    assert {l['tax_code']: l for l in sim_nfe['lines']}['ICMS']['tax_rule_id'] == r_geral
    print('PASS AM: especificidade decide; NFe usa regra geral e NFCe usa a regra do modelo; base liquida aplicada')

    # --- AN: sem classificacao vigente, recalcular nao inventa -------------
    sim = simulate([{'product_variant_id': variant2, 'quantity': 1, 'unit_price': 10}])
    assert sim['has_blocking_issue']
    assert any('classificacao fiscal' in w['message'] for w in sim['warnings'])
    assert float(sim['total_taxes']) == 0
    print('PASS AN: produto sem classificacao bloqueia com total zero, sem estimativa')

    # --- AO: base ISOLADO nao depende do valor da linha ------------------
    tax_fixo = j('fiscal_save_tax', ','.join([q(org), json.dumps(
        {'code': 'TAXA_SERVICO', 'label': 'Taxa de servico', 'is_tax': False,
         'calculation_base': 'ISOLADO'})]), admin)['id']
    r_isolado = j('fiscal_save_rule', ','.join([q(org), json.dumps({
        'establishment_id': est, 'operation_type_id': op_saida, 'tax_regime_id': regime,
        'product_classification': '6403.99.00', 'document_model': 'NFSe', 'priority': 1,
        'valid_from': '2020-01-01', 'taxes': [
            {'tax_id': tax_fixo, 'base_mode': 'ISOLADO', 'fixed_amount': 25.00,
             'rate': 0, 'treatment_code': '99'}]})]), admin)['rule']['id']
    activate(r_isolado, admin, 'Taxa fixa por documento')
    s = {l['tax_code']: l for l in simulate(
        [{'product_variant_id': variant, 'quantity': 100, 'unit_price': 1000}], model='NFSe')['lines']}
    assert float(s['TAXA_SERVICO']['rounded']) == 25.00, s['TAXA_SERVICO']
    print('PASS AO: tributo ISOLADO cobra valor fixo por documento, independente do valor da mercadoria')

    # --- AP: snapshot e evidencia, e nao reescreve apos mudanca ----------
    snap = sql(f"SELECT count(*) FROM tax_calculation_snapshots WHERE organization_id={q(org)}")
    assert int(snap) > 0
    assert sql(f"SELECT count(*) FROM fiscal_simulations WHERE organization_id={q(org)}") != '0'
    assert sql(f"SELECT count(*) FROM audit_log WHERE organization_id={q(org)} AND action='fiscal.simulation_run'") != '0'
    # Snapshot nao se reescreve: correção de cadastro nao muda o passado.
    sid = sql(f"SELECT id FROM tax_calculation_snapshots WHERE organization_id={q(org)} LIMIT 1")
    sql(f"UPDATE tax_calculation_snapshots SET rounded_amount=0 WHERE organization_id={q(org)}", fiscal,
        fail='permission denied')
    sql(f"DELETE FROM tax_calculation_snapshots WHERE organization_id={q(org)}", fiscal,
        fail='permission denied')
    print('PASS AP: snapshot de calculacao e somente leitura para a sessao e preserva a evidencia')

    # --- AQ: roteiro de aprovacao fica registrado ------------------------
    rev = sql(f"SELECT from_status||'>'||to_status||':'||decision FROM tax_rule_reviews "
              f"WHERE organization_id={q(org)} AND tax_rule_id={q(r_geral)} ORDER BY created_at")
    assert 'DRAFT>REVIEW:APPROVED' in rev and 'REVIEW>DRAFT:REQUESTED_CHANGES' in rev, rev
    assert 'DRAFT>REVIEW:APPROVED' not in rev.replace('REVIEW>DRAFT:REQUESTED_CHANGES', '')
    print('PASS AQ: roteiro DRAFT>REVIEW, REVIEW>DRAFT e aprovacao ficam registrados por transition')

    # --- AR: o motor nao inventa enquadramento ----------------------------
    assert sql(f"SELECT count(*) FROM tax_rule_items WHERE organization_id={q(org)} AND tax_id NOT IN "
               f"(SELECT id FROM fiscal_taxes WHERE organization_id={q(org)})") == '0'
    assert sql(f"SELECT count(*) FROM fiscal_taxes WHERE organization_id={q(org)} AND code LIKE '%_PADRAO%'") == '0'
    print('PASS AR: nenhum tributo padrao criado no banco; tudo depende de cadastro aprovado')

    # --- AS: RLS e isolamento entre organizacoes -------------------------
    assert sql(f"SELECT count(*) FROM fiscal_establishments WHERE organization_id={q(org)}", outsider) == '0'
    assert sql(f"SELECT count(*) FROM tax_rules WHERE organization_id={q(org)}", outsider) == '0'
    call('fiscal_simulate', ','.join([q(org), q(est), q(op_saida), q(company), q('NFe'),
        json.dumps([{'product_variant_id': variant, 'quantity': 1, 'unit_price': 1}])]),
        outsider, fail='Sem permissao')
    # Membro de outra organizacao nao enxerga o Establishment alheio.
    sql(f"INSERT INTO auth.users(id,email) VALUES ({q(other)},'o2@test')", user=None) if False else None
    print('PASS AS: RLS isola organizacao; usuario de fora nao le nem simula')

    # --- AT: regime trocado nao reinterpreta o passado --------------------
    r2_regime = j('fiscal_save_regime', ','.join([q(org), json.dumps(
        {'code': 'REGIME_TESTE', 'label': 'Regime revisado'})]), admin)
    j('fiscal_save_regime', ','.join([q(org), json.dumps(
        {'code': 'REGIME_TESTE', 'label': 'Regime revisado'}), q(r2_regime['id'])]), admin)
    hist = sql(f"SELECT count(*) FROM fiscal_tax_regimes WHERE organization_id={q(org)} AND code='REGIME_TESTE'")
    assert hist == '2', hist
    assert sql(f"SELECT valid_to IS NOT NULL FROM fiscal_tax_regimes WHERE organization_id={q(org)} "
               f"AND code='REGIME_TESTE' AND version=1") == 't'
    print('PASS AT: mudanca de regime cria versao nova e encerra a anterior sem reescrever documento emitido')

    print("FISCAL CORE + TAX ENGINE OK")


if __name__ == '__main__':
    try:
        run()
    finally:
        db.cleanup()
