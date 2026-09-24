# Compras — Purchase to Pay

Documento de negócio e modelo técnico do módulo de compras do MASTER 010. Cobre o fluxo completo
de **requisição → cotação → pedido → recebimento → inspeção → postagem → documento → pagamento**,
com exceções e reposição. É o "Purchase to Pay" da fábrica.

Documentos relacionados: `SUPPLIERS.md` (cadastro de fornecedores), `GOODS-RECEIPT.md`
(recebimento/inspeção/postagem), `REPLENISHMENT.md` (sugestão de compra).

## Princípios centrais

1. **Banco é a fonte da verdade** — toda escrita acontece por RPCs `SECURITY DEFINER` que validam
   tenant (`organization_id`), permissão e transição de estado. As tabelas novas são **SELECT-only**
   para o papel autenticado (RLS estrita); escrita direta é `permission denied`.
2. **Estados explícitos e imutáveis** — depois de *postado* (recebimento, devolução) ou
   *concluído* (pedido), o registro não muda. Correção é um novo documento, nunca edição.
3. **Financeiro nunca é inventado** — recebimento gera contas a pagar, custo e saldo de estoque
   apenas quando postado, nas políticas configuradas. Aprovação respeita **segregação de funções**.
4. **Custo ≠ preço ≠ receita ≠ recebimento** — o custo de aquisição segue a política
   (`acquisition_cost_policy`) e versiona `material_cost_versions` (integração com o Cost Engine,
   MASTER 009). Nenhuma RPC de compras lança AR/despesa fora das regras do módulo financeiro existente.

## Modelo de dados

| Objeto | Papel |
| --- | --- |
| `companies` / `company_roles` / `supplier_profiles` | Fornecedor (ver `SUPPLIERS.md`). |
| `supplier_products` | Catálogo do fornecedor (SKU interno, unidades e fator de conversão). |
| `purchase_requests` / `purchase_request_items` | Requisição de compra e itens (necessidade interna). |
| `quotations` / `quotation_suppliers` / `quotation_supplier_items` | Cotação: pedidos de proposta a 1..n fornecedores. |
| `purchase_orders` / `purchase_order_items` | Pedido de compra e itens com preço/frete/impostos. |
| `goods_receipts` / `goods_receipt_items` | Recebimento físico e inspeção (ver `GOODS-RECEIPT.md`). |
| `supplier_returns` / `supplier_return_items` | Devolução ao fornecedor. |
| `supplier_documents` / `supplier_document_items` | Documentos fiscais (nota/fatura) conciliados ao pedido. |
| `purchase_exceptions` | Exceções de compra (excesso, variação, conversão faltante...). |
| `purchase_receipt_costs` | Histórico de custo por recebimento/variante (base do custo médio). |
| `purchasing_settings` | `acquisition_cost_policy`, `freight_policy`, `over_receipt_policy`, `payable_on`, `approval_segregation`, janelas de previsão. |
| `purchase_orders` → `account_payables` | Obrigação financeira criada na postagem (payable_on). |

## Fluxo principal

```
Requisição (DRAFT) → submit → SUBMITTED → approve → APPROVED → po_save (ORDERED)
Cotação (DRAFT) → quotation_save (AWAITING) → quotation_award (AWARDED)
Pedido (DRAFT) → submit → PENDING_APPROVAL → approve → APPROVED → send → SENT
   → po_receive → RECEIVING → inspeção (ACCEPTED/REJECTED) → post → COMPLETED
   → documento (match/process) → contas a pagar
Devolução (DRAFT) → post → POSTED (saída de estoque PURCHASE_RETURN)
```

### 1. Requisição (`request_save` / `request_action` / `request_query`)

- Criada como `DRAFT` com itens `PENDING`. `request_action submit|approve|cancel` controla o fluxo
  interno (`submit` exige `purchase_requests.create`, `approve` exige `purchase_requests.approve`,
  `cancel` exige `purchase_requests.cancel`).
- Consulta por `request_query` kinds `requests|request` (50 por página, filtro por status/número).

### 2. Cotação (`quotation_save` / `quotation_award` / `quotation_query`)

