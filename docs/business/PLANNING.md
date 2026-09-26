# Planejamento — Planning

Documento de negócio e modelo técnico do módulo de planejamento (MASTER 011): previsão de
demanda, cálculo de necessidade, sugestões planejadas, simulação e conversão assistida.

**Planejamento não é execução.** O módulo calcula, projeta, sugere, prioriza e simula. Ele não
compra, não produz, não transfere, não altera preço e não cancela. Toda sugestão é uma
`planned_order`, que só vira requisição de compra ou ordem de produção por decisão humana em uma
tela, com permissão específica e registro de auditoria.

## Migrations

| Migration | Conteúdo |
| --- | --- |
| `20261002100000_planning.sql` | Nove tabelas iniciais, permissões e helpers; acesso direto restrito. |
| `20261003100000_planning_engine.sql` | Quatro tabelas de snapshots/conversões, RLS, motor, consultas e ações de sugestão. |
| `20261004100000_planning_fixes.sql` | Correções do motor encontradas na validação de aceitação. |

## Modelo de dados

| Tabela | Papel |
| --- | --- |
| `planning_settings` | Método de forecast, fontes de demanda, histórico, buckets, política de lead time, prazos padrão e overrides por variante. |
| `planning_scenarios` | Simulações com multiplicadores de demanda, segurança, alvo e ajuste de lead time. |
| `planning_availability` | Locais participantes do cálculo por organização. |
| `forecast_adjustments` | Ajuste manual de demanda, aditivo, por variante e data. |
| `planning_runs` | Execução: parâmetros, snapshot de entrada, resumo e estado. |
| `planned_orders` | Sugestões planejadas com `why` explicável, MOQ, múltiplo e rastro de conversão. |
| `material_requirements` | Necessidade por item e período, com bloqueios e cálculo. |
| `projected_shortages` | Rupturas projetadas, gravidade e origem. |
| `planning_exceptions` | Central de exceções com severidade e tratamento. |
| `planning_projections` | Projeção temporal diária ou semanal por variante. |
| `planning_item_snapshots` | Retrato do item no início do horizonte. |
| `planning_source_facts` | Fato de demanda ou recebimento, com origem e data. |
| `planning_conversions` | Conversões realizadas, com chave de idempotência e destino. |

Todas as 13 tabelas são `SELECT`-only para `authenticated`, com policy `planning_tenant_read`
usando `has_permission(organization_id,'planning.read')`. Nenhuma delas aceita escrita direta.
Toda escrita passa por cinco RPCs `SECURITY DEFINER`: `planning_save`, `planning_execute`,
`planning_query`, `planning_order_action` e `planning_exception_action`. Os helpers
(`planning_require`, `planning_audit`, `planning_note`, `planning_supplier`, `pln_solve`, entre
outros) ficam sem `EXECUTE` para `PUBLIC`, `anon` e `authenticated`.

## Permissões

`planning.read`, `planning.run`, `planning.simulate`, `planning.adjust_forecast`,
`planning.approve_suggestion`, `planning.convert_purchase`, `planning.convert_production` e
`planning.export`.

`planning.run` sozinho não configura catálogo: gravar `safety_stock` exige `products.manage`,
gravar lead time de BOM exige `production.bom.update` e gravar múltiplo de compra exige
`suppliers.manage`. Converter exige a permissão de planejamento **e** a do módulo de destino
(`purchase_requests.create` ou `production.order.create`).

## Telas

| Rota | Conteúdo | Permissão |
| --- | --- | --- |
| `/planejamento` | Último planejamento base, resumo e central de exceções. | `planning.read` |
| `/planejamento/execucoes` | Histórico de execuções e comparação entre planos. | `planning.read` |
| `/planejamento/execucoes/$id` | Sugestões, necessidades, itens, projeção, rupturas, exceções, canais, fontes e conversões. | `planning.read` |
| `/planejamento/forecast` | Ajuste manual de demanda, com edição do ajuste existente. | `planning.adjust_forecast` |
| `/planejamento/simulacao` | Cenários e execuções simuladas. | `planning.simulate` |
| `/planejamento/configuracoes` | Método, fontes, prazos, locais, segurança por variante e múltiplos. | `planning.run` |

A exportação CSV de qualquer aba do detalhe exige `planning.export`.

## Ciclo de vida

`SUGGESTED → REVIEWED → APPROVED → (CONVERTED)`, com `DISMISSED` como saída. A conversão é
**parcial e idempotente**: `converted_qty` acumula até a quantidade sugerida, e cada conversão
tem `idempotency_key` própria em `planning_conversions`. Repetir a mesma chave devolve a conversão
existente; usar a mesma chave com outro conteúdo é erro.

- Compra: `request_save` cria a requisição com `source_type='MRP'` e `source_id` da sugestão.
  Cotação, aprovação, pedido e recebimento continuam no fluxo normal de Compras.
- Produção: `production_create_order` cria a ordem em `DRAFT`, com a BOM e o idempotency key
  `planning:<chave>`. A ordem segue o fluxo normal de Produção.

Simulação não é conversível: a tentativa é recusada com mensagem explícita.

## Imutabilidade e auditoria

Run `COMPLETED`, `COMPLETED_WITH_WARNINGS` ou `ARCHIVED` é snapshot: não é reescrito nem
removido. `planning_projections`, `planning_item_snapshots`, `planning_source_facts` e
`planning_conversions` são append-only. Sugestões de run concluído só aceitam mudança de status e
rastro de conversão. Recalcular cria outro run. Toda operação grava auditoria `planning.*`.

## Limitações

- Sem reservas de estoque (`reservations='NOT_IMPLEMENTED'`): estoque comprometido por outros
  fluxos não é abatido da necessidade.
- Calendário é de dias corridos (`UTC_CALENDAR_DAYS`), sem feriados ou expediente.
- Sem lote econômico, sem fluxo de aprovação de forecast e sem otimização global; MOQ e múltiplo vêm do
  catálogo do fornecedor.
- Uma sugestão por variante, tipo e data necessária.
- Sem conversões de transferência e sem sugestão de múltiplos locais.
- `planning_availability` decide locais participantes; parceiro, trânsito e quarentena nunca são
  estoque fabril.
