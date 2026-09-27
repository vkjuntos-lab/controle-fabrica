# CRM B2B — MASTER 012
Estado revisado em 27/09/2026. Implementação local, sem confirmação de implantação no banco publicado.

O CRM reutiliza Company, CompanyRole, CompanyContact, ProductVariant, PriceTable/PriceTableItem, Inventory Ledger, recebíveis do MASTER 008 e domain_events. O cadastro legado de varejo `customers` não tem o mesmo contrato de organização e não é convertido automaticamente em Company.

As 28 tabelas iniciais do domínio e `crm_documents` possuem organization_id e RLS. Authenticated consulta conforme permissões e carteira; escreve por RPC. As funções `crm_save`, `crm_action`, `crm_query` e `crm_document` validam o servidor. Helpers de escrita são privados.

As áreas são cadastro/segmentação, leads, contatos, representantes/carteiras, oportunidades, propostas, atividades e indicadores. As configurações são registros da organização, não segmentos ou pipelines fixos.

## Fronteiras
- Oportunidade não é venda; valor ponderado é estimativa.
- Proposta não é pedido, faturamento ou recebimento.
- Consulta de estoque não reserva nem movimenta mercadoria.
- Comissão estimada não é comissão devida.
- SALES_QUOTE_ACCEPTED prepara o MASTER 013, sem criar pedido ou obrigação financeira.
- Previsões do MRP são snapshots, nunca garantia de entrega.

## Indicadores
Dashboard agrega no banco, com período de criação e responsável. Conversão de leads = CONVERTED / leads não ARCHIVED no recorte. Aceite = ACCEPTED / (ACCEPTED + REJECTED), por versão; ainda não é métrica deduplicada por família de proposta. Denominador zero produz nulo. Valor ponderado = estimated_value × probability / 100, apenas oportunidades OPEN. Atividades atrasadas = PENDING com scheduled_at anterior ao instante da consulta.

Distribuições por etapa e representante são agregadas sobre todos os registros autorizados, não sobre a primeira página. Exportação CSV usa filtros e permissão crm.export, com neutralização de fórmulas em texto.

## Limites
Mesclagem registra solicitação deduplicada para revisão, mas não executa fusão de relacionamentos. Não há campanhas ou envios de comunicação. Documentos usam Storage privado, cuja entrega precisa de smoke test publicado. O relatório [MASTER-012-VALIDATION](../handoff/MASTER-012-VALIDATION.md) classifica a cobertura real.
