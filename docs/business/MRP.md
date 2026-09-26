# MRP — cálculo de necessidade e sugestão planejada

Modelo do motor de planejamento (MASTER 011): como uma demanda vira uma sugestão de compra ou
produção. Detalhes de contexto em [PLANNING](PLANNING.md); metodologia de demanda em
[DEMAND-FORECAST](DEMAND-FORECAST.md); reposição em
[REPLENISHMENT-PLANNING](REPLENISHMENT-PLANNING.md).

O cálculo inteiro acontece em `planning_execute` (`SECURITY DEFINER`), no banco. Não há aritmética
de saldo, estoque ou BOM no navegador: o frontend exibe o que o banco devolve.

## Entradas congeladas

No início da execução o motor monta tabelas temporárias (`ON COMMIT DROP`) com o retrato exato do
que foi considerado:

| Temporária | Conteúdo |
| --- | --- |
| `pln_locations` | Locais ativos participantes, com a marcação de inclusão do cálculo. |
| `pln_items` | Uma linha por variante: estoque disponível, parceiro, trânsito, segurança, mínimos, alvo, política, unidade, BOM vigente e profundidade. |
| `pln_edges` | Componentes da BOM com quantidade, perda e fator de conversão. |
| `pln_depth` | Profundidade na árvore e detecção de ciclo. |

Estoque vem do ledger (`inventory_movements` `POSTED`), nunca de saldo mantido em outro lugar.
Parceiro e trânsito são medidos, mas **não** entram no saldo disponível, exceto decisão explícita
de disponibilidade — que é rejeitada para `PARTNER`, `TRANSIT` e locais com
`operational_purpose <> 'NORMAL'`.

A BOM usada é a vigente na data de planejamento (`effective_from <= hoje < effective_to`), com o
maior `effective_from` e, em empate, maior `version`. Ciclo ou profundidade maior que 32 níveis
faz o run inteiro falhar com `BOM_CYCLE_DETECTED`, sem emitir nenhuma sugestão.

## Fatos de entrada

Cada fonte vira um `planning_source_fact` com tipo, origem, data necessária e quantidade, o que
permite explicar a sugestão item a item:

- `HISTORICAL_SALES` — vendas reconciliadas/válidas, para forecast.
- `MANUAL_FORECAST` — ajuste manual aditivo, por variante e data.
- `PURCHASE_RECEIPT` — pendência de compra, apenas `ordered − received`, com destino incluído no
  cálculo, data de chegada futura e conversão de unidade válida.
- `PRODUCTION_RECEIPT` — produção liberada, apenas `planned − produzido` no ledger.
- `PRODUCTION_REQUIREMENT` — consumo comprometido de produção já liberada, para não contar como
  segunda demanda do produto.
- `BOM` — dependência gerada pela explosão da sugestão de produção.

Recebimento sem data futura confiável não abate a necessidade e gera aviso
`PAST_DUE_REQUIREMENT`.

## Passagem de saldo por item

Para cada variante, em ordem de profundidade (pais resolvidos antes dos componentes), dia a dia:

```
base      = forecast diário × multiplicador do cenário, do início do horizonte em diante
demanda   = base + ajuste manual + demanda dependente (BOM / produção liberada)
saldo     = saldo anterior + recebimentos programados − demanda
neto      = max(0, segurança efetiva − saldo)
```

Quando a política de reposição da variante for `REORDER_POINT` ou `TARGET_STOCK` e a fonte
`MINIMUM_STOCK` estiver ativa, a necessidade também considera o ponto de reposição, o mínimo e o
alvo. `MANUAL` nunca gera necessidade por mínimo ou alvo.

O motor mantém **um único pool por variante**: componentes compartilhados por vários produtos são
consumidos uma única vez, na ordem de profundidade.

## Arredondamento e sugestão

1. `neto` é arredondado para milésimos.
2. Compra com fornecedor: aplica MOQ do catálogo convertido para a unidade de estoque e depois o
   múltiplo de compra, também convertido.
3. Produção: usa a BOM vigente do item.
4. Bloqueios geram exceção e **não** geram sugestão: item inativo (`PLANNING_DATA_INCONSISTENT`),
   produto fabricado sem BOM (`BOM_MISSING`), BOM vazia ou componente sem conversão
   (`UNIT_CONVERSION_MISSING`).
5. Lead time define a data sugerida: `necessária − lead`. Lead time nulo gera aviso
   `LEAD_TIME_MISSING` e deixa a data indisponível; necessidade já vencida vira prioridade `HIGH`.

Cada `planned_order` guarda `why` com abertura, forecast base, ajuste, demanda dependente,
necessidade bruta, recebimentos, segurança, alvo, necessidade líquida, quantidade sugerida,
fornecedor, lead time, datas, BOM usada e o motivo do arredondamento. É isso que explica a
sugestão na tela, sem refazer cálculo no cliente.

## Projeção

`planning_projections` guarda, por variante e dia: abertura, forecast base, ajuste manual,
dependência, demanda, recebimentos, recebimentos planejados, projeção sem planos, projeção com
planos, segurança, alvo e excesso. A aba de projeção aceita exibição diária ou semanal, com
agregação semanal calculada no banco.

`projected_shortages` registra a ruptura projetada com gravidade, origem
(`DEMAND`/`PRODUCTION_BLOCKING`), o gap físico, o gap de segurança/alvo e o aviso explícito de que
sugestão não é execução.

## Limites

- 20.000 posições (variantes × dias) por execução e teto de `max_planned_orders`.
- Horizonte de até 365 dias, começando hoje ou depois.
- Uma sugestão por variante, tipo e data necessária.
- Conversão de produção valida drift de BOM antes de criar a ordem: se a BOM mudou, a conversão é
  recusada e o run precisa ser refeito.