- `quotation_save` cria/atualiza a cotação **DRAFT** com fornecedores e itens (qtd + preço, desconto,
  frete, imposto, outros e `delivery_days`/`payment_terms`/`valid_until`); ao salvar um rascunho
  vai a **AWAITING**.
- `quotation_award` marca itens premiados por variante/fornecedor (com motivo e responsável);
  qualquer item `awarded` torna a cotação **AWARDED**.
- Consulta por `quotation_query` kinds `quotations|quotation` (detalhe traz `suppliers` e `items`).

### 3. Pedido (`po_save` / `po_action` / `po_receive` / `po_query`)

- `po_save` cria/edita rascunho; herda condições padrão do fornecedor e o fator de conversão do
  catálogo; recalcula `subtotal/discount/tax/freight/other/total`. Itens só de variantes da própria
  organização; quantidades > 0 e preço >= 0.
- `po_action` máquina de estados:
  - `submit` `DRAFT → PENDING_APPROVAL` (exige pelo menos um item; permissão `purchase_orders.create`);
  - `approve` `PENDING_APPROVAL → APPROVED` (exige `purchase_orders.approve`; com
    `approval_segregation` ativa, **aprovador ≠ criador**);
  - `send` `APPROVED → SENT` (`purchase_orders.send`) — "pedido enviado ao fornecedor";
  - `cancel` para qualquer status exceto `COMPLETED/CANCELED`, bloqueado se há recebimentos não
    cancelados; libera a requisição de volta a `APPROVED`/`PENDING` quando não há outro pedido vivo.
  - `po_receive` cria o recebimento `DRAFT` (ver `GOODS-RECEIPT.md`). Status do pedido vai a
    `RECEIVING`; ao completar todos os itens, `COMPLETED`.
- Consulta por `po_query` kinds `orders|order|candidates` (candidatos = pedidos aprovados/enviados
  sem documento vigente, para o 3-way do documento).

### 4. Recebimento e inspeção (`po_receive` / `receipt_action` / `receipt_query`)

Ver `GOODS-RECEIPT.md` em detalhe. Resumo: criar (DRAFT) → `inspect` (ACCEPTED/REJECTED por item,
gera `OVER_RECEIPT` quando aplicável) → `post` (ledger `PURCHASE_RECEIPT`, custo por política,
contas a pagar conforme `payable_on`) ou `cancel` (antes da postagem).

### 5. Documento fiscal (`document_save` / `document_action` / `document_query`)

- `document_save` cria/edita documento (`DRAFT`) com cabeçalho do fornecedor e itens
  (variante, quantidade, preço unitário e valores). Número de documento único por organização.
- `document_action`:
  - `match` — concilia o documento ao pedido (3-way: documento × pedido × recebimento). Sem
    correspondência ou com divergência de quantidade/valor em aberto, o item fica como exceção
    (`document-exception`), nunca fabrica saldo.
  - `process` — consolida o documento (status `PROCESSED`); é o gatilho do financeiro (contas a
    pagar) quando aplicável.
  - `cancel` — descarta o documento.
- Consulta por `document_query` kinds `documents|document`.

### 6. Exceções (`exception_action` / `exception_query`)

- `exception_action resolve|ignore|reopen`: `resolve` exige `purchase_exceptions.resolve` e registra
  decisão/responsável; `ignore` deixa `IGNORED_WITH_AUTHORIZATION`; `reopen` devolve a `OPEN`.
- `exception_query` kinds `exceptions|open` (fila de exceções em aberto).

### 7. Devolução ao fornecedor (`return_save` / `return_action` / `return_query`)

- `return_save` cria/edita devolução `DRAFT` (fornecedor, opcionalmente referente a um recebimento,
  localização de origem, itens e motivo).
- `return_action post|cancel`: `post` exige `supplier_returns.post`, valida **saldo suficiente** na
  origem e gera movimento `PURCHASE_RETURN` OUT com idempotência `PURCHASING:SR:<id>:<item>`; `cancel`
  só antes da postagem. Postada é imutável.
- Consulta por `return_query` kinds `returns|return`.

## Políticas (`purchasing_settings`)

