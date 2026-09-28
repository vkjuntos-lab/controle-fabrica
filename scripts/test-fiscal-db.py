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

    admin, fiscal, contador, outsider, org = [uid() for _ in range(5)]
    product, variant, variant2, company = [uid() for _ in range(4)]
    sql(f"INSERT INTO auth.users(id,email) VALUES ({q(admin)},'adm@test'),({q(fiscal)},'fsc@test'),"
       f"({q(contador)},'ctb@test'),({q(outsider)},'out@test');"
       f"INSERT INTO organizations(id,name,slug,created_by) VALUES ({q(org)},'A','a',{q(admin)});"
       # O creator da organização já entra como admin pelo trigger
       # handle_new_organization. Inserir de novo seria duplicar a linha.
       f"INSERT INTO organization_members(organization_id,user_id,role) VALUES"
       f"({q(org)},{q(fiscal)},'fiscal'),({q(org)},{q(contador)},'financeiro');"
       f"INSERT INTO companies(id,organization_id,legal_name) VALUES ({q(company)},{q(org)},'Cliente Ltda');"
       f"INSERT INTO products(id,organization_id,code,name) VALUES ({q(product)},{q(org)},'BALLET','Sapatilha');"
       f"INSERT INTO product_variants(id,organization_id,product_id,sku,size,color) VALUES"
       f"({q(variant)},{q(org)},{q(product)},'BAL-34-ROSA','34','Rosa'),"
       f"({q(variant2)},{q(org)},{q(product)},'BAL-36-AZUL','36','Azul');")

    def j(name, args, user, fail=None):
        out = db.call(name, args, user, fail)
        return json.loads(out) if out is not None and not fail else out

    def save(name, data, user=admin, rid=None, fail=None):
        return j(name, ','.join([q(org), json.dumps(data)] + ([q(rid)] if rid else [])), user, fail)

    # --- AG: base, alíquota e arredondamento -----------------------------
    #     3 x 33.33 = 99.99. ICMS 18% = 17.9982. O snapshot guarda o
    #     valor bruto e o arredondado, porque a soma por linha
    #     arredondada nao bate com o total arredondado.
    regime = save('fiscal_save_regime', {'code': 'REGIME_TESTE', 'label': 'Regime de teste'})['id']
    est = save('fiscal_save_establishment', {
        'legal_name': 'Industria Teste', 'trade_name': 'Teste',
        'tax_registration': '00000000000191', 'tax_regime_id': regime,
        'regime_reason': 'Vigencia inicial'})['id']
    op = save('fiscal_save_operation', {
        'kind': 'OUTBOUND', 'code': 'VENDA_MERC', 'label': 'Venda de mercadoria',
        'requires_document': True})['id']
    save('fiscal_save_operation', {
        'kind': 'INTERNAL', 'code': 'CONSUMO_PROD', 'label': 'Consumo de producao',
        'requires_document': False, 'requires_inventory_effect': True})
    assert sql(f"SELECT requires_document::text FROM fiscal_operation_types "
               f"WHERE organization_id={q(org)} AND code='CONSUMO_PROD'") == 'false'
    icms = save('fiscal_save_tax', {'code': 'ICMS', 'label': 'ICMS'})['id']
    pis = save('fiscal_save_tax', {'code': 'PIS', 'label': 'PIS'})['id']
    cofins = save('fiscal_save_tax', {'code': 'COFINS', 'label': 'COFINS'})['id']

    def simulate(items, user=fiscal, est_id=est, model='NFe', op_id=None, fail=None):
        return j('fiscal_simulate', ','.join([q(org), q(est_id), q(op_id or op), q(company),
            q(model), json.dumps(items)]), user, fail)

    # --- AH: sem classificacao fiscal, nao ha calculo ---------------------
    item = [{'product_variant_id': variant, 'quantity': 3, 'unit_price': 33.33}]
    save('fiscal_save_product_profile', {
        'product_variant_id': variant, 'ncm': '6403.99.00', 'fiscal_unit': 'PAR',
        'origin_code': 0, 'justification': 'NCM da calca de ballet'})
    sim = simulate(item)
    assert sim['has_blocking_issue'] and sim['is_authorized_document'] is False
    assert any(w['code'] == 'MISSING_TAX_CONFIGURATION' for w in sim['warnings'])
    assert 'classificacao fiscal' in sim['warnings'][0]['message']
    print('PASS AG: simulacao sem classificacao vigente bloqueia e se declara nao autoritativa')

    # --- AI: classificacao em DRAFT nao habilita calculo ------------------
    prof = save('fiscal_save_product_profile', {
        'product_variant_id': variant, 'ncm': '6403.99.00', 'fiscal_unit': 'PAR',
        'origin_code': 0, 'justification': 'NCM da calca de ballet'})['id']
    assert sql(f"SELECT status FROM product_fiscal_profiles WHERE organization_id={q(org)} AND id={q(prof)}") == 'DRAFT'
    sim = simulate(item)
    assert sim['has_blocking_issue'] and float(sim['total_taxes']) == 0
    assert any('classificacao fiscal' in w['message'] for w in sim['warnings'])
    print('PASS AH: classificacao em DRAFT nao entra no calculo; falta de regra nomeia a pendencia')

    # --- AJ: segregacao de funcoes ----------------------------------------
    args = ','.join([q(org), q('product_fiscal_profiles'), q(prof), q('approve'), q('NCM conferida')])
    db.call('fiscal_profile_action', args, contador, 'Sem permissao')
    db.call('fiscal_profile_action', args, fiscal, 'Sem permissao')
    db.call('fiscal_profile_action', args, admin, 'nao pode aprovar')
    save('fiscal_save_product_profile', {
        'product_variant_id': variant, 'ncm': '6403.99.99', 'justification': 'tentativa'},
        rid=prof, fail='so e alteravel')
    # Um segundo gestor (o proprio admin ja criou) libera a classificacao.
    j('fiscal_profile_action', args, admin)
    assert sql(f"SELECT status FROM product_fiscal_profiles WHERE organization_id={q(org)} AND id={q(prof)}") == 'APPROVED'
    db.call('fiscal_profile_action', ','.join([q(org), q('nao_existe'), q(prof), q('approve'), q('x')]),
            admin, 'Tabela de perfil')
    print('PASS AI: autor nao aprova a propria classificacao; perfil aprovado fica imutavel')

    # --- AK: ciclo de vida da regra e aprovacao com justificativa ----------
    def make_rule(priority=100, ncm='6403.99.00', model='NFe', taxes=None, valid_from='2020-01-01'):
        return save('fiscal_save_rule', {
            'establishment_id': est, 'operation_type_id': op, 'tax_regime_id': regime,
            'product_classification': ncm, 'document_model': model, 'priority': priority,
            'valid_from': valid_from, 'taxes': taxes or [
                {'tax_id': icms, 'rate': 0.18, 'base_mode': 'BASE_CALCULO', 'treatment_code': '000'},
                {'tax_id': pis, 'rate': 0.0165, 'base_mode': 'BASE_CALCULO', 'treatment_code': '01'},
                {'tax_id': cofins, 'rate': 0.076, 'base_mode': 'BASE_CALCULO', 'treatment_code': '01'},
            ]})['rule']['id']

    def approve(rule_id, user, just='Regra conferida contra a legislacao vigente'):
        db.call('fiscal_rule_action', ','.join([q(org), q(rule_id), q('submit'), q('Para revisao')]), admin)
        db.call('fiscal_rule_action', ','.join([q(org), q(rule_id), q('review'), q('Voltar para ajuste')]), admin)
        db.call('fiscal_rule_action', ','.join([q(org), q(rule_id), q('submit'), q('Para revisao')]), admin)
        db.call('fiscal_rule_action', ','.join([q(org), q(rule_id), q('approve'), q('  ')]), user,
                'justificativa')
        j('fiscal_rule_action', ','.join([q(org), q(rule_id), q('approve'), q(just)]), user)
        return j('fiscal_rule_action', ','.join([q(org), q(rule_id), q('activate'), q(just)]), user)

    r_nfe = make_rule()
    save('fiscal_save_rule', {'priority': 5}, rid=r_nfe)
    db.call('fiscal_rule_action', ','.join([q(org), q(r_nfe), q('submit'), q('Revisar')]), admin)
    save('fiscal_save_rule', {'priority': 5}, rid=r_nfe, fail='so e alteravel')
    db.call('fiscal_rule_action', ','.join([q(org), q(r_nfe), q('approve'), q('x')]), fiscal,
            'Sem permissao')
    print('PASS AJ: regra submetida vira imutavel; aprovacao exige permissao e justificativa')

    assert approve(r_nfe, admin)['status'] == 'ACTIVE'
    r_dup = make_rule()
    db.call('fiscal_rule_action', ','.join([q(org), q(r_dup), q('submit'), q('Revisar')]), admin)
    db.call('fiscal_rule_action', ','.join([q(org), q(r_dup), q('approve'), q('Duplicada')]), admin)
    db.call('fiscal_rule_action', ','.join([q(org), q(r_dup), q('activate'), q('Duplicada')]), admin,
            'mesmo escopo')
    print('PASS AK: segunda regra ATIVE de mesmo escopo e vigencia e recusada')

    # --- AL: o calculo usa a regra ativa -----------------------------------
    sim = simulate(item)
    assert not sim['has_blocking_issue'], sim['warnings']
    by = {l['tax_code']: l for l in sim['lines']}
    assert float(by['ICMS']['raw']) == 17.9982, by['ICMS']
    assert float(by['ICMS']['rounded']) == 18.00, by['ICMS']
    assert float(by['PIS']['rounded']) == 1.65 and float(by['COFINS']['rounded']) == 7.60
    assert float(sim['total_taxes']) == 27.25, sim['total_taxes']
    assert by['ICMS']['tax_rule_id'] == r_nfe and by['ICMS']['tax_rule_version'] == 1
    assert 'PARAMETRO_INVENTADO' not in json.dumps(sim)
    print('PASS AL: 3 x 33.33 -> ICMS 17.9982 arredonda 18.00, total 27.25, linha aponta a versao da regra')

    # --- AM: especificidade decide a regra, e a base acompanha --------------
    r_nfce = make_rule(priority=1, model='NFCe', taxes=[
        {'tax_id': icms, 'rate': 0.18, 'base_mode': 'VALOR_LIQUIDO', 'reduction': 3.00,
         'treatment_code': '000'}])
    approve(r_nfce, admin, 'NFCe com reducao de base aprovada')
    nfce = {l['tax_code']: l for l in simulate(
        [dict(item[0], discount=5, freight=2)], model='NFCe')['lines']}
    assert nfce['ICMS']['tax_rule_id'] == r_nfce
    assert float(nfce['ICMS']['base']) == 94.97, nfce['ICMS']  # 99.99 - 5 - 2 = 92.97, reducao 3
    assert float(nfce['ICMS']['rounded']) == float(round(89.97 * 0.18, 2)), nfce['ICMS']
    nfe = {l['tax_code']: l for l in simulate(item)['lines']}
    assert nfe['ICMS']['tax_rule_id'] == r_nfe, 'regra geral nao foi preterida'
    print('PASS AM: regra do modelo NFCe supera a geral; reducao e frete entram na base antes da aliquota')

    # --- AN: produto sem classificacao vigente nao recebe estimativa -------
    sim = simulate([{'product_variant_id': variant2, 'quantity': 1, 'unit_price': 10}])
    assert sim['has_blocking_issue'] and float(sim['total_taxes']) == 0
    assert any('classificacao fiscal' in w['message'] for w in sim['warnings'])
    print('PASS AN: linha sem classificacao bloqueia a operacao e nao estima tributo')

    # --- AO: tributo ISOLADO nao acompanha o valor da mercadoria ------------
    taxa = save('fiscal_save_tax', {'code': 'TAXA_SERVICO', 'label': 'Taxa de servico',
                                    'is_tax': False, 'calculation_base': 'ISOLADO'})['id']
    r_nfse = make_rule(priority=1, model='NFSe', taxes=[
        {'tax_id': taxa, 'base_mode': 'ISOLADO', 'fixed_amount': 25.00, 'rate': 0,
         'treatment_code': '99'}])
    approve(r_nfse, admin, 'Taxa fixa por documento aprovada')
    s = {l['tax_code']: l for l in simulate(
        [{'product_variant_id': variant, 'quantity': 100, 'unit_price': 1000}],
        model='NFSe')['lines']}
    assert float(s['TAXA_SERVICO']['rounded']) == 25.00, s['TAXA_SERVICO']
    assert float(s['TAXA_SERVICO']['base']) == 25.00
    print('PASS AO: tributo ISOLADO cobra o valor fixo aprovado, independente do total da operacao')

    # --- AP: evidencia de calculo e trilha de auditoria ---------------------
    assert int(sql(f"SELECT count(*) FROM tax_calculation_snapshots WHERE organization_id={q(org)}")) > 0
    assert int(sql(f"SELECT count(*) FROM fiscal_simulations WHERE organization_id={q(org)}")) > 0
    assert int(sql(f"SELECT count(*) FROM audit_log WHERE organization_id={q(org)} "
                   f"AND action='fiscal.simulation_run'")) > 0
    assert int(sql(f"SELECT count(*) FROM tax_rule_reviews WHERE organization_id={q(org)}")) > 0
    sql(f"UPDATE tax_calculation_snapshots SET rounded_amount=0 WHERE organization_id={q(org)}",
        fiscal, 'permission denied')
    sql(f"DELETE FROM tax_calculation_snapshots WHERE organization_id={q(org)}",
        fiscal, 'permission denied')
    print('PASS AP: snapshot e trilha de revisao existem e a sessao nao reescreve o calculo')

    # --- AQ: roteiro de aprovacao por transicao -----------------------------
    rev = sql(f"SELECT string_agg(from_status||'>'||to_status||':'||decision,',' ORDER BY created_at) "
              f"FROM tax_rule_reviews WHERE organization_id={q(org)} AND tax_rule_id={q(r_nfe)}")
    assert rev.startswith('DRAFT>REVIEW:APPROVED,REVIEW>DRAFT:REQUESTED_CHANGES,DRAFT>REVIEW:APPROVED'), rev
    print('PASS AQ: roteiro DRAFT>REVIEW, REVIEW>DRAFT e aprovacao ficam registrados transition por transition')

    # --- AR: o motor nao inventa enquadramento ------------------------------
    assert sql(f"SELECT count(*) FROM tax_rule_items WHERE organization_id={q(org)} AND tax_id NOT IN "
               f"(SELECT id FROM fiscal_taxes WHERE organization_id={q(org)})") == '0'
    db.call('fiscal_save_tax', ','.join([q(org), json.dumps({'code': 'X', 'label': ''})]),
            admin, 'fiscal.configure')
    assert sql(f"SELECT count(*) FROM fiscal_taxes WHERE organization_id={q(org)} AND code LIKE '%PADRAO%'") == '0'
    print('PASS AR: nenhum tributo nasce sem cadastro; o banco nao semeia aliquota')

    # --- AS: RLS e isolamento ------------------------------------------------
    assert sql(f"SELECT count(*) FROM fiscal_establishments WHERE organization_id={q(org)}", outsider) == '0'
    assert sql(f"SELECT count(*) FROM tax_rules WHERE organization_id={q(org)}", outsider) == '0'
    assert sql(f"SELECT count(*) FROM tax_rule_reviews WHERE organization_id={q(org)}", outsider) == '0'
    db.call('fiscal_simulate', ','.join([q(org), q(est), q(op), q(company), q('NFe'), json.dumps(item)]),
            outsider, 'Sem permissao')
    print('PASS AS: RLS isola a organizacao e usuario sem permissao nao simula')

    # --- AT: mudanca de regime nao reinterpreta o passado --------------------
    reg2 = save('fiscal_save_regime', {'code': 'REGIME_TESTE', 'label': 'Regime revisado'})['id']
    v3 = save('fiscal_save_regime', {'code': 'REGIME_TESTE', 'label': 'Regime revisado'}, rid=reg2)
    assert v3['version'] == 2, v3
    assert sql(f"SELECT count(*) FROM fiscal_tax_regimes WHERE organization_id={q(org)} "
               f"AND code='REGIME_TESTE'") == '2'
    assert sql(f"SELECT valid_to IS NOT NULL FROM fiscal_tax_regimes WHERE organization_id={q(org)} "
               f"AND code='REGIME_TESTE' AND version=1") == 't'
    assert float(simulate(item)['total_taxes']) == 27.25
    print('AT: PASS - regime novo cria versao e nao muda o resultado de documento ja calculado')

    print("FISCAL CORE + TAX ENGINE OK")


if __name__ == '__main__':
    try:
        run()
    finally:
        db.cleanup()
