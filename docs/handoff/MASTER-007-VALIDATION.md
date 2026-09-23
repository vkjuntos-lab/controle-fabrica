# MASTER 007 — Reconciliação de parceiros, vendas marketplace, regra comercial e fechamento

Data: 23/09/2026. Continuação sobre o MASTER 006 (parceiros), 003 (Inventory Ledger), 002 (Catálogo)
e 001 (fundação); nada anterior foi recriado. Nenhuma migration publicada foi alterada; nenhum
push/deploy foi feito. Este checkout não contém importação automática de marketplace (provedor
externo) — o registro de vendas é manual/estruturado com o mesmo contrato de um importador.

## IMPLEMENTADO

- **Marketplace**: `marketplace_stores` (ownership FACTORY/OWN/PARTNER; `partner_id` quando PARTNER),
  `marketplace_imports`/`marketplace_import_rows` (contrato de importação futura),
  `marketplace_sales` (gross/discount/fee/shipping, dedup por `external_event_id`/`import_key`,
  nunca toca estoque), `external_sku_mappings` (por loja ou global, com backfill de vendas).
- **Regra comercial e tabelas de preço**: `price_tables`, `price_table_items`, `partner_price_links`;
  `rec_resolve_price` (preço vigente na data da venda vence; sem tabela usa o líquido da venda).
- **Reconciliação**: `partner_reconciliations` (período por parceiro + frequência, snapshot final,
  `closed_at`, motivo de cancelamento/reabertura), `partner_reconciliation_items` (uma venda = um
  item; `posted` com baixa única e idempotente no ledger),
  `reconciliation_exceptions` (central de exceções com severidade/status/resolução/auditoria),
  `partner_reconciliation_adjustments` (crédito/débito com motivo), `domain_events`
  (público `PARTNER_RECONCILIATION_CLOSED`).
- **Fluxo completo**: preview (`rec_preview`), criação (`rec_create`), processamento em lote
  (`rec_process`) e por item (`rec_process_item`/`rec_reprocess_item`), resolução de exceção
  (`rec_exception_resolve`), ajuste (`rec_adjustment`), fechamento idempotente (`rec_close`),
  reabertura motivada (`rec_reopen`), cancelamento (`rec_cancel`), estorno de baixa por item
  (`rec_reverse_item`), consultas/dashboard posicional (`rec_query`).
- **Baixa única garantida**: `partner_reconciliation_items.posted` vira OUT
  `PARTNER_RECONCILIATION` com idempotência `rec-item:<id>`; reprocessar não duplica; estorno cria
  compensação IN. Restoration de estoque exigido antes de fechar (`rec_balance_asof`).
- **Imutabilidade**: `CLOSED` é histórico; venda tardia no período fechado vira
  `LATE_SALE_AFTER_CLOSING`; correção exige reabrir. Concorrência: fechamentos simultâneos terminam
  num único `CLOSED` (lock por organização + guards).
- **Auditoria** em todos os passos (`reconciliation_audit` → `audit_log`).
- **RBAC/RLS**: permissões `partner_reconciliation.{read,create,process,review,resolve_exception,
  close,reopen,reverse}` e `partner_pricing.{read,manage}` (+ `marketplace.manage`, `price.manage`
  já seedadas); RPCs SECURITY DEFINER validam organização e permissão; escritas diretas bloqueadas
  por RLS; RLS com isolamento de tenant testado.

## ALTERADO

`src/lib/rbac.ts` e `src/lib/rbac.test.ts` (permissões/rótulos M007 e testes), `src/lib/partners/
export.ts` (re-export dos tipos de reconciliação para o Parceiro 360), `src/components/partners/
pages.tsx` (abas Marketplaces/Vendas/Reconciliações/Fechamentos; correção de sintaxe herdada no fim
de `PartnerListPage`), `src/components/layout/app-shell.tsx` (item "Reconciliação parcerias" →
`/reconciliacao`, ícone Scale, `partner_reconciliation.read`), `src/integrations/supabase/types.ts`
(assinaturas `Functions` das 18 RPCs M007 adicionadas), `src/routeTree.gen.ts` (regenerado pelo
build), `package.json` (script `test:reconciliation:db`).

## ARQUIVOS CRIADOS

- `src/lib/reconciliation/` — `constants.ts`, `types.ts`, `reconciliation.functions.ts`, `export.ts`
- `src/components/reconciliation/` — `dialogs.tsx`, `pages.tsx`, `marketplace.tsx`, `pricing.tsx`
- Rotas `src/routes/_authenticated/reconciliacao/`: `index`, `periodos`, `periodos_.$id`,
  `vendas`, `excecoes`, `tabelas-preco`, `tabelas-preco_.$id`, `lojas`, `mapeamento`
- `docs/business/PARTNER-RECONCILIATION.md`, `docs/business/PARTNER-PRICING.md`,
  `docs/architecture/ADR-007-PARTNER-RECONCILIATION.md` (o SQL foi entregue na sessão anterior:
  `supabase/migrations/20260926100000_partner_reconciliation.sql`).

## MIGRATIONS E TABELAS

