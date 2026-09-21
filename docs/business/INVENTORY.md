# Estoque — Inventory Ledger

Documento de negócio e modelo técnico do módulo de estoque. Fonte única de verdade do saldo:
**Inventory Ledger é a fonte oficial do estoque. Saldo é derivado de movimentos POSTED. Movimento consolidado não é editado.**

## Princípio central

Todo estoque é um **ledger de movimentos imutáveis**. Não existe (e não deve existir) coluna
`quantity`/`stock` em produto, variante ou localização. O saldo é a soma dos movimentos:

```
saldo(variante, localização) = SUM(entradas) − SUM(saídas)
```

Movimentos nunca são editados nem excluídos. Correções e estornos acontecem por **reversão**
(um novo movimento compensatório). Isso garante trilha de auditoria completa e reconciliação
possível a qualquer momento.

## Modelo de dados

| Objeto | Papel |
| --- | --- |
| `inventory_locations` | Posição física/operacional: fábrica, depósito, loja, parceiro, trânsito. |
| `inventory_movements` | O ledger. Cada linha é uma entrada ou saída com tipo, quantidade e motivo. |
| `inventory_batches` | Lotes (opcional) para validade/rastreabilidade. |
| `inventory_transfers` / `inventory_transfer_items` | Cabeçalho e itens de transferências e remessas. |
| `inventory_counts` / `inventory_count_items` | Contagens físicas e suas divergências. |
| `organization_inventory_settings` | Regras da organização (`allow_negative_inventory`). |
| `inventory_balances` (view) | Saldo derivado por variante + localização + lote. |
| `inventory_get_balance` (RPC) | Saldo de uma combinação específica. |

### Campos-chave do movimento

- `direction`: `IN` ou `OUT` — decide o sinal. `quantity` é **sempre positiva**.
- `movement_type`: natureza do movimento (ver tabela abaixo).
- `status`: `PENDING`, `POSTED`, `REVERSED` (legado, não é mais gravado), `CANCELED`.
- `reference_type` / `reference_id`: origem do fato (venda, compra, produção, ajuste…).
- `idempotency_key`: evita lançamento duplicado (único por organização).
- `reversal_of_id`: liga a compensação `REVERSAL` ao movimento original.

## Semântica de saldo

Somente movimentos `POSTED` entram no saldo.

- `POSTED`: movimento válido e efetivo. É o **único** status que soma.
- `REVERSAL`: a correção de um movimento. O **original permanece `POSTED`** (nunca muda de status)
  e o efeito é cancelado por uma compensação `REVERSAL` (também `POSTED`, direção oposta e mesma
  quantidade) — o par soma zero. O original nunca é editado; a relação com o estorno é consultada por `reversal_of_id`.
- `REVERSED` (legado): status que não é mais gravado. Movimentos antigos que tinham esse status
  foram migrados para `POSTED` e o efeito foi compensado por `REVERSAL`. Caso ainda existam em
  dados históricos, **não compõem o saldo**.
- `PENDING` e `CANCELED`: rascunhos/descartados, nunca somam.
- Reversões também respeitam o bloqueio de saldo negativo. Estornar uma entrada já consumida pode ser recusado.

Exemplo de reversão de uma saída de 20:

```
original   OUT 20  POSTED    (conta: −20, permanece POSTED)
reversão   IN  20  POSTED    (conta: +20, compensação REVERSAL)
                          líquido: 0
```

## Tipos de movimento

| Tipo | Direção | Observação |
| --- | --- | --- |
| `OPENING_BALANCE` | IN | Saldo inicial. |
| `PURCHASE_RECEIPT` | IN | Recebimento de compra. |
| `PRODUCTION_OUTPUT` | IN | Entrada por produção. |
| `PRODUCTION_CONSUMPTION` | OUT | Consumo de insumo em produção. |
| `SALE` | OUT | Venda. |
| `SALE_RETURN` | IN | Devolução de venda. |
| `PARTNER_SHIPMENT` | OUT | Remessa a parceiro (par atômico via transferência). |
| `PARTNER_RETURN` | IN | Retorno de parceiro (par atômico via transferência). |
| `TRANSFER_IN` | IN | Entrada de transferência interna (par atômico). |
| `TRANSFER_OUT` | OUT | Saída de transferência interna (par atômico). |
| `ADJUSTMENT_IN` | IN | Ajuste positivo (inventário). |
| `ADJUSTMENT_OUT` | OUT | Ajuste negativo (inventário). |
| `LOSS` | OUT | Perda/quebra. |
| `MANUAL_CORRECTION` | IN ou OUT | Correção manual com direção livre. |
| `REVERSAL` | oposta | Estorno de um movimento original. |

