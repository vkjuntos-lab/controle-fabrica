# ADR-007 — Reconciliação de parceiros, baixa única e fechamento idempotente

Status: implementado no código; validação local. Implantação pendente.

## Contexto

MASTER 006 define remessa como transferência (não venda) e o estoque do parceiro como derivado do
Inventory Ledger, sem tabela de saldo. O checkout não continha MarketplaceStore (MASTER 005).
Não existe registro de venda, mapeamento de SKU, regra comercial nem fechamento de período — e nada
disso podia ser simulado.

## Decisão

1. **Marketplace, porém sem importação real ainda**: tabelas de loja, importação (bom para o futuro
   pipeline), vendas e mapeamento de SKU são criadas nesta etapa. A importação é manual/estruturada
   (`marketplace_register_sale`), mantendo o mesmo contrato de dados de um importador automático.
2. **Venda ≠ receita; reconciliar ≠ vender de novo.** `marketplace_registrar` valida, deduplica e
   marca; só `rec_process` resolve a venda em item e aplica a baixa — e sempre **no máximo uma
   baixa oficial** (`partner_reconciliation_items.posted=True`, idempotência `rec-item:<id>`).
3. **Gross é referência; cobrável segue regra comercial** (`rec_resolve_price`): tabela de preço
   do parceiro vigente na data vence; sem tabela, usa-se o líquido do marketplace. Nenhuma tabela
   substitui o retail price do catálogo.
4. **Estoque do parceiro continua derivado do ledger.** A baixa oficial exige saldo
   `rec_balance_asof` na localização PARTNER do parceiro; exceção resolve-se com suprimento real,
   nunca com fabricação de saldo.
5. **Fechamento consolida e congela.** `rec_close` grava snapshot (vendas/unidades/gross/cobrável/
   ajustes/líquido), um único `CLOSED` histórico sob lock por organização e publica
   `PARTNER_RECONCILIATION_CLOSED` em `domain_events`. Venda no período fechado vira
   `LATE_SALE_AFTER_CLOSING`; correção exige `rec_reopen` com motivo.
6. **Exceções centralizadas e auditáveis** em `reconciliation_exceptions`, com severidade
   BLOQUEANTE/não e resolução registrada (incluindo `IGNORED_BY_ADMIN` para admin autorizado).
7. **Segurança** espelha o padrão existente: RPCs SECURITY DEFINER + `reconciliation_require`
   validam organização e permissão; guarda de relations protege consistência; núcleo do ledger
   privado permanece intacto.

## Consequências

- Importação automática futura (MASTER 005) só precisa alimentar `marketplace_sales` com o mesmo
  contrato; a reconciliação já existente é compatível por construção.
- Valores comerciais são determinísticos por (variante, parceiro, data), preservando idempotência
  mesmo quando o retry escolhe outra tabela vigente.
- Itens fechados são imutáveis; correções pós-fechamento passam por reabertura — a não ser que o
  domínio financeiro futuro decida outro caminho, que nunca reinterpretará fatos já consolidados.
- A baixa única por item mantém remessa ≠ venda: enviar continua não gerando nada; reconciliar uma
  venda é o único caminho de consumo de estoque de parceiro vinculado à receita de revenda.