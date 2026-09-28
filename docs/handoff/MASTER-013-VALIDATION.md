# MASTER 013 — Relatório de validação
Revisão: 28/09/2026. Estado global: PARTIAL. Implementação local; implantação publicada e aceitação
visual em navegador autenticado não verificadas.

## 1. Diagnóstico

O banco já tinha o ciclo de vendas implementado em três migrations
(`20261006100000_sales_orders.sql`, `20261010100000_sales_integrity.sql`,
`20261011100000_sales_planning.sql`), com 23 tabelas e funções `sales_*`. O que não existia era a
parte que transforma banco em produto:

- **Nenhuma tela.** O módulo de vendas não tinha componente, rota nem gateway TypeScript.
- **RBAC ausente.** As permissões de vendas não estavam declaradas, o módulo estava marcado como
  "em breve" e o menu não tinha a entrada.
- **Dois bugs de servidor que impediam o uso real:** `sales_settings_save` convertia a chave de
  auditoria com `text` para um parâmetro `uuid`, o que fazia **toda** gravação de política falhar;
  e `sales_carrier_save` inseria `modality = NULL`, o que fazia **toda** gravação de transportadora
  falhar.
- **Cinco das doze políticas sem editor.** A tela oferecia apenas quatro campos, e nenhum deles
  validava o que o servidor aceitava.
- **Propostas apareciam como "—".** O seletor herdado do CRM mostra `name`/`legal_name`/`sku`; uma
  proposta tem `quote_number` e `version`, então todas as opções eram indistinguíveis.
- **Ciclo físico ausente na interface.** Reserva, separação, conferência, embalagem, expedição,
  entrega e devolução existiam no banco e não tinham botão.

O frontend minificado também não era a base: a área de vendas era um arquivo único de 25 KB sem
separação de responsabilidade, sem rótulos de domínio e com rótulos em inglês vazando para a
interface.

## 2. Implementado

### Backend

Migration `20261012100000_sales_screen_fixes.sql`, preservando as três originais:

- `sales_settings_save`: `v_key` passa a `uuid`; validação das doze políticas (cinco opções de
  lista, cinco booleanos, validade da reserva entre 1 e 8760 horas, desconto entre 0 e 100).
- `sales_carrier_save`: modalidade padrão `COURIER` quando ausente, e validação de modalidade,
  tipo e número de documento, nome e contato.

### Gateway e leitura

- `src/lib/sales/sales.functions.ts`: `readSales` e `mutateSales` como `createServerFn`, com
  autenticação obrigatória, `kind` e `operation` em listas fechadas e validação Zod.
- `src/lib/sales/idempotency.ts`: derivação da chave de idempotência a partir do conteúdo da
  operação, serialização canônica e montagem de UUID válido.
- `src/lib/sales/constants.ts`: rótulos, listas e fluxo do domínio, com as doze políticas e as ações
  por status.

### Interface

- `src/components/sales/shared.tsx`: leitura, escrita e idempotência.
- `src/components/sales/reference-picker.tsx`: seletor com rótulo correto por tipo, proposing
  apenas propostas **aceitas**, e rótulo da escolha corrente preservado quando ela sai da busca.
- `src/components/sales/action.tsx`: diálogo genérico de ação, com validação de obrigatório e
  de ao menos um item com quantidade.
- `src/components/sales/new-order.tsx`: novo pedido e conversão de proposta, com verificação de
  formulário completo — os seletores são botões e não participam da validação `required` do HTML.
- `src/components/sales/areas.tsx`: listagens, dashboard e crédito.
- `src/components/sales/order-detail.tsx`: detalhe do pedido com todo o ciclo físico.
- `src/components/sales/settings.tsx`: as doze políticas.
- `src/components/sales/workspace.tsx`: casca, navegação e os quatro exports públicos
  (`SalesPage`, `SalesOrderPage`, `QuoteToOrder`, `CustomerOrders`), preservando a assinatura usada
  pelas rotas e pelo CRM.

### Permissões

Vinte e oito permissões declaradas, com rótulo, e o módulo `vendas` marcado como disponível.

## 3. Critérios de aceite