| Política | Valores | Efeito |
| --- | --- | --- |
| `acquisition_cost_policy` | `NONE` / `LAST_PURCHASE` / `STANDARD` / `AVERAGE` | Como o recebimento vira custo. `AVERAGE` usa o histórico de `purchase_receipt_costs`; `LAST_PURCHASE`/`AVERAGE` criam/atualizam versão de custo quando o valor difere do `ACTIVE` e a data é posterior (regra sem reescrita de histórico — um custo nunca muda uma versão antiga). |
| `freight_policy` | `EXPENSE_SEPARATELY` / `INCLUDE_IN_INVENTORY_COST` | Frete do pedido: despesa avulsa ou rateado proporcional ao valor dos itens aceitos (pro-rata). |
| `over_receipt_policy` | `BLOCK` / `AUTH_OVERRIDE` | Excedente sobre o pedido: `BLOCK` corta para o restante (e registra `OVER_RECEIPT` WARNING); `AUTH_OVERRIDE` permite quando o usuário tem `purchase_exceptions.resolve` (gera exceção WARNING). |
| `payable_on` | `GOODS_RECEIPT` / `DOCUMENT` | Quando a conta a pagar é criada: no recebimento ou no processamento do documento. |
| `approval_segregation` | booleano (default true) | Proíbe o criador do pedido de aprová-lo. |

## Regras de fluxo de caixa/estoque

- **Postagem do recebimento** cria movimento `PURCHASE_RECEIPT` (IN) por item aceito, na localização
  de destino, com idempotência `PURCHASING:GR:<receipt>:<item>`, quantidade = `accepted × conversion_factor`,
  custo unitário = (item + pro-rata de frete) ÷ quantidade de inventário. Item rejeitado na
  inspeção **não** entra no saldo (motivo "rejeitado").
- **Contas a pagar**: `purchasing_create_payables` gera `account_payables` `source_type=PURCHASE`
  com parcelas derivadas de `payment_terms` (ex. `30/60` → 2 títulos), documentos `CMP-<ano>-<seq>/<i>`
  e `UNIQUE(organization_id, source_type, source_id, installment_number)`. Uma única obrigação por pedido
  (`purchasing_po_payable_total` + guarda).
- **Requisição ordenada** não é mais considerada na reposição (hjá "ORDERED").

## Permissões (RBAC)

`purchasing.read|dashboard`, `suppliers.read|manage`, `purchase_requests.read|create|approve|cancel`,
`quotations.read|create|manage|award`, `purchase_orders.read|create|approve|send|cancel`,
`goods_receipts.read|create|inspect|post|cancel`, `supplier_returns.read|create|post|cancel`,
`supplier_documents.read|create|process|cancel`, `purchase_exceptions.read|resolve`.

Padrão: admin/gestor com acesso completo; demais papéis conforme a necessidade (estoquista recebe
recebimento/inspeção/postagem e leitura das demais áreas; financeiro lê pedidos/recebimentos/pagáveis;
produção e comercial leem cotações/pedidos e criam requisições). Tudo validado server-side por
`purchasing_require` e registrado em auditoria (`purchasing.*`).

## Telas (MASTER 010)

- `/compras` — dashboard (KPIs, fluxo do mês, alertas).
- `/compras/requisicoes`, `/compras/cotacoes` (+ `/$id` com premiação),
  `/compras/pedidos` (+ `/$id` com ações e recebimento), `/compras/recebimentos` (+ `/$id` com
  inspeção), `/compras/devolucoes`, `/compras/documentos`, `/compras/excecoes`,
  `/compras/reposicao`, `/compras/configuracoes`.
- `/fornecedores` (+ `/$id` — Fornecedor 360).
- Item "Compras" (dashboard) e sub-itens no menu Operação do `AppShell`.

## Fora do escopo deste domínio

MRP/APS, previsão de demanda assistida, seleção automática de fornecedor, portal do fornecedor,
EDI/emissão de NF-e, SPED/contabilidade, automação bancária, catálogo eletrônico/efêmero e
reposição com estoque de segurança dinâmico. `replenishment_query` é sugestão (ver `REPLENISHMENT.md`).