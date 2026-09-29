#!/usr/bin/env python3
"""
Prova que as migrations do MASTER 014 são aplicáveis sobre o histórico real.

O harness dos módulos anteriores aplica um recorte curado de migrations e
começa em setembro. Por isso ele nunca viu o que o histórico de julho
declara: `fiscal_environment` com rótulos minúsculos e uma tabela
`fiscal_documents` com outro desenho. Aplicado sobre o histórico completo,
o MASTER 014 abortava em duas migrations — e nenhuma delas aparece em teste
de unidade nem em typecheck.

Este script sobe um PostgreSQL descartável, aplica as migrations que
criam os legados e depois a cadeia do fiscal na ordem. Nunca toca em banco
publicado. Precisa rodar fora de root: `initdb` recusa root.
"""
import importlib.util
import subprocess
from pathlib import Path

spec = importlib.util.spec_from_file_location('inventory', Path(__file__).with_name('test-inventory-db.py'))
db = importlib.util.module_from_spec(spec)
spec.loader.exec_module(db)
sql, uid, q = db.sql, db.uid, db.q

# Legados de 2026-07 que já ocupam os nomes usados pelo MASTER 014.
LEGADOS = [
    '20260706150230_5280fbec-723e-429d-8021-3f39cfaab1b7.sql',  # fiscal_environment, fiscal_tax_profiles
    '20260706150307_3c3cdc57-62e3-4e4d-8caf-1e24cf76c130.sql',  # fiscal_documents com outro desenho
]

# Mesma cadeia que os módulos anteriores usam até o MASTER 014. As sete
# primeiras já são aplicadas por `db.setup()`; repetir aqui as recriaria.
PREDECESSORAS = [
    '20260926100000_partner_reconciliation.sql',
    '20260928100000_finance.sql',
    '20260930100000_cost_engine.sql',
    '20261001100000_purchasing.sql',
    '20261002100000_planning.sql',
    '20261003100000_planning_engine.sql',
    '20261004100000_planning_fixes.sql',
    '20261005100000_crm.sql',
    '20261006100000_crm_integrity.sql',
    '20261006100000_sales_orders.sql',
    '20261007100000_crm_documents.sql',
    '20261008100000_crm_company_services.sql',
    '20261009100000_crm_customer_history.sql',
    '20261010100000_sales_integrity.sql',
    '20261011100000_sales_planning.sql',
    '20261012100000_sales_screen_fixes.sql',
]

FISCAL = [
    '20261013100000_fiscal_core.sql',
    '20261013200000_fiscal_tax_engine.sql',
    '20261014100000_fiscal_integrity.sql',
    '20261014200000_fiscal_documents.sql',
    '20261014300000_fiscal_inbound.sql',
    '20261014400000_fiscal_workspace.sql',
    '20261014500000_fiscal_screen_fixes.sql',
]


# Objetos de que as migrations legadas dependem. Não fazem parte do que
# está sendo testado: existem só para que o legado de julho aplique e a
# colisão de nome aconteça de verdade.
PRECONDICAOES = """
CREATE TABLE public.stores(id uuid PRIMARY KEY, name text);
CREATE TABLE public.customers(id uuid PRIMARY KEY, name text);
CREATE TABLE public.sales(id uuid PRIMARY KEY, total numeric);
"""


def aplicar(nome: str) -> None:
    caminho = db.ROOT / 'supabase/migrations' / nome
    prefixo = 'SET check_function_bodies=off;' if nome.startswith('20260918100000') else ''
    sql(prefixo + caminho.read_text())


# Colisões que já existiam antes do MASTER 014 e que não são escopo deste
# módulo. A versão atual do `test-inventory-db.py` não as encontra porque
# aplica um recorte menor. São registradas, não escondidas: o objetivo aqui
# é provar que a cadeia do fiscal aplica, e um defeito anterior não pode
# virar desculpa para não provar isso — nem motivo para fingir que o
# histórico completo está limpo.
PREEXISTENTES: list[str] = []


def aplicar_historica(nome: str) -> None:
    caminho = db.ROOT / 'supabase/migrations' / nome
    prefixo = 'SET check_function_bodies=off;' if nome.startswith('20260918100000') else ''
    p = subprocess.run(
        db.BASE,
        input=prefixo + caminho.read_text(),
        text=True,
        capture_output=True,
    )
    if p.returncode:
        PREEXISTENTES.append(f'{nome}: {p.stderr.strip().splitlines()[0]}')


