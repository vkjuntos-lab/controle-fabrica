# Rentabilidade histórica

Rentabilidade histórica não deve ser recalculada utilizando apenas custo atual.
Marketplace Gross Amount não é necessariamente receita da fábrica em operações de parceiros.
Rentabilidade não é caixa, recebimento ou saldo bancário.

## COGS e snapshots

COGS nesta versão utiliza STANDARD publicado e aplicável à data da venda, multiplicado pelas unidades. `sale_cost_snapshots` preserva versão de custo, preço/receita, quantidade, deduções, moeda, referências e pendências. Não aplica FIFO nem converte custo padrão em custo médio de estoque.

Na venda própria, `profitability_capture` cria o snapshot explicitamente, com profitability.read + costs.calculate. Um snapshot completo permanece imutável. Se um snapshot estava incompleto, processamento explícito pode gerar uma nova captura quando as fontes faltantes forem disponibilizadas, preservando a anterior.

No parceiro, o fechamento da reconciliação captura automaticamente os itens reconciliados. A receita é `billable_amount`: gross marketplace 150, billable fábrica 80, COGS 45 → margem bruta 35. Não se usa 150 − 45. Custos ausentes geram pendência, sem impedir fechamento comercial ou inventar COGS. Snapshot incompleto de fechamento não é atualizado em lugar: exige revisão controlada do fechamento. Reabertura preserva as capturas antigas; o relatório exclui o período até novo fechamento e então usa a captura correspondente à nova data de fechamento.

O relatório econômico por item não distribui automaticamente ajustes globais de crédito/débito do fechamento; não deve ser confundido com total líquido a cobrar após esses ajustes.

## Valores reais, estimados e ausentes

Na venda própria, receita usa gross_amount + frete cobrado do cliente. A taxa `platform_fee` já informada é aplicada como efetiva. Comissão, frete pago/subsidiado pela empresa, imposto e outras despesas vêm de `sale_economics` quando explicitamente informados. Esse registro preserva documento/referência e é imutável.

Sem valores efetivos, uma regra configurada aplicável pode estimar as despesas. A captura identifica CONFIGURED_ESTIMATE. Não assume que frete cobrado do cliente equivale ao frete pago pela empresa. Se desconto existe e seu financiador é desconhecido, mantém pendência; desconto do marketplace não é deduzido como gasto da fábrica.

Taxas do marketplace na operação do parceiro não são automaticamente despesas da fábrica. É necessário informar despesas assumidas pela fábrica ou uma regra explícita de contrato.

Componentes: receita, COGS, comissão, taxas, frete empresa, desconto empresa, impostos, outras despesas. Contribuição = receita − soma desses custos. Margem percentual = contribuição / receita. Dados insuficientes deixam contribuição NULL, exibida como Pendente, mesmo se a margem bruta já puder ser apurada.

Custos atuais são BRL; vendas em outra moeda ficam incompletas até existir método cambial. Relatório agrupa moedas separadamente. Não soma BRL com USD.

## Consultas e rastreabilidade

`/relatorios/rentabilidade` agrega no servidor por produto, variante, marketplace, loja, parceiro ou venda. Filtros: período (1/3/6/9/12 meses ou personalizado), produto, categoria, SKU/busca, loja, parceiro e canal. Alguns filtros específicos atualmente recebem identificadores; melhorar os seletores é uma pendência de usabilidade.

Ordenação por unidades, contribuição total/unitária ou margem permite comparação factual de volume × margem. Detalhamento chega ao snapshot com transação e fontes utilizadas. Custo atual não recalcula esses números.

Paginação de 50 grupos; exportação CSV consulta páginas server-side com os mesmos filtros, organização e profitability.export, neutralizando fórmulas em texto. Não há XLSX nem fotografia transacional única entre páginas exportadas; exportações concorrentes com novos fechamentos devem ser refeitas após estabilizar o período.

Permissões profitability.read e profitability.export, separadas de leitura de produto. RLS e validações RPC protegem também acesso por ID. Dados da simulação não são receita nem fatos de venda.

## Limitações explícitas

Sem reconciliação bancária para margem; sem DRE contábil, fiscal completo ou previsão. Sem correção em lugar de valores econômicos efetivos: correções precisam de evolução auditável. Importador automático de marketplace não está concluído no checkout; vendas já registradas pelo contrato existente podem ser capturadas. Publicação cloud e navegação autenticada em produção precisam de validação separada.

Observação de integração: o schema atual de MarketplaceSale tem unicidade de `external_event_id` incluindo NULL. Para múltiplas vendas na mesma loja, fornecer identificadores externos distintos; revisar o tratamento de eventos sem identificador pertence ao módulo de importação/marketplace. O teste de rentabilidade não remove essa constraint nem simula importador.
