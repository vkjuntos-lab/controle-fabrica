# Previsão de demanda — Demand Forecast

Como o MASTER 011 transforma vendas e decisões humanas em demanda futura. Contexto de cálculo em
[MRP](MRP.md); telas em [PLANNING](PLANNING.md).

## Fontes de demanda

| Fonte | Origem | efeito |
| --- | --- | --- |
| `HISTORICAL_SALES` | `marketplace_sales` reconciliadas ou validadas, com `marketplace_stores`. | Base do forecast. |
| `MANUAL_FORECAST` | `forecast_adjustments`, com motivo e autor. | Adição em unidades por variante e data. |
| `MINIMUM_STOCK` | Política de reposição, mínimo, ponto e alvo da variante. | Necessidade de reposição. |
| `PRODUCTION_REQUIREMENT` | Consumo já comprometido por produção liberada. | Acrescenta demanda pelos materiais ainda necessários à produção. |

Uma venda de origem é **um** fato, independentemente de quantos registros de reconciliação ela
tenha: entram vendas `VALIDATED` ou `RECONCILED` com item de reconciliação válido. A seleção usa existência, sem multiplicar linhas, eliminando duplicidade entre
marketplace e parceiro. O forecast é sempre em **unidades** da variante.

## Métodos

- `SIMPLE_MOVING_AVERAGE` — soma das vendas da janela dividida pelos dias de histórico.
- `WEIGHTED_MOVING_AVERAGE` — pesos por faixa, da mais recente para a mais antiga.

Janela (`history_days`) e histórico mínimo (`min_history_days`) são configuráveis por
organização. Sem histórico suficiente, a demanda base fica zero e o run registra
`INSUFFICIENT_HISTORY` com orientação para ajuste manual — nunca um número inventado.

## Ajuste manual

Ajuste é aditivo e fica **separado** do forecast base em todas as projeções
(`base_forecast` e `manual_adjustment` são colunas distintas). Ele exige motivo, respeita
`planning.adjust_forecast` e aceita `planning.save` por variante e data. Um ajuste existente pode
ser editado a partir da tela; um segundo ajuste para a mesma variante e data é recusado com mensagem
explícita, para não criar duplicidade silenciosa. Concluído um planejamento, o ajuste não é
reescrito: o próximo run é que o incorpora.

## Exibição

- Projeção por variante e período em `planning_projections`, diária ou semanal.
- Aba "Demanda por canal" (`channels`) agrupa o histórico por `ownership_type`, loja, marketplace
  e parceiro, para separar a leitura por origem comercial.
- Fontes (`facts`) mostram cada contribuição com tipo, origem, data e contexto.

## Limitações

- Não há sazonalidade, tendência, promoção, evento de calendário ou previsão por família.
- Não há forecast probabilístico, intervalo de confiança ou revisão automática.
- O histórico ignora vendas não reconciliadas e não validadas, mesmo que existam.
- O ajuste manual é por variante e data; não existe ajuste por canal ou por grupo de produto.
