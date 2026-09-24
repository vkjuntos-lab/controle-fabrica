# Recebimento de Mercadorias — Goods Receipt

Documento de negócio e modelo técnico do recebimento físico, inspeção e postagem (MASTER 010).
Complementa `PURCHASING.md`. Este é o ponto onde compra vira **estoque**, **custo** e
**obrigação financeira**.

## Fluxo

```
PO (APPROVED/SENT/RECEIVING) ──po_receive──▶ Recebimento DRAFT
   → receipt_action inspect  → ACCEPTED ou REJECTED (por item)
   → receipt_action post     → POSTED  (ledger + custo + AP)  [imutável]
   → receipt_action cancel   → CANCELED (antes da postagem)
```

## Criar (`po_receive`)

- Permissão `goods_receipts.create`; trava por organização (`inventory_lock`).
- Só para pedidos `APPROVED/SENT/RECEIVING`; número sequencial `GR-<ano>-<6 dígitos>`.
- Itens default = o que está em aberto (`ordered − received`); também aceita payload explícito.
- **Excedente sobre o pedido**: com `over_receipt_policy=BLOCK` e sem `purchase_exceptions.resolve`,
  a quantidade é **cortada para o restante do pedido** e registrada uma exceção `OVER_RECEIPT`
  WARNING (`requested` / `capped`). Com `AUTH_OVERRIDE` (ou permissão de resolution) o excedente é
  aceito e gera exceção WARNING `requested`/`ordered`.
- Itens nascem `ACCEPTED` com as unidades e fator herdados da linha do pedido; `total_received` e
  `total_accepted` são recalculados. O pedido vai a `RECEIVING`.
- Se nenhum `destination_location_id` for informado, usa o do pedido; a postagem exige localização.

## Inspecionar (`receipt_action inspect`)

- Permissão `goods_receipts.inspect`; somente `DRAFT`/`UNDER_INSPECTION`.
- Item a item: `accepted_quantity` entre 0 e o recebido; rejeitado ⇒ `rejected_quantity` e
  `reason`; unidade aceita não pode exceder o recebido.
- Excedente aceito além do restante do pedido só com `AUTH_OVERRIDE`/permissão (gera exceção).
- Ao final: recebimento `ACCEPTED` (algum item aceito) ou `REJECTED` (nenhum).

## Postar (`receipt_action post`)

- Permissão `goods_receipts.post`; exige inspeção prévia (`ACCEPTED`/`REJECTED`) e localização de
  destino; recusa se já existe movimento `GOODS_RECEIPT` para o recebimento (idempotência).
- Para cada item aceito (`accepted_quantity > 0`):
  1. **Ledger**: movimento `PURCHASE_RECEIPT` IN pelo `reference` do recebimento, com
     `quantity = accepted × conversion_factor`, idempotência `PURCHASING:GR:<receipt>:<item>`;
  2. **Custo**: `purchasing_apply_cost_policy` grava `purchase_receipt_costs` e aplica a política
     (`NONE/LAST_PURCHASE/STANDARD/AVERAGE`). `LAST_PURCHASE`/`AVERAGE` criam/supersedem a versão
     ativa de custo **somente quando o valor difere e a data é posterior** (nunca reescreve
     histórico) — integração com o Cost Engine (MASTER 009);
  3. **Pedido**: soma ao `received_quantity` e avança `PARTIALLY_RECEIVED`/`RECEIVED`; itens
     rejeitados nunca entram no saldo.
- Ao postar: recebimento `POSTED` (imutável); pedido vira `COMPLETED` quando todos os itens
  fecham (senão permanece `RECEIVING`); a requisição vínculada tem seus itens `ORDERED` cancelados.
- **Financeiro**: com `payable_on=GOODS_RECEIPT`, `purchasing_create_payables` cria os títulos da
  `account_payables` (parcelas de `payment_terms`, `UNIQUE(org,source_type,source_id,installment)`,
  uma obrigação por pedido). Frete segue `freight_policy` (`EXPENSE_SEPARATELY` ou pro-rata no
  custo de inventário).
- Evento `purchasing.receipt.posted` no `domain_events`.

## Cancelar (`receipt_action cancel`)

- Permissão `goods_receipts.cancel`; somente antes da postagem (`POSTED/CANCELED` recusados).
- Devolve o pedido a `SENT` (se enviado) ou `APPROVED` quando não há outro recebimento vigente.

## Consulta (`receipt_query`)

- `receipts` — lista do recebimento com pedido/fornecedor/itens/status (50/página, filtros).
- `receipt` — detalhe com `receipt`, `order` e `items` (+ `effective_unit_cost` quando
  `accepted_quantity > 0`).

## Imutabilidade

As tabelas `goods_receipts`/`goods_receipt_items` têm triggers que **rejeitam UPDATE/DELETE** de
registros `POSTED` (e o movimento vinculado). Toda correção física depois da postagem é um novo
documento (devolução a fornecedor ou ajuste de estoque com motivo), nunca um UPDATE no recebimento.

## Regras

- Quantidade de inventário = aceita × fator de conversão; unidade do item aceito segue o catálogo.
- Localização de destino é obrigatória na postagem (do recebimento ou do pedido).
- Público-alvo: estoquista/gestor com `goods_receipts.*`; financeiro lê recebimentos e títulos gerados.
- Telas: `/compras/recebimentos` (+ `/$id` com inspeção por item e postagem).