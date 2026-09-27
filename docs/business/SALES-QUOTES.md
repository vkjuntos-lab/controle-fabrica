# Propostas comerciais versionadas
SalesQuote é proposta comercial, não pedido. Cada versão congela Company, condição de pagamento, produtos, preços oficiais e totais. Mesmo DRAFT não pode ter seus valores sobrescritos: mudanças geram nova versão. Não há exclusão empresarial.

## Preço e total
O serviço Pricing resolve PriceTableItem vigente na data de emissão, da tabela e variante indicadas. Não há tabela paralela. Ausência de preço bloqueia criação. Quantidade deve ser positiva e produto/variante ativo.
Subtotal = soma de round(quantidade × preço, 2).
Desconto = round(subtotal × discount_percent / 100, 2).
Total = subtotal − desconto + frete informado + tributos informados.
O percentual de desconto é informado pelo usuário e validado por alçada; não é calculado arbitrariamente. Frete/tributos não são motor fiscal.

Revisão recebe itens explicitamente, recalcula com preço vigente e cria nova versão do mesmo número; não copia silenciosamente itens nem reescreve a anterior. Não se assume uma única versão em negociação; somente uma versão por número pode ser aceita.

## Aprovação e aceite
DRAFT → PENDING_APPROVAL → APPROVED → SENT → ACCEPTED ou REJECTED. Cancelamento preserva histórico. Validade vencida bloqueia aprovação/envio/aceite, mas não existe job para marcar EXPIRED automaticamente.

Aprovar exige quotes.approve, alçada explícita por usuário e motivo. Nenhuma alçada é presumida mesmo para administrador. Bloqueios configurados de vencidos/exposição são aplicados na aprovação; cliente inativo/bloqueado impede aprovação/envio/aceite. Não há regra automática de margem mínima ou prazo especial.

SENT registra envio feito fora do sistema; não envia e-mail/WhatsApp. Aceite exige contato ativo da empresa, registra usuário/data/evidência textual e publica uma única linha PENDING de domain_events: SALES_QUOTE_ACCEPTED, event_key sales_quote_accepted:<quote_id>, payload com quote_id, version, company_id, total, currency e schema_version. O consumidor MASTER 013 deverá buscar os itens imutáveis e deduplicar por quote_id/event_key; ainda não há entrega externa de evento ou SalesOrder.

## Consulta
Estoque usa inventory_get_balance; projeções consultam o último PlanningRun base concluído e mostram data/origem. On hand, recebimento programado e planejado são separados. Nada reserva estoque ou promete entrega.

Consulta de margem exige commercial_sensitive.read + costs.read. É estimativa do custo histórico aplicável à emissão, não COGS de venda ou snapshot definitivo de margem. Propostas não persistem margem. CSV é implementado; PDF próprio e assinatura eletrônica não.
