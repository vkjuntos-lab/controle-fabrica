# Formação de preço

Custo não é preço. Preço não é receita. Receita não é recebimento. Markup não é margem.

O domínio Pricing utiliza os custos informados à simulação ou a referência de `ProductCostVersion` autorizada pela RPC. O simulador web recebe custo informado; não publica nada automaticamente.

## Fórmulas

- Markup multiplicador = preço / custo. R$40 × 2,5 = R$100.
- Margem bruta = receita − COGS; percentual = margem bruta / receita. Custo 50, receita 100: markup 2, margem 50%.
- Receita simulada = preço × (1 − desconto%).
- Contribuição = receita simulada − custo − receita simulada × (comissão% + taxas% + impostos%) − frete subsidiado − outras despesas.
- Preço para contribuição alvo = (custo + despesas fixas por unidade) / (1 − deduções% − margem alvo%) / (1 − desconto%).

O servidor rejeita denominadores inviáveis e valores inválidos. Arredonda o preço sugerido para cima em centavos. Percentuais são entradas explícitas, não alíquotas tributárias presumidas. Zero inicial no simulador é hipótese do usuário, não dado efetivo de venda.

## Preços oficiais e vigência

Reutiliza `price_tables`, `price_table_items` e vínculos do MASTER 007. Não existe tabela paralela de preços. `pricing_publish` exige pricing.manage e pricing.approve; insere nova linha aprovada, encerrando a vigência anterior. Datas de preço são inclusivas: preço anterior termina no dia anterior à nova vigência. Valor histórico não pode ser editado nem excluído.

`price_tables.channel` prepara PARTNER, varejo, atacado, marketplace e loja própria. A interface reutiliza as tabelas cadastradas; não há sincronização externa. `minimum_price` é informativo, sem bloqueio automático de vendas.

`pricing_variable_rules` guarda estimativas por canal, loja/variante opcionais, vigência e motivo. A regra mais específica e recente aplicável prevalece; ausência de regra não vira estimativa silenciosa. `profitability_settings.low_margin_percent` define alerta opcional de contribuição baixa.

## Permissões e operação

Rotas: `/precificacao` e editor existente `/reconciliacao/tabelas-preco`. Permissões pricing.read, pricing.manage, pricing.simulate, pricing.approve; custos referenciados exigem também costs.read. Escritas críticas são validadas server-side; somente esconder botões não é autorização.

Simulação, preço, venda e recebimento permanecem independentes. Alterar preço atual não muda preço efetivo de venda histórica. Não há preço automático por IA, atualização de marketplace, motor fiscal ou crédito.