Os tipos `TRANSFER_IN`, `TRANSFER_OUT`, `REVERSAL`, `PARTNER_SHIPMENT` e `PARTNER_RETURN` são
**dedicados**: nunca podem ser lançados diretamente por `inventory_post_movement`. Eles só
existem por RPCs dedicadas, que garantem o par completo.

## Operações (RPCs transacionais)

- `inventory_post_movement` — lança um movimento simples, valida saldo (bloqueia negativo quando
  `allow_negative_inventory = false`), usa advisory lock por organização para evitar
  corrida e é idempotente por `idempotency_key`. Recusa tipos dedicados. O parâmetro
  `_allow_negative_override` é sempre recusado (nenhum estouro silencioso de saldo).
- `inventory_post_transfer` — cria, **na mesma transação**, a saída na origem e a entrada no
  destino. Controla os três fluxos:
  - `TRANSFER` → `TRANSFER_OUT` + `TRANSFER_IN` (exige `inventory.transfer`);
  - `PARTNER_SHIPMENT` → saída física + entrada na localização do parceiro (exige `inventory.move`);
  - `PARTNER_RETURN` → saída do parceiro + entrada física (exige `inventory.move`).
- `inventory_reverse_movement` — cria uma compensação `REVERSAL` de direção oposta mantendo o par
  somando zero. O original **permanece `POSTED`** (o enum `REVERSED` permanece para compatibilidade). Transferências
  e remessas são compensadas por inteiro (as duas pernas); a chamada é idempotente e uma
  compensação jamais pode ser estornada por outra. Reversões respeitam saldo, lote e configuração de negativo.
- `inventory_lock` — trava de organização (`pg_advisory_xact_lock`) que serializa todas as operações
  de escrita do domínio.
- `inventory_complete_count` — aplica as divergências de uma contagem como ajustes
  (`ADJUSTMENT_IN`/`ADJUSTMENT_OUT`), uma vez por item contado. O snapshot é **por lote** e a
  localização fica bloqueada para movimentação (DRAFT/IN_PROGRESS/REVIEW) até conclusão/cancelamento.
- `inventory_get_balance` — leitura pontual do saldo.

## Regras de negócio

- **Estoque negativo**: bloqueado por padrão. Pode ser permitido por organização
  (`organization_inventory_settings.allow_negative_inventory`) mais `inventory.allow_negative`; com aviso na resposta e saldo anterior/resultante auditado.
- **Imutabilidade**: nenhum movimento é alterado ou apagado; correção é sempre por novo movimento.
- **Idempotência**: `UNIQUE(organization_id, idempotency_key)` impede duplicidade em retries.
- **Remessa a parceiro não é venda**: estoque em posse de terceiro pode continuar sendo propriedade da organização; não gera receita nem
  contas a receber. É apenas transferência de posse/posição.
- **Concorrência**: `pg_advisory_xact_lock` serializa lançamentos da mesma organização,
  impedindo que duas saídas simultâneas furem o saldo.
- **Saldo mínimo**: `product_variants.minimum_stock`/`reorder_point` alimentam alertas de reposição
  (tela de posição com filtro "abaixo do mínimo").

## Permissões

| Permissão | Uso |
| --- | --- |
| `inventory.read` | Ver posição, localizações, contagens e transferências. |
| `inventory.movements.read` | Ver o ledger de movimentos. |
| `inventory.move` | Lançar movimentos gerais e remessas/retornos de parceiro. |
| `inventory.adjust` | Ajustes manuais. |
| `inventory.transfer` | Transferências internas. |
| `inventory.count` | Criar/editar/concluir contagens. |
| `inventory.opening_balance` | Saldo inicial. |
| `inventory.reverse` | Reverter movimentos. |
| `inventory.allow_negative` | Saída negativa autorizada pela configuração, com aviso e auditoria. |
| `inventory.manage_locations` | Criar/editar localizações e regras da organização. |

Seed: admin, gestor e estoque recebem todas; producao, financeiro, comercial e marketplace
recebem `inventory.read` + `inventory.movements.read`.

## Telas

- `/estoque` — posição de estoque (saldo por variante × localização, alerta de mínimo, exportação).
- `/estoque/movimentacoes` — ledger com filtros; detalhe em `/estoque/movimentacoes/$id` com reversão.
- `/estoque/transferencias` — transferências internas e remessas a parceiros.
- `/estoque/locations` — cadastro de localizações e regra de saldo negativo.
- `/estoque/terceiros` — saldos em poder de parceiros.
- `/estoque/inventarios` — contagens físicas; detalhe em `/estoque/inventarios/$id`.

