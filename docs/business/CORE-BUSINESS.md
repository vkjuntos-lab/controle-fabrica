# Contexto de negócio

## Empresa

Fábrica que produz e comercializa produtos, inicialmente do segmento de dança (sapatilhas, meias,
camisetas, acessórios). Possui produção própria, estoque próprio, loja própria, vendas B2B,
marketplaces (com múltiplas lojas por marketplace) e empresas parceiras/revendedoras.

## Fluxo empresarial

```text
MATÉRIA-PRIMA -> PRODUÇÃO -> PRODUTO ACABADO -> ESTOQUE -> DISTRIBUIÇÃO
   -> MARKETPLACES | PARCEIROS | B2B | LOJA PRÓPRIA
   -> VENDA -> COBRANÇA -> RECEBIMENTO -> FINANCEIRO -> RENTABILIDADE -> INTELIGÊNCIA
```

O CRM é apenas um dos módulos, não o centro do sistema.

## Fluxo crítico: parceiro (consignação)

```text
Fábrica envia mercadoria ao parceiro
 -> parceiro mantém os produtos em sua posse
 -> parceiro vende
 -> recebemos o relatório de vendas
 -> importamos o relatório (CSV/XLSX ou lançamento manual autorizado)
 -> identificamos SKU e quantidade
 -> reconciliamos a venda
 -> baixamos o estoque em posse do parceiro
 -> acumulamos o valor devido
 -> fechamos o período
 -> geramos cobrança
 -> registramos pagamento
 -> atualizamos financeiro e relatórios
```

## Regras registradas

- **Remessa para parceiro não é venda.** É movimentação de estoque para mercadoria em posse de
  terceiro.
- **Quantidade vendida é uma métrica empresarial central.** Faturamento e quantidade são dimensões
  distintas; ambas devem ser preservadas e analisáveis por produto, SKU, tamanho, cor, marketplace,
  loja, parceiro e período.
- **Inventory Ledger será a fonte oficial do estoque.** Saldo = soma dos movimentos válidos
  (entrada, produção, venda, remessa, devolução, transferência, ajuste, perda). Não haverá edição
  direta de saldo como regra principal, nem saldos independentes por tela.
- **Produtos possuem variantes.** Produto → variante (tamanho, cor, SKU, código de barras, custo,
  preço, estoque). Atributos adicionais devem ser extensíveis, não colunas fixas infinitas.
- **Marketplaces são desacoplados de layout de planilha.** A importação exigirá mapeamento
  configurável (coluna externa → campo interno) e tradução `external_sku` → SKU/variante interna.
- **Tenant é a organização** (`organization_id`), não a loja.

## Regras ainda NÃO definidas (não inventar)

Impostos, composição de custo, margem, política de preço, regras de cobrança, crédito e
contabilidade. O código deve estar preparado para recebê-las, sem cálculos presumidos.