| Critério | Estado | Evidência / limite |
| --- | --- | --- |
| Pedido nasce com preço oficial | IMPLEMENTED | B/C: preço do cliente ignorado; nenhum movimento |
| Preço preservado na conversão | IMPLEMENTED | R: conversão idempotente por chave e por vínculo |
| Disponível = físico − reservas | IMPLEMENTED | G/H: quarentena não atende venda direta |
| Reserva não movimenta estoque | IMPLEMENTED | G/S/T: liberar, cancelar e expirar devolvem disponível |
| Aprovação com segregação e crédito | IMPLEMENTED | F/AA: valor avaliado preservado na aprovação |
| Separação e conferência | IMPLEMENTED | I/J: divergência vira ocorrência, não estoque |
| Embalagem com medidas reais | IMPLEMENTED | K: peso e dimensão nunca estimados |
| Expedição baixa uma vez | IMPLEMENTED | L/M: reenvio não duplica; exige duas permissões |
| Entrega com prova | IMPLEMENTED | N: não mexe no saldo e não fecha pedido com saldo |
| Devolução devolve estoque | IMPLEMENTED | O/P/AC: ajuste é solicitação; danificado vai para quarentena |
| Gatilho financeiro | IMPLEMENTED | Q: `ON_DISPATCH` gera um título por pedido |
| Demand no MRP | IMPLEMENTED | Z: sincronização com multi-SKU e expedição parcial |
| Excepcional e transportadora | IMPLEMENTED | AD/AF: funcionando pelo gateway da tela |
| Doze políticas editáveis | IMPLEMENTED | AE: todas editáveis e validadas pelo servidor |
| Tela de vendas | IMPLEMENTED | AD: todo botão tem caminho pelo gateway |
| Isolamento e RLS | IMPLEMENTED | V/W/X: escrita direta e colunas financeiras bloqueadas |
| Credit e Customer 360 | IMPLEMENTED | U: leem dados oficiais e declaram as fórmulas |
| Testes críticos | IMPLEMENTED | 32 grupos PostgreSQL (A–AF) e 77 testes Vitest |
| TypeScript, lint e build | IMPLEMENTED | Verificações locais sem erro |
| Integrações testadas | PARTIAL | Banco real isolado; navegador autenticado não testado |
| Implantação publicada | NÃO VERIFICADA | Nenhuma migration aplicada no banco de destino |
| Fiscal / NF-e | NÃO IMPLEMENTADO | Fora do escopo declarado |
| Transportadora externa | NÃO IMPLEMENTADO | Rastreio é manual; modo `WEBHOOK` sem provedor |
| Expiração em background | NÃO IMPLEMENTADO | Expira por chamada processada, sem job |

## 4. Não implementado

Nota fiscal e integração fiscal, transporte de transportadora externa, cobrança e recebimento
(realizados no módulo financeiro), expiração automática de reserva em background, assinatura digital
ou upload de foto na entrega, estimativa automática de peso e volume, e apuração financeira de
comissão. Nenhum deles é apresentado como funcionando.

## 5. Arquivos

Criados nesta revisão:

- `supabase/migrations/20261012100000_sales_screen_fixes.sql`
- `src/lib/sales/constants.ts`
- `src/lib/sales/sales.functions.ts`
- `src/lib/sales/idempotency.ts`
- `src/lib/sales/idempotency.test.ts`
- `src/components/sales/shared.tsx`
- `src/components/sales/reference-picker.tsx`
- `src/components/sales/action.tsx`
- `src/components/sales/new-order.tsx`
- `src/components/sales/areas.tsx`
- `src/components/sales/order-detail.tsx`
- `src/components/sales/settings.tsx`
- `docs/business/SALES-ORDERS.md`
- `docs/architecture/ADR-011-SALES.md`

Modificados: `src/components/sales/workspace.tsx` (reescrito, mesmos quatro exports),
`src/lib/rbac.ts`, `src/lib/rbac.test.ts`, `src/components/layout/app-shell.tsx`,
`scripts/test-sales-db.py` (grupos AD–AF) e este handoff.

## 6. Migrations e tabelas