## Fora de escopo

Custo/valorização financeira do estoque, BOM/ficha técnica, ordens de produção, liquidação de
parceiros, contas a receber, DRE e previsão/IA. O ledger registra **quantidades**; valor é uma
camada posterior.

## Complemento validado em 21/09/2026

Migration `20260923100000_inventory_workflows.sql`: preserva as migrations anteriores, inclusive
a preparação de produção já presente, e seu suporte a unidades. Não implementa produção.

- `inventory_post_movement_internal` é privada. A API pública recusa referências reservadas,
  impedindo que uma chamada manual se passe pela confirmação de inventário.
- Transferências guardam `request_payload`, rejeitam a mesma chave com conteúdo diferente e
  preservam o lote nas duas pernas. Item sem lote movimenta apenas saldo sem lote.
- `inventory_start_count`, `inventory_save_count_item`, `inventory_read_count`,
  `inventory_cancel_count`, `inventory_complete_count`: contagem com snapshot por lote, localização
  bloqueada e confirmação explícita. Concluir exige `inventory.count` + `inventory.adjust`.
  Itens não contados são ignorados com aviso; ao menos um deve estar contado. Concluída não é editável.
- Barcode: leitor USB/Bluetooth que digita + Enter ou digitação no celular. Incrementa um item;
  vários lotes exigem informar a quantidade no item correto. Câmera: **NOT_IMPLEMENTED**.
- `inventory_query_positions`: pagina e agrega no banco, inclui zeros, busca nome/SKU/barcode,
  filtros produto/categoria/localização/status e agrupamentos por produto ou localização.
- `inventory_dashboard`: SKUs com saldo/zero, totais atuais por localização, entradas/saídas/ajustes
  em período UTC e divergências abertas. Entradas/saídas incluem transferências físicas.
- `inventory_search_variants`: até 50 sugestões por pesquisa; `inventory_list_counts`: cabeçalhos
  paginados com responsável/divergências; `inventory_actor_options`: usuários dentro do tenant.
- CSV da posição percorre todas as páginas filtradas. CSV de movimentos exporta explicitamente
  a página exibida. Permissão e organização são verificadas em todas as consultas.
- Localizações/configuração: auditoria em trigger transacional. Postagens: antes/depois, quantidade,
  direção, motivo, variante, localização e lote. Server functions auditam rejeições de membros em
  transação separada; chamada SQL direta abortada não persiste auditoria na própria transação.
- Posição e inventário físico usam cartões no mobile. Dashboard mostra On Hand; não há reservas,
  disponibilidade comercial nem valorização financeira.

`OPENING_BALANCE` exige `inventory.opening_balance` e aceita localização, variante, quantidade,
data de referência e observação; após postado só pode ser compensado. Importação inicial CSV/XLSX
com mapeamento e preview: **NOT_IMPLEMENTED**. Exportação XLSX: **NOT_IMPLEMENTED**.
`minimum_stock`/`reorder_point` seguem por variante, com alerta quantitativo; editor por localização
não implementado. Remessa para parceiro não é venda. Propriedade contábil, reconciliação e
reservas serão definidas nos respectivos domínios, sem saldos fictícios.

## Verificação reproduzível

`npm test`, `npm run test:inventory:db`, `npm run typecheck`, `npm run build`.

O harness requer Python 3 e PostgreSQL local (`PG_BIN`, default `/usr/lib/postgresql/18/bin`).
Cria banco temporário isolado e usa duas conexões reais nos testes de concorrência; não conecta ao
banco publicado. `auth.uid()` e `auth.users` usam um substituto mínimo para testar RLS, sem simular
um teste ponta a ponta de autenticação Supabase.

A migration histórica `20260918100000_inventory_ledger.sql` contém alvo record inválido numa RPC
substituída. Para preservar o arquivo publicado, o harness usa `check_function_bodies=off` somente
na conexão que carrega esse arquivo; a seguinte restaura validação. Um replay limpo desse histórico
requer o mesmo cuidado. Migrations posteriores são compiladas e suas RPCs exercitadas nos testes.

A aplicação no Lovable Cloud e o smoke test autenticado publicado não foram executados nesta
sessão. O lock por organização privilegia correção e pode limitar throughput futuro; sua eventual
substituição deve manter os testes de concorrência e a ordem consistente de locks.
