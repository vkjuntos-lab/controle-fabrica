# Pipeline e oportunidades
SalesPipeline e SalesPipelineStage são configuráveis, com posição e probabilidade entre 0 e 100. SalesOpportunity pertence a Company, pipeline e etapa da mesma organização. O representante é copiado da carteira ativa na criação, sem mudança retroativa quando a carteira é transferida.

OpportunityItem referencia ProductVariant e guarda quantidade e preço unitário estimados. estimated_total = round(quantidade × preço, 2); estimated_value soma itens. Esses preços são estimativas autorizadas, não publicação na tabela de preços.

## Transições e histórico
Oportunidades OPEN podem mudar para outra etapa do mesmo pipeline ou ser encerradas como WON, LOST ou CANCELED. LOST exige motivo configurado de perda. Mudança de etapa cria OpportunityStageHistory com snapshots da etapa anterior e nova; renomear etapas não reescreve esses snapshots. WON não cria venda, pedido ou receita.

Kanban permite escolher/mover etapa com validação server-side. Lista e detalhe apresentam itens, histórico e referências. Não há motor automático de movimentação por prazo. A edição geral de itens/título após criação não está implementada; a operação disponível é transição/encerramento.

O valor ponderado usa a probabilidade configurada, é identificado como estimativa e não entra como demanda confirmada no MRP. Integração operacional será feita pelo MASTER 013 com deduplicação por origem.
