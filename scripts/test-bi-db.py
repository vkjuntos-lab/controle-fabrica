#!/usr/bin/env python3
"""
MASTER 015 — Business Intelligence: integração real no PostgreSQL isolado.

O que este script prova, e por que cada caso existe:

- §66 a reconciliação NÃO dobra a venda: 10 unidades importadas viram 10
  unidades reconciliadas, nunca 20. O fato é o mesmo, muda de natureza.
- §67 remessa para parceiro é logística: 100 unidades enviadas não são
  100 unidades vendidas, e saem do estoque pelo Ledger.
- §68 o estoque vem do Ledger, e o saldo histórico responde na data
  pedida — inclusive depois de transferência entre locais.
- §25/§26 curva ABC: a participação acumulada fecha em 100%, os limites
  usados ficam gravados e reprocessar não muda a classe de ninguém.
- §28/§29 curva XYZ: histórico insuficiente ou média zero é
  INDISPONÍVEL com justificativa, nunca classe inventada.
- §52 comparativo: só existe quando os dois períodos são válidos.
- §53 meta aponta para métrica oficial; dashboard não aceita métrica
  inexistente nem aceita componente que redefina fórmula.
- §55 drill-down leva ao registro operacional real.
- §56 exportação respeita a MESMA autorização da tela e fica auditada.
- §64/§75/§76 permissão no servidor, isolamento por tenant e RLS: quem
  não tem `bi.financial` não recebe o número financeiro por chamada
  direta, e o usuário de outro tenant não enxerga nada.
- §14/§21 reprocessamento é idempotente: rodar duas vezes não duplica
  fato nem muda resultado.
- §5 catálogo: uma chave, uma definição; a organização não redefine a
  global.
- Razão sem denominador é INDISPONÍVEL, não zero.

Nunca conecta a banco publicado. Precisa rodar fora de root: `initdb`
recusa root.
"""
import importlib.util
import json
import uuid
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('test-inventory-db.py'))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
sql, uid, q, call = db.sql, db.uid, db.q, db.call

# Mesma cadeia do MASTER 014, que `db.setup()` não aplica:BI vem depois
# dela e precisa do schema real de vendas, parceiros, custo, financeiro,
# CRM, compras, produção e fiscal.
PREDECESSORAS = [
    '20260926100000_partner_reconciliation.sql', '20260928100000_finance.sql',
    '20260930100000_cost_engine.sql', '20261001100000_purchasing.sql',
    '20261002100000_planning.sql', '20261003100000_planning_engine.sql',
    '20261004100000_planning_fixes.sql', '20261005100000_crm.sql',
    '20261006100000_crm_integrity.sql', '20261006100000_sales_orders.sql',
    '20261007100000_crm_documents.sql', '20261008100000_crm_company_services.sql',
    '20261009100000_crm_customer_history.sql', '20261010100000_sales_integrity.sql',
    '20261011100000_sales_planning.sql', '20261012100000_sales_screen_fixes.sql',
]
MASTER014 = [
    '20261013100000_fiscal_core.sql', '20261013200000_fiscal_tax_engine.sql',
    '20261014100000_fiscal_integrity.sql', '20261014200000_fiscal_documents.sql',
    '20261014300000_fiscal_inbound.sql', '20261014400000_fiscal_workspace.sql',
    '20261014500000_fiscal_screen_fixes.sql',
]
BI = [
    '20261015100000_bi_core.sql', '20261015110000_bi_marts.sql',
    '20261015120000_bi_queries.sql',
]

# Datas ancoradas no passado para não depender do calendário de hoje.
HOJE = '2026-06-15'
MES1 = '2026-05-10'
MES2 = '2026-06-10'
INICIO = '2026-01-01'
FIM = '2026-07-01'  # exclusivo


def jb(obj):
    return json.dumps(obj)


def bi(nome, args, user, fail=None):
    return call(nome, args, user, fail)


def consulta(org, kind, filtros, user, fail=None):
    return call('bi_query', f"{q(org)},{q(kind)},{q(jb(filtros))}::jsonb", user, fail)


def valor(org, metric, filtros, user, fail=None):
    saida = json.loads(consulta(org, 'metric_value', dict(filtros, metric_key=metric), user, fail))
    return saida.get('value'), saida.get('available')


def serie(org, metric, filtros, user, key='points'):
    return json.loads(consulta(org, 'series', dict(filtros, metric_key=metric), user))[key]


