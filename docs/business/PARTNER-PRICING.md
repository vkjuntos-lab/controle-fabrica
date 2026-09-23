# Tabelas de preço e regra comercial de parceiros

Complemento do MASTER 007 ao domínio de reconciliação (ver PARTNER-RECONCILIATION.md).

## Visão

O marketplace informa `gross_amount`/descontos/taxas/frete por venda — é o **gross** (referência).
O valor que será efetivamente cobrável do parceiro no fechamento é resolvido por **regra
comercial** na data da venda, não pelo gross.

## Estrutura

- `price_tables` — cabeçalho: `name`, `currency`, `status` (ACTIVE/INACTIVE/DRAFT), vigência
  `valid_from`/`valid_to`, prioridade de criação.
- `price_table_items` — preço unitário por variante dentro da tabela, com status e vigência
  próprios.
- `partner_price_links` — vínculo parceiro → tabela com vigência; um parceiro pode ter preço em
  várias janelas de tempo (`rec_resolve_price` escolhe a vínculo/tabela/item vigentes na data).

## Resolução na data da venda (`rec_resolve_price`)

1. Vínculo do parceiro ativo na data (`partner_price_links.valid_from <= data <= valid_to`).
2. Tabela ativa na data com item ativo para a variante, ambos pela mesma janela.
3. Se encontrou: `unit_price` da tabela prevalece (e o `rec_sale_net` vira referência, não o gross).
4. Se não há tabela: o líquido da venda (`gross - desconto - taxa + frete`, `rec_sale_net`) é usado.

Se nenhum dos dois existir, o item abre `PRICE_NOT_FOUND` ao processar.

## Ciclo de vida

- `price_save_table`/`price_save_item` criam/atualizam com auditoria e checagem de permissão
  (`partner_pricing.manage` para escrita; leitura por `partner_pricing.read`).
- `price_link_partner` vincula/desvincula parceiro → tabela; uma atualização cobre a vigência
  antiga, nunca reescreve preço em itens já reconciliados (o snapshot do período congelou o valor).
- Telas: `/reconciliacao/tabelas-preco` (+ `/tabelas-preco/$id` para itens/vínculos).

## Regras aplicadas ao fechamento

- O **snapshot** do período congela valores/unidades no momento do fechamento; alterações de tabela
  depois disso não retroagem sobre itens já fechados.
- Nenhum ajuste de preço pós-fechamento invisível: correção exige reabrir o período.

## Regras de negócio

- Percentuais (desconto/taxa) são como recebidos do marketplace ou digitados; não há composição
  fiscal/inventada. Frete soma ao líquido.
- A regra comercial é determinística por (variante, parceiro, data) — a mesma venda reprocessada
  sempre resolve o mesmo preço, garantindo idempotência do fechamento.