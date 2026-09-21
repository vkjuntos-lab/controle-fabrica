# MASTER 003 — Entrega e validação local

Data: 21/09/2026. Continuação do projeto existente; sem recriar fundação, catálogo, autenticação,
roles ou Design System. Nenhuma migration publicada foi alterada. Nenhum push/deploy foi feito.

## IMPLEMENTADO

- Ledger oficial imutável, saldo exclusivamente derivado de POSTED, entradas/saídas positivas
  com direção explícita, abertura, ajustes com motivo e estornos compensatórios.
- Localizações, posição por localização, visão em terceiros e tipos PARTNER/TRANSIT existentes
  preservados. Remessa só altera posição; não cria venda, receita ou conta a receber.
- Transferência/remessa transacional, lote preservado nas duas pernas, validação de saldo por lote,
  idempotência com comparação de payload e estorno integral da operação.
- Contagem transacional por lote, bloqueio da localização, confirmação explícita dos ajustes,
  itens não contados ignorados com aviso, leitura barcode por teclado/leitor físico, cartões mobile.
- Busca por produto/SKU/barcode, categorias/status, agrupamento por produto/localização,
  paginação no banco, zeros reais e dashboard quantitativo. CSV da posição exporta todas as
  páginas filtradas; CSV de movimentos identifica que exporta somente a página exibida.
- Filtros de movimentos por período, tipo, direção, variante, localização, usuário e status;
  entradas/saídas, referência e usuário na tabela. Detalhes mostram vínculos de estorno.
- Estoque negativo exige configuração organizacional e permissão específica, com aviso e auditoria.
- Antes/depois em toda postagem; auditoria de localização/configuração transacional. Rejeições
  nas server functions são auditadas separadamente quando o solicitante é membro do tenant.

## ALTERADO

`src/lib/inventory/inventory.functions.ts`, `ledger.ts`, `ledger.test.ts`, `src/lib/rbac.ts`,
`src/integrations/supabase/types.ts`, diálogos de movimento/transferência, telas de posição,
contagem, inventários, movimentos, detalhe de movimento e terceiros; scripts de verificação em
`package.json`; `docs/business/INVENTORY.md` e `docs/handoff/PROJECT-STATE.md`.

## ARQUIVOS CRIADOS

- `supabase/migrations/20260923100000_inventory_workflows.sql`
- `scripts/test-inventory-db.py`
- `src/components/inventory/barcode-input.tsx`
- `src/components/inventory/operational-summary.tsx`
- `docs/handoff/MASTER-003-VALIDATION.md`

## MIGRATIONS E TABELAS

Migration nova: `20260923100000_inventory_workflows.sql`, posterior à migration preparatória de
produção já existente. Seu guard preserva suporte a unidades e fecha o bypass de negativo por
reversão. Nenhuma nova tabela concorrente de saldo.

Tabelas reutilizadas: `inventory_locations`, `inventory_movements`, `inventory_batches`,
`inventory_transfers`, `inventory_transfer_items`, `inventory_counts`, `inventory_count_items`,
`organization_inventory_settings`, `products`, `product_variants`, `audit_log`.
Adições nesta migration: `inventory_transfers.request_payload`, `inventory_transfer_items.batch_id`.
Views existentes preservadas: `inventory_balances`, `inventory_positions`.

## FUNCTIONS / RPCs

Novas: `inventory_post_movement_internal` (privada), `inventory_read_count`,
`inventory_search_variants`, `inventory_list_counts`, `inventory_actor_options`,
`inventory_audit_catalog` (trigger).

Atualizadas: `inventory_post_movement`, `inventory_post_transfer`, `inventory_complete_count`,
`inventory_start_count`, `inventory_guard_movement`. Reutilizadas: `inventory_get_balance`,
`inventory_reverse_movement`, `inventory_save_count_item`, `inventory_cancel_count`,
`inventory_query_positions`, `inventory_dashboard`, `inventory_lock` e guard de tenant.