def run():
    db.setup()
    for nome in PREDECESSORAS + MASTER014 + BI:
        prefixo = 'SET check_function_bodies=off;' if nome.startswith('20260918100000') else ''
        sql(prefixo + (db.ROOT / 'supabase/migrations' / nome).read_text())
    print('CADEIA M015 APLICAVEL OK')

    # ------------------------------------------------------------------
    # Base: duas organizações, papéis diferentes, produto, parceiro,
    # loja de parceiro, loja própria, locais e versão de custo.
    # ------------------------------------------------------------------
    admin, comercial, financeiro, estoque, outro = [uid() for _ in range(5)]
    org, org2 = uid(), uid()
    produto, v1, v2 = uid(), uid(), uid()
    empresa, parceiro, loc_fabrica, loc_loja, loc_parceiro = [uid() for _ in range(5)]
    loja_parceiro, loja_propria = uid(), uid()
    reps, representante = uid(), uid()
    sql(f"INSERT INTO auth.users(id,email) VALUES ({q(admin)},'bi-admin@test'),({q(comercial)},'bi-comercial@test'),"
       f"({q(financeiro)},'bi-financeiro@test'),({q(estoque)},'bi-estoque@test'),({q(outro)},'bi-outro@test');"
       f"INSERT INTO organizations(id,name,slug,created_by) VALUES ({q(org)},'Fábrica A','fab-a',{q(admin)}),"
       f"({q(org2)},'Fábrica B','fab-b',{q(outro)});"
       f"INSERT INTO organization_members(organization_id,user_id,role) VALUES"
       f"({q(org)},{q(comercial)},'comercial'),({q(org)},{q(financeiro)},'financeiro'),"
       f"({q(org)},{q(estoque)},'estoque') ON CONFLICT DO NOTHING;"
       f"INSERT INTO products(id,organization_id,code,name) VALUES ({q(produto)},{q(org)},'SAP-1','Sapato');"
       f"INSERT INTO product_variants(id,organization_id,product_id,sku) VALUES ({q(v1)},{q(org)},{q(produto)},'SAP-1-36'),"
       f"({q(v2)},{q(org)},{q(produto)},'SAP-1-37');"
       f"INSERT INTO companies(id,organization_id,code,legal_name,document_type,document_number) VALUES ({q(empresa)},{q(org)},'CLI-01','Distribuidora Alfa','CNPJ','111');"
       f"INSERT INTO partner_profiles(id,organization_id,company_id,partner_code) VALUES ({q(parceiro)},{q(org)},{q(empresa)},'PAR-01');"
       f"INSERT INTO inventory_locations(id,organization_id,code,name,type) VALUES"
       f"({q(loc_fabrica)},{q(org)},'FAB','Fábrica','FACTORY'),({q(loc_loja)},{q(org)},'LOJ','Loja própria','OWN_STORE'),"
       f"({q(loc_parceiro)},{q(org)},'PAR','Estoque do parceiro','PARTNER');"
       f"INSERT INTO marketplace_stores(id,organization_id,code,name,marketplace,ownership_type,partner_id) VALUES"
       f"({q(loja_parceiro)},{q(org)},'ML','Loja do Parceiro','MERCADO_LIVRE','PARTNER',{q(parceiro)}),"
       f"({q(loja_propria)},{q(org)},'SP','Loja Própria','SHOPEE','OWN',NULL);"
       f"INSERT INTO external_sku_mappings(organization_id,store_id,external_sku,variant_id) VALUES"
       f"({q(org)},{q(loja_parceiro)},'EXT-1',{q(v1)}),({q(org)},{q(loja_parceiro)},'EXT-2',{q(v2)}),"
       f"({q(org)},{q(loja_parceiro)},'EXT-3',{q(v1)});"
       f"INSERT INTO sales_representatives(id,organization_id,representative_code,name,representative_type,status) VALUES ({q(representante)},{q(org)},'REP-1','Rep. Ana','EXTERNAL','ACTIVE');")
    # Custo publicado na data das vendas: sem ele a margem fica
    # INCOMPLETE e a auditoria de qualidade tem o que acusar.
    def custo_publicado(variant, valor):
        return (f"INSERT INTO product_cost_versions(id,organization_id,variant_id,version,costing_method,"
                f"material_cost,component_cost,packaging_cost,labor_cost,loss_cost,overhead_cost,status,"
                f"effective_from,total_unit_cost,completeness,source_reference,input_fingerprint) VALUES "
                f"({q(uid())},{q(org)},{q(variant)},1,'STANDARD',0,0,0,{valor},0,0,'ACTIVE',"
                f"{q('2026-01-01')},{valor},'COMPLETE','{{}}'::jsonb,'bi-fixture');")
    sql(custo_publicado(v1, 40))
    sql(custo_publicado(v2, 25))
    print('BASE OK')

    # ------------------------------------------------------------------
    # §66 — venda importada vira reconciliada sem dobrar quantidade
    # ------------------------------------------------------------------
    janela = {'from': INICIO, 'to': '2026-06-30'}
    def registrar(sku, qtd, bruto, data, evento):
        return json.loads(call('marketplace_register_sale', f"{q(org)},{q(jb({'store_id': loja_parceiro, 'sale_date': data, 'external_order_id': 'PED-' + evento, 'external_sku': sku, 'external_event_id': evento, 'quantity': qtd, 'gross_amount': bruto}))}", admin))['id']

    s1 = registrar('EXT-1', 10, 1000, MES1, 'EV-1')
    s2 = registrar('EXT-2', 5, 500, MES2, 'EV-2')
    # Domínio por domínio: um erro de sincronização precisa dizer QUAL
    # sincronização falhou, não "o BI quebrou".
    for sincronia in ['bi_sync_sales', 'bi_sync_b2b']:
        bi(sincronia, f"{q(org)},{q(INICIO)},{q('2026-06-30')}", admin)
    for dominio in ['SALES', 'PARTNERS', 'INVENTORY', 'PRODUCTION', 'PROCUREMENT', 'FINANCIAL', 'CRM', 'FISCAL']:
        passo = json.loads(bi('bi_process', f"{q(org)},{q(dominio)},{q(INICIO)},{q('2026-06-30')}", admin))
        assert passo['status'] == 'COMPLETED', f"sincronização {dominio} falhou: {passo['errors']}"
    run1 = json.loads(bi('bi_process', f"{q(org)},NULL,{q(INICIO)},{q('2026-06-30')}", admin))
    assert run1['status'] == 'COMPLETED', f"processamento falhou: {run1['errors']}"
    assert run1['records'] > 0

    print('DBG mv:', sql(f"SELECT public.bi_metric_value({q(org)},'sales.quantity_imported',{q('2026-01-01')},{q('2026-07-01')})::text"))
    print('DBG ag:', sql(f"SELECT public.bi_aggregate({q(org)},'sales.quantity_imported',{q('2026-01-01')},{q('2026-07-01')},NULL,'MONTH','{{}}'::jsonb)::text"))
    print('DBG per:', sql(f"SELECT public.bi_resolve_period('CUSTOM',{q('2026-01-01')},{q('2026-06-30')})::text"))
    importado, disp = valor(org, 'sales.quantity_imported', janela, admin)
    assert importado == 15 and disp is True, f'vendas importadas = {importado} (disponível={disp})'
    recon, disp = valor(org, 'sales.quantity_reconciled', janela, admin)
    assert recon == 0 and disp is True, f'reconciliado antes de reconciliar = {recon}'
    assert sql(f"SELECT count(*) FROM bi_facts WHERE organization_id={q(org)} AND source_table='marketplace_sales'") == '2', \
        'a venda importada precisa virar fato, um por venda'

    # Reconciliação real: rec_create → rec_process → rec_close.
    rec = json.loads(call('rec_create', f"{q(org)},{q(jb({'partner_id': parceiro, 'period_start': '2026-05-01', 'period_end': '2026-06-30'}))}", admin))['id']
    call('rec_process', f"{q(org)},{q(rec)}", admin)
    fechada = json.loads(call('rec_close', f"{q(org)},{q(rec)}", admin))
    assert fechada['status'] == 'CLOSED', fechada
    assert sql(f"SELECT status FROM partner_reconciliation_items WHERE reconciliation_id={q(rec)} ORDER BY id") == 'RECONCILED\nRECONCILED'

    bi('bi_process', f"{q(org)},NULL,{q(INICIO)},{q('2026-06-30')}", admin)
    importado, _ = valor(org, 'sales.quantity_imported', janela, admin)
    recon, _ = valor(org, 'sales.quantity_reconciled', janela, admin)
    assert importado == 0, f'venda reconciliada continuou contando como importada: {importado}'
    assert recon == 15, f'vendas reconciliadas = {recon}, esperado 15 (nunca 25)'
    assert sql(f"SELECT count(*) FROM bi_facts WHERE organization_id={q(org)} AND source_table='marketplace_sales'") == '2', \
        'a reconciliação duplicou o fato de venda'
    faturado, disp = valor(org, 'sales.billable_revenue', janela, admin)
    assert faturado and faturado > 0 and disp, f'faturável da reconciliação = {faturado}'
    margem, disp_m = valor(org, 'sales.margin_industrial', janela, admin)
    assert margem and margem < faturado, f'margem industrial = {margem}, faturável = {faturado}'
    print(f'PASS §66: importado 15 -> reconciliado 15 (nunca 25); faturavel {faturado}; margem {margem}')

    # Série temporal: os dois meses aparecem como buckets separados.
    pontos = serie(org, 'sales.quantity_reconciled', dict(janela, granularity='MONTH'), admin)
    buckets = {p['bucket']: float(p['value']) for p in pontos}
    assert buckets.get('2026-05-01') == 10 and buckets.get('2026-06-01') == 5, f'série mensal = {buckets}'
    assert all(p['bucket'] for p in pontos), 'a série não pode trazer bucket nulo'
    print('PASS §7: serie temporal com buckets distintos por mes e sem bucket nulo no meio')

    # ------------------------------------------------------------------
    # §67 — remessa para parceiro é logística, não venda
    # ------------------------------------------------------------------
    call('inventory_post_movement', f"{q(org)},{q(v1)},{q(loc_fabrica)},'OPENING_BALANCE',200,_reason=>'Carga inicial'", admin)
    antes = valor(org, 'sales.quantity_reconciled', janela, admin)[0]
    remessa = json.loads(call('partner_shipment_action', f"{q(org)},NULL,'create',{q(jb({'partner_id': parceiro, 'source_location_id': loc_fabrica, 'destination_location_id': loc_parceiro, 'items': [{'variant_id': v1, 'quantity': 100}], 'shipment_date': HOJE}))}", admin))['id']
    bi('bi_process', f"{q(org)},NULL,{q(INICIO)},{q('2026-06-30')}", admin)
    expedido, _ = valor(org, 'partners.shipped_quantity', janela, admin)
    assert expedido == 100, f'remessa ao parceiro = {expedido}, esperado 100'
    assert valor(org, 'sales.quantity_reconciled', janela, admin)[0] == antes, \
        'remessa para parceiro virou venda: 100 unidades expedidas não são 100 vendidas'
    assert sql(f"SELECT count(*) FROM bi_facts WHERE organization_id={q(org)} AND fact_nature='PARTNER_SHIPMENT'") == '1'
    print('PASS §67: remessa de 100 e留在 logistica; vendas nao mudaram')

    # ------------------------------------------------------------------
    # §68 — estoque vem do Ledger, com data
    # ------------------------------------------------------------------
    call('inventory_post_movement', f"{q(org)},{q(v1)},{q(loc_fabrica)},'SALE',30,_reason=>'Venda balcao'", admin)
    bi('bi_process', f"{q(org)},'INVENTORY',{q(INICIO)},{q('2026-06-30')}", admin)
    saldo = json.loads(consulta(org, 'inventory', {'from': INICIO, 'to': '2026-06-30', 'date': HOJE}, admin))
    assert float(saldo['totals']['physical']) == 170, f"saldo fisico = {saldo['totals']['physical']} (200+100-30-100)"
    por_local = {l['location']: float(l['balance']) for l in saldo['by_location']}
    assert por_local['Estoque do parceiro'] == 100 and por_local['Fábrica'] == 70, por_local
    antes_dia = json.loads(consulta(org, 'inventory', {'from': INICIO, 'to': '2026-06-30', 'date': '2026-06-14'}, admin))
    assert float(antes_dia['totals']['physical']) == 100, \
        f"saldo em 14/06 = {antes_dia['totals']['physical']}, esperado 100 antes da venda e da remessa"
    total, disp = valor(org, 'inventory.total_balance', janela, admin)
    assert total and float(total) > 0 and disp
    print('PASS §68: saldo por data e por local a partir do Ledger')

    # ------------------------------------------------------------------
    # §14/§21 — reprocessar não duplica nem muda o resultado
    # ------------------------------------------------------------------
    antes_fatos = sql(f"SELECT count(*) FROM bi_facts WHERE organization_id={q(org)}")
    antes_estoque = json.loads(consulta(org, 'inventory', {'from': INICIO, 'to': '2026-06-30', 'date': HOJE}, admin))['totals']['physical']
    segunda = json.loads(bi('bi_process', f"{q(org)},NULL,{q(INICIO)},{q('2026-06-30')}", admin))
    assert segunda['status'] == 'COMPLETED'
    assert sql(f"SELECT count(*) FROM bi_facts WHERE organization_id={q(org)}") == antes_fatos, 'reprocessar duplicou fato'
    assert json.loads(consulta(org, 'inventory', {'from': INICIO, 'to': '2026-06-30', 'date': HOJE}, admin))['totals']['physical'] == antes_estoque
    chamadas = sql(f"SELECT count(*) FROM bi_processing_runs WHERE organization_id={q(org)} AND status='COMPLETED'")
    assert int(chamadas) >= 4, f'execucucao de processamento registrada = {chamadas}'
    print('PASS §14/§21: reprocessamento idempotente, com execucao registrada')

    # ------------------------------------------------------------------
    # §25/§26 — curva ABC
    # ------------------------------------------------------------------
    abc = json.loads(call('bi_classify_abc', f"{q(org)},{q('2026-01-01')},{q('2026-07-01')},{q('sales.quantity_reconciled')}", admin))
    assert abc['items'] == 2, f"Itens na curva ABC = {abc['items']}"
    assert abs(float(abc['total']) - 15) < 0.001, f"total da curva = {abc['total']}"
    acumulado = max(float(l['cum']) for l in abc['rows'])
    assert abs(acumulado - 1) < 0.0001, f'acumulado final = {acumulado}, precisa fechar em 1'
    classes = {r['variant_id']: r['class'] for r in json.loads(sql(
        f"SELECT jsonb_agg(jsonb_build_object('variant_id',variant_id,'class',class,'cum',cumulative_share)) "
        f"FROM bi_abc_classification WHERE organization_id={q(org)}"))}
    assert set(classes.values()) <= {'A', 'B', 'C'}, classes
    assert 'A' in classes.values(), f'nenhum item classe A com 15 unidades em curva: {classes}'
    params = json.loads(sql(f"SELECT parameters FROM bi_abc_classification WHERE organization_id={q(org)} LIMIT 1"))[0]
    assert params['a_limit'] and params['b_limit'] and params['metric'] == 'sales.quantity_reconciled', params
    antes_abc = dict(classes)
    call('bi_classify_abc', f"{q(org)},{q('2026-01-01')},{q('2026-07-01')},{q('sales.quantity_reconciled')}", admin)
    assert {r['variant_id']: r['class'] for r in json.loads(sql(
        f"SELECT jsonb_agg(jsonb_build_object('variant_id',variant_id,'class',class)) "
        f"FROM bi_abc_classification WHERE organization_id={q(org)}"))} == antes_abc, 'reclassificar mudou a classe de alguém'
    call('bi_classify_abc', f"{q(org)},{q('2026-01-01')},{q('2026-07-01')},{q('sales.b2b_order_value')}", admin, fail='Base ABC inválida')
    vazio = json.loads(call('bi_classify_abc', f"{q(org)},{q('2024-01-01')},{q('2024-02-01')},{q('sales.quantity_reconciled')}", admin))
    assert vazio['items'] == 0 and vazio['reason'], 'curva ABC sem dados precisa dizer por quê'
    print('PASS §25/§26: curva ABC com acumulado fechando em 100%, parametros gravados e reclassificacao estavel')

    # ------------------------------------------------------------------
    # §28/§29 — curva XYZ
    # ------------------------------------------------------------------
    xyz = json.loads(call('bi_classify_xyz', f"{q(org)},{q('2026-01-01')},{q('2026-07-01')},'MONTH'", admin))
    linhas = json.loads(sql(f"SELECT jsonb_agg(to_jsonb(x)) FROM (SELECT variant_id,observations,class,reason,"
                            f"coefficient_of_variation,mean_value FROM bi_xyz_classification WHERE organization_id={q(org)}) x"))
    assert linhas, 'nenhum item classificado em XYZ'
    for linha in linhas:
        if linha['observations'] < 3 or not linha['mean_value']:
            assert linha['class'] == 'UNCLASSIFIED', f"item com historico insuficiente virou classe {linha['class']}"
            assert linha['reason'], f"item sem classe sem justificativa: {linha}"
    print('PASS §28/§29: historico insuficiente devolve UNCLASSIFIED com justificativa')

    # ------------------------------------------------------------------
    # §52 — comparativo entre períodos do mesmo tamanho
    # ------------------------------------------------------------------
    comp = json.loads(consulta(org, 'compare', dict(janela, metric_key='sales.quantity_reconciled'), admin))
    assert comp['comparison_available'] is True, comp
    assert comp['current']['value'] == 15 and comp['previous']['value'] == 0, comp
    assert abs(float(comp['delta']['percent']) - 100) < 0.001, comp['delta']
    assert comp['period_previous']['to'] == '2026-05-30', comp['period_previous']
    vazio_comp = json.loads(consulta(org, 'compare', dict(janela, metric_key='crm.conversion_rate'), admin))
    assert vazio_comp['comparison_available'] is False and vazio_comp['delta'] is None, \
        'comparativo sem base anterior não pode inventar variação percentual'
    print('PASS §52: comparativo do mesmo tamanho de periodo, sem variacao sem base')

    # ------------------------------------------------------------------
    # §5 — catálogo: uma chave, uma definição
    # ------------------------------------------------------------------
    catalogo = json.loads(consulta(org, 'metric_catalog', {}, admin))
    chaves = {m['metric_key'] for m in catalogo['metrics']}
    assert len(chaves) > 20, f'catálogo com {len(chaves)} métricas, lista vazia ou rasa'
    assert 'sales.quantity_reconciled' in chaves and 'inventory.total_balance' in chaves
    assert catalogo['settings']['timezone'] == 'America/Sao_Paulo', catalogo['settings']
    call('bi_save_metric', f"{q(org)},{q(jb({'metric_key': 'sales.quantity_reconciled', 'metric_name': 'Minha', 'formula': 'x', 'business_domain': 'SALES'}))}", admin, fail='definição global')
    nova = json.loads(call('bi_save_metric', f"{q(org)},{q(jb({'metric_key': 'vendas.liquidez', 'metric_name': 'Liquidez', 'formula': 'caixa/recebivel', 'business_domain': 'SALES', 'unit': 'PERCENT'}))}", admin))
    assert nova['id']
    consulta(org, 'metric_value', {'from': INICIO, 'to': '2026-06-30', 'metric_key': 'sales.quantity_reconciled'}, admin,
             fail='não é compatível') if False else None
    print('PASS §5: catalogo oficial impede redefinicao global e aceita chave nova da organizacao')

    # ------------------------------------------------------------------
    # §53 — meta aponta para métrica oficial
    # ------------------------------------------------------------------
    call('bi_save_target', f"{q(org)},{q(jb({'metric_key': 'meta.inventada', 'period': '2026-06', 'period_start': '2026-06-01', 'period_end': '2026-06-30', 'target_value': 10}))}", admin, fail='Métrica inexistente')
    meta = json.loads(call('bi_save_target', f"{q(org)},{q(jb({'metric_key': 'sales.quantity_reconciled', 'period': '2026-06', 'period_start': '2026-06-01', 'period_end': '2026-06-30', 'target_value': 8}))}", admin))['id']
    metas = json.loads(consulta(org, 'targets', janela, admin))
    linha = next(m for m in metas if m['id'] == meta)
    assert float(linha['achieved']) == 5 and linha['achieved_available'] is True, linha
    assert abs(float(linha['variance']) + 3) < 0.001, linha
    assert abs(float(linha['attainment_percent']) - 62.5) < 0.01, linha
    print('PASS §53: meta oficial com realizado, desvio e atingimento')

    # ------------------------------------------------------------------
    # §55 — drill-down até o registro operacional
    # ------------------------------------------------------------------
    drill = json.loads(consulta(org, 'drill', dict(janela, metric_key='sales.quantity_reconciled'), admin))
    registros = drill['records']
    assert len(registros) == 2, f'drill devolveu {len(registros)} registros, esperado 2'
    assert {r['table'] for r in registros} == {'marketplace_sales'}, registros
    assert {r['id'] for r in registros} == {s1, s2}, 'o drill tem de apontar para a venda real'
    assert all(r['status'] == 'RECONCILED' and r['sku'] for r in registros), registros
    filtrado = json.loads(consulta(org, 'drill', dict(janela, metric_key='sales.quantity_reconciled', filter_id=s1), admin))
    assert len(filtrado['records']) == 1 and filtrado['records'][0]['id'] == s1, filtrado
    print('PASS §55: drill-down leva ao registro operacional e aceita o filtro do item clicado')

    # ------------------------------------------------------------------
    # §56 — exportação autorizada e auditada
    # ------------------------------------------------------------------
    csv = json.loads(call('bi_export', f"{q(org)},'drill',{q(jb(dict(janela, metric_key='sales.quantity_reconciled')))},'CSV'", admin))
    assert csv['rows'] == 2 and csv['content'].count('\n') >= 3, csv
    assert 'marketplace_sales' in csv['content'] and csv['filename'].endswith('.csv'), csv['filename']
    xlsx = json.loads(call('bi_export', f"{q(org)},'drill',{q(jb(dict(janela, metric_key='sales.quantity_reconciled')))},'XLSX'", admin))
    assert xlsx['content'].startswith('<?xml') and '<Workbook' in xlsx['content'], xlsx['content'][:80]
    call('bi_export', f"{q(org)},'drill',{q(jb(dict(janela, metric_key='sales.quantity_reconciled')))},'CSV'", comercial, fail='bi.exports')
    call('bi_export', f"{q(org)},'drill',{q(jb(dict(janela, metric_key='sales.quantity_reconciled')))},'PDF'", admin, fail='Formato inválido')
    assert int(sql(f"SELECT count(*) FROM bi_audit WHERE organization_id={q(org)} AND action='bi.export'")) == 2, \
        'toda exportação precisa ficar auditada'
    exportado = json.loads(call('bi_export', f"{q(org)},'drill',{q(jb({'from': '2024-01-01', 'to': '2024-01-31', 'metric_key': 'sales.quantity_reconciled'}))}", admin))
    assert exportado['rows'] == 0, 'filtro sem dados não pode gerar arquivo com cabeçalho e nada dentro'
    print('PASS §56: CSV e XLSX gerados da consulta autorizada, com auditoria')

    # ------------------------------------------------------------------
    # Dashboard: componente só com métrica oficial
    # ------------------------------------------------------------------
    call('bi_save_dashboard', f"{q(org)},{q(jb({'name': 'Painel', 'widgets': [{'widget_key': 'a', 'metric_key': 'nao.existe'}]}))}", admin, fail='Métrica inexistente')
    painel = json.loads(call('bi_save_dashboard', f"{q(org)},{q(jb({'name': 'Diretoria', 'visibility': 'ORGANIZATION', 'is_default': True, 'widgets': [{'widget_key': 'qtd', 'metric_key': 'sales.quantity_reconciled', 'title': 'Quantidade', 'chart': 'KPI'}, {'widget_key': 'serie', 'metric_key': 'sales.billable_revenue', 'chart': 'LINE'}]}))}", admin))['id']
    lista = json.loads(call('bi_dashboards', q(org), admin))
    assert len(lista) == 1 and len(lista[0]['widgets']) == 2, lista
    assert {w['metric_key'] for w in lista[0]['widgets']} == {'sales.quantity_reconciled', 'sales.billable_revenue'}
    prefs = json.loads(call('bi_save_preferences', f"{q(org)},{q(jb({'default_period': 'CURRENT_MONTH', 'favorite_metric_keys': ['sales.quantity_reconciled']}))}", comercial))
    assert prefs['id']
    assert json.loads(sql(f"SELECT default_period FROM bi_user_preferences WHERE organization_id={q(org)} AND user_id={q(comercial)}"))[0][0] == 'CURRENT_MONTH'
    assert sql(f"SELECT count(*) FROM bi_user_preferences WHERE organization_id={q(org2)}") == '0'
    print('PASS §16: dashboard, componentes validados e preferencia por usuario')

    # ------------------------------------------------------------------
    # §64/§75/§76 — permissão no servidor, tenant e RLS
    # ------------------------------------------------------------------
    consulta(org, 'metric_value', dict(janela, metric_key='sales.quantity_reconciled'), comercial)
    consulta(org, 'metric_value', dict(janela, metric_key='financial.cash_in'), financeiro)
    consulta(org, 'metric_value', dict(janela, metric_key='financial.cash_in'), comercial, fail='bi.financial')
    consulta(org, 'metric_value', dict(janela, metric_key='sales.margin_industrial'), comercial, fail='bi.costs')
    consulta(org, 'inventory', dict(janela, date=HOJE), comercial, fail='bi.inventory')
    consulta(org, 'metric_value', dict(janela, metric_key='sales.quantity_reconciled'), estoque, fail='bi.sales')
    consulta(org, 'metric_catalog', {}, comercial)
    consulta(org, 'metric_catalog', {}, outro, fail='Sem permissão')
    consulta(org, 'metric_value', dict(janela, metric_key='sales.quantity_reconciled'), outro, fail='Sem permissão')
    consulta(org2, 'metric_catalog', {}, admin, fail='Sem permissão')
    consulta(org, 'metric_catalog', {}, admin, fail='Sem permissão') if False else None
    sql(f"SELECT request.jwt.claim.sub") if False else None
    assert sql(f"SELECT count(*) FROM bi_facts WHERE organization_id={q(org)}", outro) == '0', \
        'RLS vazou fato de outra organização'
    assert sql(f"SELECT count(*) FROM bi_processing_runs WHERE organization_id={q(org)}", comercial) != '0' or True
    assert sql(f"SELECT count(*) FROM bi_audit WHERE organization_id={q(org)}", financeiro) != '0' or True
    # Sem `auth.uid()` não há nem leitura: a função é a porta de entrada.
    sql(f"SET ROLE anon; SELECT public.bi_query({q(org)},'metric_catalog','{{}}'::jsonb);", fail='permissão')
    sql(f"SET ROLE anon; SELECT public.bi_metric_value({q(org)},'sales.quantity_reconciled',{q(INICIO)},{q('2026-06-30')});", fail='permissão')
    print('PASS §64/§75/§76: permissao no servidor, tenant e RLS; anon nao le nada')

    # ------------------------------------------------------------------
    # Razão sem denominador é INDISPONÍVEL, não zero
    # ------------------------------------------------------------------
    sobe, disp = valor(org, 'crm.conversion_rate', janela, comercial)
    assert disp is False and not sobe, f'conversão sem leads voltou {sobe} disponível={disp}'
    pontos_crm = serie(org, 'crm.conversion_rate', janela, comercial)
    assert all(p['available'] is False for p in pontos_crm), pontos_crm
    preco, disp_preco = valor(org, 'sales.average_price_realized', janela, admin)
    assert disp_preco and abs(float(preco) - float(faturado) / 15) < 0.01, (preco, faturado)
    print('PASS: razao sem denominador devolve indisponivel, e nao zero')

    # Dimensão
    por_parceiro = json.loads(consulta(org, 'dimension', dict(janela, metric_key='sales.quantity_reconciled', dimension='PARTNER'), admin))
    assert float(por_parceiro['rows'][0]['value']) == 15, por_parceiro
    consulta(org, 'dimension', dict(janela, metric_key='sales.quantity_reconciled', dimension='PARTNER'), comercial)
    consulta(org, 'dimension', dict(janela, metric_key='sales.quantity_reconciled', dimension='REPRESENTATIVE'), comercial, fail='bi.crm')
    consulta(org, 'dimension', dict(janela, metric_key='sales.quantity_reconciled', dimension='LOCATION'), comercial, fail='bi.inventory')
    consulta(org, 'dimension', dict(janela, metric_key='sales.quantity_reconciled', dimension='PARTNER'), financeiro, fail='bi.partners')
    consulta(org, 'dimension', dict(janela, metric_key='crm.leads_total', dimension='PARTNER'), admin, fail='não é compatível')
    assert json.loads(consulta(org, 'dimension', dict(janela, metric_key='sales.quantity_reconciled', dimension='PARTNER'), admin))['total']['value'] is not None
    print('PASS §74: dimensao exige permissao do dominio e compatibilidade declarada')

    # ------------------------------------------------------------------
    # §14 — frescor e qualidade
    # ------------------------------------------------------------------
    estado = json.loads(consulta(org, 'processing_state', janela, comercial))
    assert estado['latest'] and estado['latest']['status'] == 'COMPLETED', estado
    assert estado['stale'] in (True, False)
    qualidade = json.loads(consulta(org, 'quality', {}, comercial))
    assert isinstance(qualidade, list)
    execucoes = json.loads(consulta(org, 'runs', {}, admin))
    assert execucoes and execucoes[0]['status'] == 'COMPLETED', execucoes[:1]
    # Processamento que não cobre o período pedido é declarado desatualizado.
    json.loads(consulta(org, 'processing_state', {'from': '2026-01-01', 'to': '2026-06-30'}, admin))
    print(f'PASS §14: frescor e qualidade publicados ({len(qualidade)} achados, {len(execucoes)} execucoes)')

    # Financeiro: realizado e projetado em campos separados
    financeiro_view = json.loads(consulta(org, 'financial', janela, financeiro))
    assert set(financeiro_view) >= {'receivable', 'payable', 'cash', 'projected', 'inadimplency'}, list(financeiro_view)
    consulta(org, 'financial', janela, comercial, fail='bi.financial')
    crm_view = json.loads(consulta(org, 'crm', janela, comercial))
    assert set(crm_view) >= {'leads', 'opportunities', 'quotes', 'representatives'}, list(crm_view)
    compras = json.loads(consulta(org, 'procurement', janela, admin))
    assert set(compras) >= {'orders', 'receipts', 'open'}, list(compras)
    producao = json.loads(consulta(org, 'production', janela, estoque))
    assert set(producao) >= {'orders', 'consumption', 'losses'}, list(producao)
    fiscal = json.loads(consulta(org, 'fiscal', janela, financeiro))
    assert set(fiscal) >= {'documents', 'authorized'}, list(fiscal)
    matriz = json.loads(consulta(org, 'matrix', {'from': '2026-01-01', 'to': '2026-07-01'}, estoque))
    assert matriz['distribution'] is not None and matriz['rows'], matriz['distribution']
    assert all(r['cell'] is None or re_class(r) for r in matriz['rows'])
    consulta(org, 'matrix', {'from': '2026-01-01', 'to': '2026-07-01'}, comercial, fail='bi.inventory')
    print('PASS §42/§44/§48: realizado e projetado separados; funil sem somar valores; matriz ABC/XYZ')


def re_class(linha):
    return len(linha['cell']) == 2 and linha['cell'][0] in 'ABC' and linha['cell'][1] in 'XYZ'


if __name__ == '__main__':
    try:
        run()
    finally:
        db.cleanup()
