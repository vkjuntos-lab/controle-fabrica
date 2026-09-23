# Reconciliação de parceiros — regras de negócio

Domínio implementado no MASTER 007 sobre parceiros (MASTER 006), Inventory Ledger (MASTER 003),
catálogo (MASTER 002) e fundação (MASTER 001). Termina no **fechamento comercial** + evento
`PARTNER_RECONCILIATION_CLOSED`. Não inclui financeiro (cobrança/pagamento), fiscal, NF ou IA.

## Pilares

1. **Remessa não é venda.** Enviar estoque ao parceiro não registra venda e não gera receita.
   Venda é o que o marketplace reporta (`marketplace_sales`) ou o que o operador registra
   manualmente na tela.
2. **Venda importada não é automaticamente reconciliada.** A venda fica `IMPORTED`/`VALIDATED`
   aguardando inclusão em um período. Nada baixa estoque na importação.
3. **Uma venda reconciliada produz no máximo uma baixa oficial de estoque.** O item
   `partner_reconciliation_items` gera um único `PARTNER_RECONCILIATION` OUT no ledger com
   chave de idempotência `rec-item:<id>`; reprocessar nunca duplica a baixa.
4. **Gross do marketplace ≠ valor cobrável do parceiro.** O valor do marketplace é referência
   (`gross_amount`). O cobrável segue a **regra comercial**: tabela de preço vinculada ao
   parceiro na data da venda vence; sem tabela, usa a referência líquida da venda.
5. **`CLOSED` é histórico imutável.** Ao fechar, o período gera snapshot de valores/unidades,
   escreve auditoria e publica `domain_events`. Venda tardia vira exceção
   `LATE_SALE_AFTER_CLOSING`; correção pós-fechamento exige reabrir com motivo.

## Fluxo

1. Cadastro: lojas (`marketplace_stores`, ownership FACTORY/OWN/PARTNER), mapeamento de SKU
   (`external_sku_mappings`, por loja ou global), tabelas de preço e vínculo parceiro → tabela
   (`partner_price_links`).
2. Importação/registro de vendas: `marketplace_register_sale` valida loja, datas, SKU, evita
   duplicata por `external_event_id`/`import_key` e **não** toca estoque.
3. Período: `rec_create` (parceiro + de/até + frequência); `rec_preview` mostra o que será
   reconciliado (vendas elegíveis do período).
4. Processar: `rec_process` resolve cada venda em item (mapeamento SKU, preço, disponibilidade
   de estoque em terceiros) e aplica a baixa única quando válida.
5. Revisar: exceções abertas são resolvidas (`rec_exception_resolve`); itens podem ser
   reprocessados após corrigir mapeamento/estoque (`rec_reprocess_item`).
6. Fechar: `rec_close` valida restrições (exceções bloqueantes, estoque), congela snapshot e
   publica o evento. Reabrir (`rec_reopen`) exige motivo. Cancelar (`rec_cancel`) só vale sem
   baixa aplicada. Estorno de baixa (`rec_reverse_item`) cria movimento compensatório IN.

## Exceções

Centralizadas em `reconciliation_exceptions` com tipo, severidade, status, mensagem e detalhes:
`PARTNER_NOT_MAPPED`, `PARTNER_LOCATION_NOT_CONFIGURED`, `SKU_NOT_MAPPED`,
`INSUFFICIENT_PARTNER_STOCK`, `PRICE_NOT_FOUND`, `DUPLICATE_SALE`, `ALREADY_RECONCILED`,
`INVALID_QUANTITY`, `INVALID_DATE`, `STORE_PARTNER_MISMATCH`, `INVENTORY_EFFECT_FAILED`,
`COMMERCIAL_RULE_ERROR`, `LATE_SALE_AFTER_CLOSING`, `OTHER`.

Severidade `BLOCKING` impede fechamento. Resoluções: `MANUAL`, `SUPPLY_MOVEMENT`, `REPROCESS`,
`IGNORED_BY_ADMIN` (só admin autorizado, registrado em auditoria).

## Fechamento e reabertura

- `rec_close` exige período `READY_TO_CLOSE` (ou recria snapshot), sem exceção bloqueante e com
  estoque suficiente; grava totais (vendas, unidades, gross, cobrável de itens, ajustes, cobrável
  líquido) em `partner_reconciliations.snapshot`, marca `closed_at = now()` e publica o evento.
- Itens `CLOSED` passam a exigir reabertura para correção; vendas novas dentro do período fechado
  geram `LATE_SALE_AFTER_CLOSING` em vez de entrar silenciosamente.
- `rec_reopen` pede motivo, reverte para revisão e permite ajustes/estornos controlados; só o
  re-fechamento consolida novamente.

## Concorrência e idempotência

Fechamentos concorrentes terminam em um único `CLOSED` histórico (guard + lock por organização).
Todas as operações são idempotentes no retry: chaves únicas para venda/importação, mapeamento,
baixa de item (`rec-item:<id>`), exceção por item/sale/tipo e snapshot.

## Estoque em terceiros

A baixa só é aplicada quando o parceiro tem saldo suficiente na **localização PARTNER do
parceiro** (derivada do Inventory Ledger) — `INSUFFICIENT_PARTNER_STOCK` bloqueia. A resolução de
exceção não "fabrica" estoque: mover físico exige remessa/suprimento real antes do reprocess.