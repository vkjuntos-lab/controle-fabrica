# MASTER 010 — Compras, Fornecedores, Recebimento e Reposição

Data: 24/09/2026. Continuação do MASTER 009 (Cost Engine), reutilizando parceiros/empresas
(MASTER 006), reconciliation (007), financeiro (008), Inventory Ledger (003) e a fundação (001/002).
Aplica **as mesmas decisões da casa**: tenant `organization_id`, RLS, RBAC central, Audit Log,
idempotência e estado explícito + imutável pós-postagem.

Regra mestra preservada: **custo ≠ preço ≠ receita ≠ recebimento**. Aprovado pedido não move
estoque; somente recebimento `POSTED` gera entrada de inventário (`PURCHASE_RECEIPT`), custo e
contas a pagar; somente devolução `POSTED` gera saída (`PURCHASE_RETURN`). Financeiro nasce da
postagem, nos parâmetros de `purchasing_settings`, jamais é inventado por este módulo.

## Implementado

- **Migration `supabase/migrations/20261001100000_purchasing.sql`** (nova, sem reescrever nenhuma
  publicada), com tabelas SELECT-only para `authenticated` (escrita apenas via RPCs) e arquitetura
  `purchasing_require`/`purchasing_permissions`/`purchasing_audit`/`purchasing_guard` idêntica aos
  módulos financeiro e de custos vizinhos:
  - Fornecedores: `supplier_profiles` (código único/condições/preferência) e `supplier_products`
    (catálogo com unidade de compra×inventário e `conversion_factor`). `supplier_save_company`
    cria `companies`+`company_roles` (`SUPPLIER`)+perfil+catálogo numa transação e **retorna o
    `company_id`** (detalhe consulta por `company_id` com `kind:'supplier'`); `supplier_product_save`
    (catálogo), `supplier_query` (dashboard/suppliers/supplier/products), `supplier_payables`.
  - Requisição: `purchase_requests`/`purchase_request_items`,
    `request_save`/`request_action submit|approve|cancel`/`request_query`. Aprovada e pedido criado
    ⇒ itens vão a `ORDERED`; cancelamento do pedido **restaura** a requisição.
  - Cotação: `quotations`/`quotation_suppliers`/`quotation_supplier_items` com premiação por item
    (`quotation_award`, motivo+responsável); `quotation_save`/`quotation_query`.
  - Pedido: `purchase_orders`/`po_query` (kinds `orders|order|candidates`) com `po_save`,
    `po_action` (`submit/approve/send/cancel`) com **segregação de aprovação** configurável
    (aprovador ≠ criador) e `po_receive`. Aprovado não move estoque.
  - Recebimento: `goods_receipts`/`goods_receipt_items` com `receipt_action inspect|post|cancel`,
    `receipt_query` e RPC voltando o `receipt`/`order`/`items`. Itens nascem aceitos; rejeitados no
    `inspect` não entram no saldo; `post` grava ledger (`PURCHASE_RECEIPT` IN, idempotência
    `PURCHASING:GR:<receipt>:<item>`), custo e financeiro. `OVER_RECEIPT` respeita
    `over_receipt_policy` (`BLOCK` com corte + WARNING ou `AUTH_OVERRIDE` com permissão) e itens
    `REJECTED` não viram saldo nem exceção.
  - Custo/frete: `purchasing_apply_cost_policy` (NONE/LAST_PURCHASE/STANDARD/AVERAGE) grava
    `purchase_receipt_costs` e **versões de custo** (MASTER 009) somente quando valor difere do
    ACTIVE e a data é posterior — nunca reescreve histórico; `freight_policy`
    (EXPENSE_SEPARATELY ou INCLUDE_IN_INVENTORY_COST com pró-rata proporcional por item).
  - Documento fiscal: `supplier_documents`/`supplier_document_items` (número único), 3-way match
    com o pedido (`document_action match|process|cancel`); divergência vira exceção
    (`document-exception`), nunca fabrica saldo. `payable_on` (`GOODS_RECEIPT`/`DOCUMENT`) decide
    quando `purchasing_create_payables` gera `account_payables` parcelada por `payment_terms`
    (`UNIQUE(org,source_type,source_id,installment)`, uma obrigação por pedido).
  - Devolução: `supplier_returns`/`return_save`/`return_action post|cancel`/`return_query`; `post`
    valida saldo e grava `SUPPLIER_RETURN` OUT idempotente (`PURCHASING:SR:<id>:<item>`).
  - Exceções: `purchase_exceptions` com `exception_action resolve|ignore|reopen` (resolution exige
    `purchase_exceptions.resolve`), `exception_query` kinds `exceptions|open`.
  - Reposição: `replenishment_policy` em `product_variants` + `replenishment_query` (sugestão
    REORDER_POINT/TARGET_STOCK/MANUAL, saldo + `open_qty` do pedido + `pending_req` da requisição,
    melhor fornecedor e lead time). **Sugere, nunca compra.**
  - Guards/RLS: imutabilidade de `POSTED`/`COMPLETED` por triggers; RLS de escrita sempre negada
    fora das RPCs (`permission denied` testado); auditoria `purchasing.*` (>15 eventos no cenário);
    RPCs `SECURITY DEFINER` com `REVOKE`+`GRANT` seletivo; permissões seedadas para `admin`/`gestor`
    (e produção com leitura de compras + criação de requisição).

