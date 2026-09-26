# Pipeline e oportunidades

Data: 26/09/2026. MASTER 012.

O pipeline é configurável: `sales_pipelines` e `sales_pipeline_stages` permitem mais de um
funil e etapas ordenadas com probabilidade esperada. A oportunidade em
`sales_opportunities` guarda valor, etapa, probabilidade, ciclo previsto, responsável e origem.

## Valor e margem

O valor é `numeric`, nunca ponto flutuante. A margem exibida é calculada pelo Cost Engine a
partir dos itens e do custo vigente, e só aparece para quem tem `crm.sensitive.read`. Ela não é
gravada na oportunidade: custo muda, e um valor congelado mentiria sobre a margem atual.

Itens em `opportunity_items` guardam apenas variante e quantidade. Preço, desconto e total são
resolvidos pelo servidor na consulta, respeitando a tabela de preço vigente na data. Isso
impede que um item seja cadastrado com preço digitado errado — o cliente não informa preço.

## Transição de etapa

Mover a oportunidade é `crm_action` com a etapa de destino. O servidor:

1. valida a transição contra as regras do funil (não qualquer etapa pode ser alcançada de
   qualquer outra);
2. grava em `opportunity_stage_history` com etapa anterior, etapa nova, motivo e responsável;
3. recalcula a probabilidade ponderada por valor, quando as etapas têm probabilidade;
4. marca `WON` ou `LOST` conforme o destino, exigindo motivo de perda cadastrado em
   `commercial_reasons` para `LOST`.

O motivo é obrigatório em perda porque a análise de motivo é o principal insumo de correção
de pipeline. O histórico é append-only: corrigir o quadro não reescreve o passado registrado.

## Fechamento

`WON` e `LOST` são finais. Uma oportunidade ganha não volta para aberto, porque seu sucessor
natural é a proposta, e uma nova negociação é outra oportunidade. O ciclo previsto é comparado
ao realizado no quadro de desempenho.

## Exibição

A pipeline é kanban por etapa, com cartões ordenados por valor. Os totais do topo são somados no
cliente a partir dos mesmos dados da consulta — o servidor devolve o recorte, e a agregação é
meramente visual. A tela mostra apenas as etapas do funil selecionado e respeita o escopo do
responsável: um representante externo não vê a carteira de outro.

## Limitações

Sem forecast probabilístico, sem pontuação de risco, sem automação de movimentação de etapa e
sem forecast de receita. A previsão comercial não é apresentada como garantia: o MASTER 012
entrega histórico e ciclo, não promessa de fechamento.