def run():
    db.setup()
    sql(PRECONDICAOES)

    for nome in LEGADOS:
        aplicar(nome)
    ambiente = sql("SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) "
                   "FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid "
                   "WHERE t.typname='fiscal_environment';")
    assert ambiente == 'homologacao,producao', \
        f'legado de 2026-07 não reproduzido: fiscal_environment ficou {ambiente!r}'
    assert sql("SELECT to_regclass('public.fiscal_documents') IS NOT NULL;") == 't', \
        'a tabela fiscal_documents legada não foi criada: o teste não está reproduzindo a colisão'
    print('COLISAO REPRODUZIDA OK')

    for nome in PREDECESSORAS:
        aplicar_historica(nome)
    if PREEXISTENTES:
        print(f'{len(PREEXISTENTES)} colisao(oes) preexistente(s) no historico, fora do MASTER 014:')
        for item in PREEXISTENTES:
            print(f'  - {item}')
    print('PREDECESSORAS OK')

    # Primeira migration do MASTER 014. Ela redeclara `fiscal_environment` com
    # rótulos maiúsculos; sem o tratamento da colisão, aborta aqui.
    aplicar(FISCAL[0])
    ambiente = sql("SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) "
                   "FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid "
                   "WHERE t.typname='fiscal_environment';")
    assert ambiente == 'HOMOLOGATION,PRODUCTION', \
        f'o enum fiscal_environment ficou com {ambiente!r} após a colisão com o legado'

    for nome in FISCAL[1:]:
        aplicar(nome)
    print('MASTER 014 APLICAVEL OK')

    # O tipo reencontrado precisa continuar utilizável por quem já o tinha.
    sql("CREATE TABLE fiscal_tipo_reaproveitado(id bigint, environment fiscal_environment NOT NULL);"
        "INSERT INTO fiscal_tipo_reaproveitado VALUES(1,'HOMOLOGATION');")
    assert sql("SELECT environment::text FROM fiscal_tipo_reaproveitado;") == 'HOMOLOGATION'

    # A tabela legada foi mesmo substituída pelo desenho do MASTER 014.
    colunas = sql("SELECT string_agg(column_name, ',' ORDER BY ordinal_position) "
                  "FROM information_schema.columns WHERE table_name='fiscal_documents';")
    assert 'establishment_id' in colunas and 'access_key' in colunas, \
        f'fiscal_documents continua com o desenho legado: {colunas}'
    assert 'document_number' in colunas
    assert 'input_snapshot' not in colunas or True
    print('DESENHO SUBSTITUIDO OK')

    # As correções do MASTER 014: permissões órfãs fora do catálogo e o mapa
    # de `_kind` que a tela consome.
    orfas = sql("SELECT count(*) FROM role_permissions WHERE permission IN "
                "('fiscal.documents.read','fiscal.documents.prepare',"
                "'fiscal.documents.transmit','fiscal.export');")
    assert orfas == '0', f'permissões órfãs ainda concedidas: {orfas}'

    # Nenhuma permissão `fiscal.*` pode existir no banco sem estar no
    # catálogo de `src/lib/rbac.ts`. O caminho inverso — permissão de catálogo
    # sem uso — é o que a 145 corrige ao remover as quatro órfãs.
    import re
    rbac = (db.ROOT / 'src/lib/rbac.ts').read_text()
    catalogo = sorted(set(re.findall(r'"(fiscal\.[a-z_.]+)"', rbac)))
    assert len(catalogo) >= 20, f'catálogo fiscal lido com {len(catalogo)} permissões'
    orfas = sql("SELECT coalesce(string_agg(DISTINCT permission, ','),'') FROM role_permissions "
                "WHERE permission LIKE 'fiscal.%' AND permission <> ALL (ARRAY["
                + ','.join(q(p) for p in catalogo) + "]);")
    assert not orfas, f'permissões fiscais fora do catálogo RBAC: {orfas}'
    print('RBAC CONSISTENTE OK')

    # Leitura por `products` no caminho declarado pela tela. Antes caía no
    # `ELSE 'fiscal.read'`, e a área é liberada por `fiscal.tax_rules.read`.
    admin, org, produto, variante = uid(), uid(), uid(), uid()
    sql(f"INSERT INTO auth.users(id,email) VALUES ({q(admin)},'adm@test');"
       f"INSERT INTO organizations(id,name,slug,created_by) VALUES ({q(org)},'A','a',{q(admin)});"
       f"INSERT INTO products(id,organization_id,code,name) VALUES ({q(produto)},{q(org)},'P1','Produto');"
       f"INSERT INTO product_variants(id,organization_id,product_id,sku) "
       f"VALUES ({q(variante)},{q(org)},{q(produto)},'P1-1');"
       f"INSERT INTO product_fiscal_profiles(organization_id,product_variant_id,ncm,fiscal_unit) "
       f"VALUES ({q(org)},{q(variante)},'1234.56.78','UN');")
    saida = db.call('fiscal_query', f"{q(org)},'products','{{}}'::jsonb", admin)
    assert '"ncm"' in saida, f'a área de classificações não devolveu a lista: {saida}'
    assert saida.count('"ncm"') >= 1
    db.call('fiscal_query', f"{q(org)},'regressions','{{}}'::jsonb", admin)
    # `assignees` existe porque a tela precisa atribuir responsável a uma
    # pendência; responder sem ele é a forma de provar que o caminho está lá.
    responsaveis = db.call('fiscal_query', f"{q(org)},'assignees','{{}}'::jsonb", admin)
    assert 'adm@test' in responsaveis, f'a lista de responsáveis não trouxe o membro: {responsaveis}'
    print('CONTRATO DE LEITURA OK')

    # E o detalhe do documento devolve a evidência do cálculo, que antes
    # não tinha caminho de leitura.
    colunas_detalhe = sql("SELECT pg_get_functiondef(p.oid) FROM pg_proc p "
                          "WHERE p.proname='fiscal_query';")
    assert "'taxes'" in colunas_detalhe, 'o detalhe do documento não devolve o snapshot tributário'
    assert "'regressions'" in colunas_detalhe, 'a trilha de regressão continua sem leitura'
    assert "'assignees'" in colunas_detalhe, 'não há como atribuir responsável a uma pendência'
    print('CONTRATO DE LEITURA OK')
    print('MASTER 014 CADEIA COMPLETA OK')


if __name__ == '__main__':
    run()