Migration: `20260926100000_partner_reconciliation.sql` (nova, posterior às de produção existentes).
Tabelas novas: `marketplace_stores`, `marketplace_imports`, `marketplace_import_rows`,
`marketplace_sales`, `external_sku_mappings`, `price_tables`, `price_table_items`,
`partner_price_links`, `partner_reconciliations`, `partner_reconciliation_items`,
`reconciliation_exceptions`, `partner_reconciliation_adjustments`, `domain_events`.
Nenhuma tabela de saldo de parceiro foi criada — estoque continua derivado do Inventory Ledger.

## FUNCTIONS / RPCs

Infra: `reconciliation_require`, `reconciliation_audit`, `reconciliation_guard`,
`reconciliation_guard_relations`, `reconciliation_insert_exception`, `rec_balance_asof`,
`rec_resolve_price`, `rec_sale_net`, `rec_eligible_sales`, `rec_preview`, `rec_query`.
Fluxo: `rec_create`, `rec_process_item`, `rec_process`, `rec_reprocess_item`, `rec_exception_resolve`,
`rec_adjustment`, `rec_close`, `rec_reopen`, `rec_cancel`, `rec_reverse_item`.
Marketplace: `marketplace_save_store`, `marketplace_save_mapping`, `marketplace_register_sale`,
`marketplace_cancel_sale`. Preço: `price_save_table`, `price_save_item`, `price_link_partner`.
Reutilizadas: `inventory_lock`, `inventory_get_balance` e o núcleo privado do ledger.

## ROTAS

`/reconciliacao` (dashboard), `/reconciliacao/periodos` (+ `/periodos/$id` com abas Itens/Exceções/
Ajustes/Consolidado), `/reconciliacao/vendas` (registrar/cancelar), `/reconciliacao/excecoes`,
`/reconciliacao/tabelas-preco` (+ `/tabelas-preco/$id`), `/reconciliacao/lojas`,
`/reconciliacao/mapeamento`. Menu de Operação do `AppShell` + Parceiro 360 (abas Vendas/
Reconciliações/Fechamentos e Marketplaces com lojas reais).

## PERMISSÕES E RLS

`partner_reconciliation.read/create/process/review/resolve_exception/close/reopen/reverse`;
`partner_pricing.read/manage`; `marketplace.manage` e `price.manage` (já existentes). RLS nas 13
tabelas; RPCs SECURITY DEFINER validam `auth.uid()`, organização, referências e permissão específica.
Triggers bloqueiam exclusão/edição de fatos (venda validada/reconciliada, item postado, exceção
resolvida, período fechado).

## TESTES

- `bun run test`: 33 testes unitários passaram (RBAC com M007 incluso).
- `bun run typecheck`: TypeScript verificado.
- `bun run build`: compilação de produção verificada (regenerou `routeTree.gen.ts`).
- `bun run test:reconciliation:db`: PostgreSQL local temporário, **12 grupos passaram**: remessa vs
  venda e mapeamento SKU idempotente; registro/dedup e sem efeito de estoque; preview + DRAFT sem
  postar; exceção `SKU_NOT_MAPPED`, regra comercial e reprocess sem baixa duplicada; tabela de preço
  vencendo, reprocess pós-backfill e fechamento idempotente/imutável; reabertura + ajuste crédito +
  re-fechamento (3×25+10=160); estorno de item restaurando estoque e re-close; venda tardia e guard
  de sobreposição; stock insuficiente bloqueando close e resolução sem fabricar saldo; RBAC/RLS e
  papeis read-only; guardas de venda imutável e dashboard; fechamento concorrente em único `CLOSED`.
- `bun run test:partners:db` e `bun run test:inventory:db`: regressões completas passaram com a nova
  migration aplicada.
- Lint: arquivos do domínio verificados com `eslint --fix` (o lint do repositório inteiro excede
  300 s e não foi usado como gate).

Os harnesses rodam como usuário não root (`initdb` recusa root): `su - claude-runner -c "cd
'<raiz-do-projeto>' && python3 scripts/test-reconciliation-db.py"`.

## LIMITAÇÕES E PENDÊNCIAS

- Banco publicado não alterado nesta sessão; implantação do SQL via fluxo do projeto e smoke test
  autenticado no Lovable Cloud permanecem pendentes (validação local concluída).
- Importação automática de relatórios de marketplace (provedores reais) não existe; o registro é
  manual com o mesmo contrato. O vínculo MASTER 005 (ownership_type PARTNER ↔ loja) continua sendo o
  conector; não há noutra loja de posse própria/terceirizada.
- Financeiro, geração de cobrança/AR, pagamento, limite de crédito, condições de pagamento e NF não
  fazem parte; o fechamento gera snapshot + `PARTNER_RECONCILIATION_CLOSED` para o consumidor
  futuro desse domínio.
- Ajustes pós-fechamento exigem reabertura; não há workflow de anulação/refinanciamento automático.
- Sem upload/lista de anexos em `partner-documents` (preparação pronta no MASTER 006).

## PRÓXIMO DOMÍNIO

Financeiro de parceiros: consumir o snapshot/evento do fechamento para gerar cobrança (AR), registrar
pagamento e fechar o ciclo — absorvendo também venda 005/importação automática e produção conectada ao
ledger.