- **Frontend** (`src/lib/purchasing/{types,functions}.ts` com 27 RPCs tipadas no
  `src/integrations/supabase/types.ts`; `src/components/purchasing/pages.tsx`; rotas
  `src/routes/_authenticated/`):
  - `/compras` (dashboard), `/compras/requisicoes`, `/compras/cotacoes` (+ `/$id` com premiação),
    `/compras/pedidos` (+ `/$id` com fluxo de ações e recebimento), `/compras/recebimentos`
    (+ `/$id` com inspeção por item e postagem), `/compras/devolucoes`, `/compras/documentos`,
    `/compras/excecoes`, `/compras/reposicao`, `/compras/configuracoes` e `/fornecedores`
    (+ `/$id` — Fornecedor 360).
  - `AppShell`: item **Compras** + sub-itens no menu Operação, com permissões `purchasing.read`/
    `suppliers.*`, módulo `compras` centralizado em `src/lib/rbac.ts` (31 chaves
    `purchasing.|suppliers.|purchase_*|quotation*|goods_receipts.*|supplier_returns.*|
    supplier_documents.*|purchase_exceptions.*`), 12 testes unitários de RBAC.

## Validação executada nesta continuação

Harness PostgreSQL isolado (`scripts/test-purchasing-db.py`, isolado como os demais) — **15/15 PASS**
executado nesta continuação. Doravante registrado como `npm run test:purchasing:db`:

- Fornecedores + catálogo: perfil criado na mesma transação, prazos herdados, conversão **rolo→m**.
- Requisição DRAFT→SUBMITTED→APPROVED; cotação multi-fornecedor + premiação por item.
- Pedido: aprovado **não gera movimento**; segregação de aprovação recusada; cancelamento restaura
  a requisição.
- Recebimento parcial 5/10 + inspeção + postagem = custo R$30/m com frete separado, 2 parcelas
  (30/60) somando 310, **sem duplicar** postagem; pedido COMPLETED e **1 obrigação** por pedido.
- Custo: histórico R$30→R$36 (versão 2, source `PURCHASE`); `AVERAGE` = (10·30+10·36+10·45)/30 = 37;
  custo igual **não** gera nova versão; conversão rolo 5m → movimento 10 un a R$12/m.
- Over-receipt: `AUTH_OVERRIDE` registra excesso e exceção `OVER_RECEIPT`.
- Documento: fatura idêntica → MATCHED→PROCESSED (1 obrigação); `PRICE_VARIANCE` bloqueia o
  processamento e a resolução humanizada libera.
- Devolução `PURCHASE_RETURN` OUT com validação de saldo (999 recusado).
- Reposição: `REORDER_POINT` sugere 8 un (polegar mínimo 8) com dashboard.
- RLS/permissões/tenância: produção lê via RPC, `admin` sem permissão é recusado; escrita direta na
  tabela é `permission denied`; UPDATE em `POSTED` é imutável; pedido `COMPLETED` imutável;
  15+ registros de auditoria.

Além do harness: **37 testes unitários** (Vitest, incluindo 12 de RBAC do módulo `compras`),
**TypeScript** (`tsc --noEmit` EXIT 0), **build** (`vite build`, routeTree regenerado com as 15
rotas de compras/fornecedores) e **lint** dos arquivos tocados (eslint EXIT 0) verificados. As
páginas de compras delegam ao `pages.tsx` e os pares lista+detalhe usam o mesmo padrão
`InventoryRoute` do estoque (Outlet + `useRouterState` checando o `routeId` do detalhe).

## Pendências

- Publicação da migration no Lovable Cloud e smoke test autenticado publicado (fornecedores →
  requisição → cotação → pedido → recebimento/inspação → postagem → documento → exceções →
  reposição), como nos módulos anteriores.
- Importador MASTER 005 (continua): pedidos de compra ainda são cadastrados manualmente.
- Seleção automática de fornecedor, MRP/APS e previsão assistida ficam para módulos futuros
  (reposição atual é sugestão conservadora por REORDER_POINT/TARGET_STOCK).

## Arquivos alterados nesta continuação

- `supabase/migrations/20261001100000_purchasing.sql`, `scripts/test-purchasing-db.py`
- `src/lib/purchasing/{types,functions}.ts`, `src/components/purchasing/pages.tsx`,
  `src/routes/_authenticated/compras/*` (13 rotas) e `_authenticated/fornecedores*`
- `src/integrations/supabase/types.ts` (27 RPCs), `src/lib/rbac.ts` + `src/lib/rbac.test.ts`
  (módulo `compras`, 31 chaves), `src/components/layout/app-shell.tsx` (menu Compras)
- `package.json` (script `test:purchasing:db`)
- Docs: `docs/business/{PURCHASING,SUPPLIERS,GOODS-RECEIPT,REPLENISHMENT}.md` (novos),
  `docs/handoff/PROJECT-STATE.md`, `docs/handoff/MASTER-010-VALIDATION.md` (este relatório)

Nenhuma migration publicada foi alterada.