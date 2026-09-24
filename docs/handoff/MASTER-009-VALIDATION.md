# MASTER 009 — Cost Engine, formação de preço, margens e rentabilidade

Data: 24/09/2026. Continuação direta do MASTER 008 (Financeiro), sobre parceiros, reconciliação,
produção, Inventory Ledger, Catálogo e fundação. Aplica **as mesmas decisões da casa**: tenant
`organization_id`, RLS, RBAC central, Audit Log, idempotência e sem postagem financeira/inventário
inventada por este módulo.

Regra mestra preservada: **custo ≠ preço ≠ receita ≠ recebimento**. O custo é calculado com dados
oficiais dos módulos anteriores; a formação de preço parte do custo; a rentabilidade usa o snapshot
imutável de cada venda. Nada aqui lança AR/despesa ou movimenta estoque por conta própria — a baixa
do parceiro continua nascendo da reconciliação (MASTER 007).

## Implementado

- **Migration `supabase/migrations/20260930100000_cost_engine.sql`** (novas, sem reescrever nenhuma
  publicada):
  - `material_cost_versions` (custo de matéria-prima/componente/embalagem versionado por data),
    `labor_rates` (custo-hora por atividade), `overhead_rules` (rateio PER_UNIT / percentual / hora),
    `cost_routing_steps` (tempo padrão por BOM), `production_labor_entries` (apontamento real de mão
    de obra, idempotente), `cost_calculation_runs`, `product_cost_versions` (STANDARD e
    ACTUAL_PRODUCTION, COMPLETE/INCOMPLETE, status DRAFT/ACTIVE/SUPERSEDED/ARCHIVED),
    `pricing_variable_rules` (despesas variáveis por canal/loja/variante), `profitability_settings`,
    `sale_economics` (valores efetivos com proveniência) e `sale_cost_snapshots` (snapshot imutável
    COST+preço+deduções por venda).
  - Preços: reutiliza `price_tables`/`price_table_items`/`partner_price_links` (MASTER 007), evoluiu
    com colunas `channel`, `approved_by`, `approved_at`, `minimum_price` e índice de vigência
    `price_item_effective` — **um sistema de preço, não um paralelo**.
  - `cost_require` (permissão), `cost_audit` (auditoria `cost_engine`), `cost_guard` (imutabilidade
    fora do fluxo), `cost_save_input` (entradas de custo, incluindo conversão oficial de unidade —
    nunca fator implícito), `cost_compute`/`cost_calculate` (cálculo com deduplicação por
    `input_fingerprint`, simulação isolada), `cost_version_action` (approve/publish/archive com
    inviolabilidade), `cost_query` (dashboard, opções, materiais, mão de obra, rateios, roteiro,
    apontamentos, execuções, versões, regras, economics, tabelas, vendas, snapshots, rentabilidade
    agrupada com paginação no banco, impacto de reajuste e comparativo real × padrão).
  - `pricing_math` (fórmula única: MARKUP / margin sobre preço / margem-alvo com deduções),
    `pricing_simulate`, `pricing_publish` (versão de preço por vigência, fecha janela anterior),
    `cost_capture_sale`/`cost_on_reconciliation_close` (snapshot por venda; parceiro usa o
    **billable** do fechamento, não o gross do marketplace), `profitability_capture`.
  - Triggers/RLS: todas as tabelas novas com política de leitura por permissão e guard de
    imutabilidade; helpers `cost_*` privados com `REVOKE` + `GRANT` seletivo das RPCs públicas;
    `cost_price` de `product_variants` revogado de escrita/leitura (campo legado preservado sem API
    de custo paralela); `price_tables/items/links` continuam imutáveis fora das RPCs.
  - Permissões seedadas para `admin`/`gestor`: `costs.*`, `pricing.*`, `profitability.read/export`.

- **Frontend** (`src/lib/costs/{types,functions}.ts`, `src/components/costs/{shared,pages,commercial}.tsx`,
  rotas `src/routes/_authenticated/{custos/*, precificacao/*, relatorios/*}`):
  - `/custos` (dashboard e entradas), `/custos/insumos` (materiais/componentes/embalagem),
    `/custos/producao` (mão de obra + apontamentos), `/custos/versoes` (padrão vs real),
    `/custos/calcular`, `/custos/simulador` (isolado), `/custos/impacto` (reajuste de material),
    `/custos/simulador`; `/precificacao` (regras variáveis, simulação e tabelas de preço),
    `/relatorios/rentabilidade` (consolidado por produto/variante/loja/parceiro/canal).
  - Menu do `AppShell` com permissões `costs.read`, `pricing.read` e módulo RBAC centralizado em
    `src/lib/rbac.ts`.

