# Reposição de Compras — Replenishment

Documento de negócio e modelo técnico da sugestão de reposição (MASTER 010). O objetivo é
**sugerir** compra, nunca comprar sozinho. Não há MRP/APS nem previsão assistida: a regra usa saldo,
mínimos/pontos da variante e pedidos/requisições já existentes.

## Base de dados

- `product_variants.minimum_stock`, `reorder_point`, `target_stock` e o novo
  `replenishment_policy` (`REORDER_POINT` | `TARGET_STOCK` | `MANUAL`, default `REORDER_POINT`).
- Saldo atual via view `inventory_balances` (`on_hand`) / `inventory_get_balance`.
- Em aberto: quantidade de itens de pedido `OPEN/PARTIALLY_RECEIVED` (`open_qty`) e itens de
  requisição `PENDING/APPROVED` (`pending_req`) do mesmo fornecedor vinculado.

## Candidatos (`replenishment_query`)

Variantes `ACTIVE` com `replenishment_policy <> 'MANUAL'` entram na fila. Para cada uma:

```
disponível = on_hand + open_qty + pending_req
```

| Política | Sugestão |
| --- | --- |
| `REORDER_POINT` | Quando `disponível <= reorder_point` (ou `minimum_stock` se sem ponto), sugere `max(0, minimum_stock − disponível)`. |
| `TARGET_STOCK` | Quando abaixo do alvo, sugere `tamanho do lote` (parcela do alvo), não o saldo até o teto — compra em lotes. |
| `MANUAL` | Nunca sugerido. |

Saída por linha: variante/SKU/produto, política, mínimos/alvo, disponível, **sugestão**, melhor
fornecedor (catálogo com menor custo/preferido) e `lead_time_days`, correndo na própria query.
O `_filters->>'months'` controla a janela de consumo a considerar nos agregados (painel).

O dashboard também informa `purchase_orders.issued_in_period` e o total de variantes abaixo do
mínimo, para priorização.

## Regras e limites

- `replenishment_query` exige `purchasing.read`; consulta `STABLE`, não altera nada.
- Sugestão é **referência** para a tela `/compras/reposicao` — o fluxo de compra continua pelas
  telas normais (requisição → cotação → pedido). Não existe criação automática de pedido.
- Requisições já `ORDERED` e pedidos cancelados não contam como "em aberto".
- Fora do escopo: dimensionamento de lote econômico, estoque de segurança dinâmico, previsão de
  demanda, priorização por criticidade automática e integração com produção.

## Tela

`/compras/reposicao` — tabela de candidatos com saldo, sugestão por política, fornecedor sugerido
e atalhos para criar pedido a partir da linha.