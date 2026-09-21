# Estoque — Inventory Ledger

Documento de negócio e modelo técnico do módulo de estoque. Fonte única de verdade do saldo:
**o saldo nunca é um campo**, é sempre derivado dos movimentos.

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
- `status`: `PENDING`, `POSTED`, `REVERSED`, `CANCELED`.
- `reference_type` / `reference_id`: origem do fato (venda, compra, produção, ajuste…).
- `idempotency_key`: evita lançamento duplicado (único por organização).
- `reversal_of_id` / `reversed_by_id`: liga original e estorno.

## Semântica de saldo

Somente movimentos `POSTED` entram no saldo.

- `POSTED`: movimento válido e efetivo. É o **único** status que soma.
- `REVERSAL`: a correção de um movimento. O **original permanece `POSTED`** (nunca muda de status)
  e o efeito é cancelado por uma compensação `REVERSAL` (também `POSTED`, direção oposta e mesma
  quantidade) — o par soma zero. O original nunca é editado nem estornado.
- `REVERSED` (legado): status que não é mais gravado. Movimentos antigos que tinham esse status
  foram migrados para `POSTED` e o efeito foi compensado por `REVERSAL`. Caso ainda existam em
  dados históricos, **não compõem o saldo**.
- `PENDING` e `CANCELED`: rascunhos/descartados, nunca somam.
- Consequência: uma reversão **sempre** pode executar, mesmo que o saldo atual seja negativo —
  a compensação restaura o líquido e não depende da autorização de estoque negativo.

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
  `allow_negative_inventory = false`) e usa advisory lock por variante+localização para evitar
  corrida. Recusa tipos dedicados.
- `inventory_post_transfer` — cria, **na mesma transação**, a saída na origem e a entrada no
  destino. Controla os três fluxos:
  - `TRANSFER` → `TRANSFER_OUT` + `TRANSFER_IN` (exige `inventory.transfer`);
  - `PARTNER_SHIPMENT` → saída física + entrada na localização do parceiro (exige `inventory.move`);
  - `PARTNER_RETURN` → saída do parceiro + entrada física (exige `inventory.move`).
- `inventory_reverse_movement` — marca o original como `REVERSED` e cria um `REVERSAL` de direção
  oposta, mantendo o par somando zero.
- `inventory_complete_count` — aplica as divergências de uma contagem como ajustes
  (`ADJUSTMENT_IN`/`ADJUSTMENT_OUT`), uma vez por item contado.
- `inventory_get_balance` — leitura pontual do saldo.

## Regras de negócio

- **Estoque negativo**: bloqueado por padrão. Pode ser permitido por organização
  (`organization_inventory_settings.allow_negative_inventory`).
- **Imutabilidade**: nenhum movimento é alterado ou apagado; correção é sempre por novo movimento.
- **Idempotência**: `UNIQUE(organization_id, idempotency_key)` impede duplicidade em retries.
- **Remessa a parceiro não é venda**: a propriedade continua com a empresa; não gera receita nem
  contas a receber. É apenas transferência de posse/posição.
- **Concorrência**: `pg_advisory_xact_lock` serializa lançamentos da mesma variante+localização,
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