## Validação executada nesta continuação

O harness PostgreSQL isolado (`scripts/test-costs-db.py`) havia falhado — o MASTER 009 **não estava
terminado**. Foram corrigidos:

1. **Migration — `cost_save_input` (conversão)**: subconsulta de unidades usava `id` ambíguo
   (variável PL/pgSQL × coluna) → `#id estourou`; corrigido com `public.units_of_measure.id`.
2. **Migration — `cost_save_input` (economics)**: gravava `_data->>'reason'` numa coluna NOT NULL
   `source_reference` (payload da UI/teste é `source_reference`) → corrigido para
   `_data->>'source_reference'`.
3. **Teste — aprovação de custo incompleto**: mensagem real do banco é
   "Somente custo completo em rascunho pode ser aprovado." (comportamento correto); o cenário
   buscava a substrings `incompleto` → alinhado para `completo`.
4. **Teste — cenário retrospectivo do parceiro**: saldo inicial do parceiro postado em 24/09 para
   venda em 15/03 gerava `INSUFFICIENT_PARTNER_STOCK` legítima → movimento datado em `2026-03-01`.
5. **Teste — vínculo de preço**: `price_link_partner` sem `valid_from` assumia `current_date`
   (24/09), fazendo a venda de 15/03 cair no fallback do gross → vínculo datado em `2026-01-01`.

Com isso o harness passa de ponta a ponta:

- BOM 10+5+2 + mão de obra (12min × 40/h) + overhead 5 = **30**, deduplicação por fingerprint,
  approvação só de completo e publicação sem reescrever vigência.
- Sucata 20+5% → perda 1; material sem custo bloqueia; conversão de unidade oficial (rolo 50m → m);
  simulação isolada não grava versão e exige flag.
- MARKUP 2,5× → 100; margem sobre preço → 50%/markup 2; contribuição marketplace 30 com
  comissão/taxa/frete; margem-alvo 30% → preço 100; margem + deduções ≥ 100% recusada.
- Produção real: consumo 360×10 + 80×5 overhead = 4000; bom 80 → **50/un** (planejado 100
  ignorado).
- COGS de janeiro = 40 fixo em `sale_cost_snapshots` apesar do custo de março subir a 45 e o preço
  da loja ir a 120; contribuição própria 30; snapshot imutável (UPDATE negado).
- Fechamento de parceiro: **billable 80** (tabela vinculada) − COGS 45 = margem/contribuição 35
  (o gross 150 não é usado); close idempotente; reopen gera novo snapshot; consultas agrupadas no banco.
- RLS/tenant: usuário de outro tenant, papel produto/comercial e acesso por ID direto não leem
  custos, não simulam, não escalam como administrador (`cost_compute`/coluna `cost_price` negados);
  cross-tenant negado; nenhuma escrita direta em `price_table_items`; audit_log de `cost_engine` > 10.
- Contratos `impact` (reajuste), `comparison` (real × padrão) e `snapshot`.

Além do harness: **35 testes unitários** (Vitest), **TypeScript**, **build** e **lint** do domínio
verificados. Script registrado como `npm run test:costs:db`.

## Pendências

- Publicação da migration no Lovable Cloud e smoke test autenticado publicados.
- Importador automático MASTER 005 (continua) — o snapshot de venda própria depende de vendas
  manuais enquanto o importador não existe.
- Cobrança/pagamento (AR) consumindo o `PARTNER_RECONCILIATION_CLOSED` + snapshot (MASTER 008
  prepara o schema; o consumo pelo fechamento ainda é manual).
- Análise de anexos e ajustes de perda de matéria-prima por evento de produção ainda não são
  explorados pela Cost Engine (inputs atuais são os previstos).

## Arquivos alterados nesta continuação

- `supabase/migrations/20260930100000_cost_engine.sql` (correções 1–2 acima)
- `scripts/test-costs-db.py` (correções 3–5)
- `package.json` (script `test:costs:db`)
- `docs/handoff/PROJECT-STATE.md`, `docs/handoff/MASTER-009-VALIDATION.md` (este relatório)

Código e rotas do MASTER 009 já estavam no checkout e foram verificados/estabilizados aqui;
nenhuma migration publicada foi alterada.