## ROTAS

`/estoque`, `/estoque/locations`, `/estoque/movimentacoes`, `/estoque/movimentacoes/$id`,
`/estoque/transferencias`, `/estoque/terceiros`, `/estoque/inventarios`, `/estoque/inventarios/$id`.
Não foi criado outro layout ou mecanismo de autenticação.

## PERMISSÕES E RLS

`inventory.read`, `inventory.movements.read`, `inventory.move`, `inventory.adjust`,
`inventory.transfer`, `inventory.count`, `inventory.opening_balance`, `inventory.reverse`,
`inventory.manage_locations`, `inventory.allow_negative`.

Permissões conferidas no banco por RPC/trigger e no servidor; organization_id obrigatório.
RPCs SECURITY DEFINER de leitura validam permissão no tenant antes da consulta. Escrita direta
no ledger é negada a authenticated. O helper privado não tem EXECUTE para authenticated/anon/PUBLIC.
RLS foi exercitada como authenticated com duas organizações, inclusive consulta direta por ID/tenant.

## TESTES

- `npm test`: 30 testes unitários passaram (12 do ledger).
- `npm run test:inventory:db`: PostgreSQL local temporário, nove grupos de verificação passaram:
  aritmética e aceite 70/10/20; negativo/permissões/RLS/imutabilidade; retries/rollback;
  concorrência real; contagem; barcode/auditoria; referências reservadas/negativo autorizado;
  lotes/estorno integral; consultas acima de mil SKUs.
- `npm run typecheck`: TypeScript verificado.
- `npm run build`: compilação de produção verificada.
- ESLint dos arquivos do domínio modificados: sem erros ou avisos.
- `git diff --check`: sem erros de whitespace.

Cenário de aceite: Sapatilha Ballet, 34/Rosa, abertura 100 na fábrica, 10 para loja e 20 para
parceiro resulta em fábrica 70, loja 10, parceiro 20, total 100. Nenhuma tabela financeira/venda
é criada pela remessa. O teste também confirma rollback de transferência inválida e concorrência
em sessões PostgreSQL independentes.

## LIMITAÇÕES E PENDÊNCIAS

- Banco publicado não foi alterado nesta sessão. Aplicar a migration pelo fluxo do projeto e
  executar smoke test autenticado no Lovable Cloud permanece pendente; entrega validada localmente.
- A migration histórica `20260918100000_inventory_ledger.sql` tem erro de declaração record em
  uma RPC substituída. O harness preserva o arquivo e desliga `check_function_bodies` somente
  durante sua carga, religando na conexão seguinte. Replay novo do histórico precisa desse cuidado.
- Harness testa PostgreSQL/RLS com auth mínimo, não o fluxo ponta a ponta de login Supabase.
- Importação inicial CSV/XLSX, exportação XLSX, câmera barcode, reservas/disponibilidade, valor de
  estoque, editor de limites por localização e aprovação por limite de ajuste não implementados.
- Lock por organização privilegia integridade e limita paralelismo dentro do tenant. Contagem
  bloqueia a localização até conclusão/cancelamento. Exportações paginadas não constituem snapshot
  entre chamadas se houver movimentos simultâneos.
- Leitura de lotes mantém o limite preexistente de 500 opções; catálogos maiores precisam de busca
  paginada dedicada de lotes. Contagem lê seus itens do banco em uma resposta, sem limite PostgREST.
- Rejeições SQL diretas abortadas não persistem audit log na própria transação; server functions
  registram rejeições de membros em uma chamada separada.

## PRÓXIMO DOMÍNIO

Produção, conforme especificação própria: aproveitar a migration preparatória já existente e
usar exclusivamente o mesmo serviço de estoque. Nenhuma implementação nova de BOM, custos,
produção, marketplace, liquidação de parceiros, CRM ou financeiro foi adicionada neste bloco.