As três migrations originais foram preservadas. A nova migration apenas substitui duas funções; não
cria nem altera tabela. Total do módulo: 23 tabelas — `sales_orders`, `sales_order_items`,
`sales_order_settings`, `sales_order_status_history`, `sales_order_operation_keys`,
`sales_number_counters`, `sales_credit_checks`, `sales_demands`, `inventory_reservations`,
`fulfillment_orders`, `picking_tasks`, `picking_task_items`, `packing_records`,
`packing_record_items`, `packing_record_volumes`, `shipments`, `shipment_items`, `shipment_volumes`,
`shipment_delivery_proofs`, `customer_returns`, `customer_return_items`, `carriers` e
`logistics_exceptions`.

A obrigação financeira **não** tem tabela própria: reusa `account_receivables` do módulo financeiro,
com `source_type = 'SALE'`. Cancelar pedido com recebível em aberto é recusado.

## 7. Serviços e eventos

Porta única de escrita: `sales_execute`. Leitura por `sales_query`, `sales_order_detail` e
`sales_dashboard`. Catorze funções `sales_*` são internas e permanecem sem `GRANT` a `authenticated`:
`sales_audit`, `sales_emit`, `sales_ensure_settings`, `sales_next_number`, `sales_prepare_item`,
`sales_insert_order`, `sales_validate_order`, `sales_receivable_total`, `sales_create_receivables`,
`sales_open_exception`, `sales_credit_check`, `sales_settings`, `sales_guard_relations` e
`sales_immutable`.

Eventos publicados na mesma transação: `SALES_ORDER_CREATED`, `SALES_ORDER_APPROVED`,
`SALES_ORDER_CANCELED`, `SALES_ORDER_STATUS_CHANGED`, `SALES_ORDER` e `SALES_DEMAND`. A aprovação
publica a demanda consumida pelo MRP. `SALES_QUOTE_ACCEPTED` continua sendo emitido pelo CRM e
continua sem consumidor automático: a conversão para pedido é uma ação do usuário, idempotente por
chave e por vínculo, não um gatilho automático.

## 8. Rotas

`/vendas` com `?view=` para pedidos, dashboard, reservas, separação, expedições, devoluções,
ocorrências, transportadoras, crédito e configurações. `/vendas/pedidos/$id` para o detalhe. As rotas
não mudaram de caminho: os componentes novos preservam a assinatura que elas já usavam.

## 9. Verificações

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck` | sem erro |
| `npx eslint src/components/sales src/lib/sales` | sem erro (1 aviso de Fast Refresh) |
| `npm test` | 87 testes, 8 arquivos, todos passando |
| `npm run build` | sucesso |
| `npm run test:sales:db` | 32 grupos, A–AF, todos passando |

Os 32 grupos do harness de vendas:

- **A–F** cenário, preço oficial, preço ignorado, variante descontinuada, edição, aprovação com
  segregação;
- **G–K** disponibilidade e reserva, quarentena, leitura de código de barras, divergência como
  ocorrência, medidas reais;
- **L–P** baixa única na expedição, dupla permissão, prova de entrega, devolução como solicitação,
  danificado em quarentena;
- **Q–U** gatilho financeiro, conversão de proposta, cancelamento, expiração, painel e Customer 360;
- **V–X** isolamento, empresa presa à organização, RPC e colunas financeiras bloqueadas;
- **Y–AC** contrato de criação pela tela, expedição multi-SKU com recebível incremental, política de
  crédito, concorrência de reserva, teto acumulado de devolução;
- **AD–AF** todo botão com caminho pelo gateway, as doze políticas, transportadora, ocorrência e
  expiração.

## 10. Limites conhecidos

A cobertura é banco real isolado, testes unitários e verificação de build. Não houve navegação em
navegador autenticado, o que deixa sem verificação prática o agrupamento dos campos nas telas, o
comportamento do seletor com muitas opções e a leitura de erro do gateway na interface. Nenhuma
migration foi aplicada no banco de destino. O repositório já continha cerca de 12 mil problemas de
formatação do Prettier em módulos de outros masters, fora do escopo desta revisão; os arquivos de
vendas estão limpos.
