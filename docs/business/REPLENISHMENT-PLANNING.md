# Planejamento de reposição — Replenishment Planning

Como o MASTER 011 planeja reposição e como ele se relaciona com a sugestão de reposição de compras
do MASTER 010 ([REPLENISHMENT](REPLENISHMENT.md)). Contexto de cálculo em [MRP](MRP.md).

## Dois Complementary, não duplicados

| | Reposição de Compras (MASTER 010) | Planejamento (MASTER 011) |
| --- | --- | --- |
| Tela | `/compras/reposicao` | `/planejamento/*` |
| Gatilho | Saldo atual contra mínimo, ponto ou alvo | Projeção dia a dia com forecast, dependência de BOM, segurança e lead time |
| Horizonte | Meses para consumo | Dias, até 365 |
| Resultado | Sugestão de compra na própria consulta | `planned_orders` com `why`, necessidades, rupturas e conversão assistida |
| Execução | Nenhuma | Nenhuma; a conversão cria requisição ou ordem por decisão humana |

A tela de reposição do MASTER 010 continua válida e não foi removida. Ela responde "o que falta
comprar agora"; o planejamento responde "o que falta produzir e comprar, quando e por quê". A
conversão usa `request_save`, o mesmo caminho do fluxo de compras, e nunca cria pedido.

## Política por variante

`replenishment_policy` (`REORDER_POINT` | `TARGET_STOCK` | `MANUAL`) define se a variante entra
por mínimo/alvo. `safety_stock` é o piso de cobertura; `target_stock` é o teto desejado; a
projeção diária faz o resto. `MANUAL` produz sugestão apenas por demanda e explode dependência de
BOM.

`planning_availability` define quais locais entram no cálculo. Parceiro, trânsito e quarentena
nunca são estoque fabril disponível, e a tentativa de incluí-los é recusada pelo banco.

## Lead time

| Política | Origem |
| --- | --- |
| `USE_CONFIGURED` | Catálogo do fornecedor, depois prazo padrão da organização. |
| `USE_OBSERVED` | Média dos dias entre emissão do pedido e recebimento postado, por fornecedor e variante. |
| `USE_MANUAL` | Override por variante em `planning_settings.lead_time_overrides`. |

O prazo define a data sugerida (`necessária − lead`) e, quando falta, a sugestão continua válida
com aviso `LEAD_TIME_MISSING`. Necessidade anterior a hoje sobe para prioridade `HIGH`.

## Fornecedor

A sugestão só usa **fornecedor preferencial único** com catálogo ativo. Não há ranqueamento por
menor preço ou menor prazo. Sem fornecedor definido, o item gera aviso `SUPPLIER_MISSING` e a
decisão de suprimento fica com o responsável. MOQ e múltiplo são convertidos para a unidade de
estoque; sem conversão válida, a sugestão é bloqueada com `UNIT_CONVERSION_MISSING`.

## Da sugestão à execução

1. O run gera `planned_orders` com estado `SUGGESTED` e `why` explicável.
2. O responsável revisa, aprova ou descarta, com motivo obrigatório.
3. A conversão parcial cria `purchase_request` (`source_type='MRP'`) ou `production_order` em
   `DRAFT`, registra `planning_conversions` e acumula `converted_qty`.
4. O restante do fluxo é o do módulo de destino: cotação e pedido em Compras, liberação e produção
   em Produção.

## Limitações

- Sem reserva de estoque: item comprometido fora do planejamento não é abatido.
- Sem lote econômico, sem sugestão por múltiplos locais e sem transferência entre locais.
- Conversão de produção exige BOM vigente; drift de BOM bloqueia e pede novo run.
- Lead time observado usa apenas recebimentos postados; histórico curto produz prazo conservador.
