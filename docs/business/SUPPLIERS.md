# Fornecedores — Suppliers

Documento de negócio e modelo técnico do cadastro de fornecedores (MASTER 010). Complementa
`PURCHASING.md` e `GOODS-RECEIPT.md`.

## Princípio central

Fornecedor **não é uma tabela própria, é uma empresa com papel `SUPPLIER`**. A pessoa jurídica
vive em `companies` (já usada por parceiros no MASTER 006); o `supplier_profiles` é o "cartão de
fornecedor" da organização (código, condições, preferência), e `supplier_products` é o catálogo de
compras daquele fornecedor para cada variante.

## Modelo de dados

| Objeto | Papel |
| --- | --- |
| `companies` | PJ/PF com documento normalizado (CPF/CNPJ/OTHER), endereços e contatos (base do MASTER 006). |
| `company_roles` | `company_id` com `role='SUPPLIER'` (a empresa pode ser simultaneamente PARTNER/CUSTOMER/RESELLER). |
| `supplier_profiles` | Perfil de compra: `supplier_code` único por organização, `status`, `default_payment_terms`, `lead_time_days`, `minimum_order_value`, `preferred`, `currency`, `notes`. `UNIQUE(organization_id, company_id)` e `UNIQUE(organization_id, supplier_code)`. |
| `supplier_products` | Relação fornecedor×variante: `supplier_sku`, `supplier_description`, `purchase_unit_id`/`inventory_unit_id`, `conversion_factor`, `last_price`, `minimum_order_quantity`, `lead_time_days`, `status`. |
| `company_roles` (FK via `company_roles`) | Garante que o papel SUPPLIER compartilha a mesma `company_id` (helper `supplier_profiles`). |

## Cadastro (`supplier_save_company`)

Uma única chamada cria, na mesma transação:

1. `companies` (se inexistente; upsert por documento/nome);
2. `company_roles` `SUPPLIER` (`ON CONFLICT DO NOTHING`);
3. `supplier_profiles` com `supplier_code` (único por organização);
4. o(s) produto(s) do catálogo informado(s) pelo payload.

O **RS retorna o `company_id`** (e o perfil criado); **todos os RPCs de compras usam o
`supplier_profiles.id`** (`supplier_id`) — atenção ao mapear payloads e links (o detalhe do
fornecedor consulta por `company_id`).

## Catálogo (`supplier_product_save`)

Cadastra/atualiza a variante no catálogo do fornecedor. Deixando unidades em branco o sistema
herda os padrões e `conversion_factor` default `1`; o fator alimenta o cálculo de estoque no
recebimento (ex.: rolo → m com fator 5 ⇒ receber 2 rolos entra 10 m). `minimum_order_quantity`,
`lead_time_days` e preço de referência opcionais.

## Consulta (`supplier_query`)

| kind | Retorna |
| --- | --- |
| `suppliers` | Lista (50/página) com `company_id`, `supplier_id`, código, razão/nome fantasia, status, `product_count`, `open_orders`; filtro por texto e status. |
| `supplier` | Detalhe completo (`company_id`+documentos+perfil) com `products`, `orders`, `receipts`, `documents`, `returns` (20 cada) e `payables` (somente com `payables.read`). |
| `products` | Catálogo do fornecedor (filtrável por `supplier_id`), com unidades e fator. |
| `dashboard` | KPIs: fornecedores ativos, produtos catalogados, pedidos em aberto, documentos sem casamento, exceções em aberto. |

## Regras

- Código de fornecedor único por organização; documento (CPF/CNPJ) com validação de formato
  server-side (mesma função de `companies`).
- Desativação por `status` (INACTIVE/BLOCKED) — sem exclusão física quando há histórico.
- `supplier_product_save` grava `last_price`/`last_price_date` como referência; o preço **oficial**
  do item de compra é o do pedido. A postagem do recebimento atualiza `last_price` do catálogo.
- Permissões: `suppliers.read` (ler) e `suppliers.manage` (cadastrar/editar catálogo).

## Telas

- `/fornecedores` — lista, busca, criação de fornecedor + catálogo inicial e dashboard.
- `/fornecedores/$id` — Fornecedor 360: detalhe, produtos do catálogo (adicionar/editar),
  pedidos, recebimentos, documentos, devoluções e histórico financeiro.

Detalhes de integração nos fluxos de compra: `PURCHASING.md`.