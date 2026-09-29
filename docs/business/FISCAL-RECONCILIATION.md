# Conciliação fiscal

`fiscal_reconciliations` guarda execuções imutáveis, autoria, status e findings. Uma conferência nova não sobrescreve a anterior. Divergência material cria `fiscal_exceptions`; resolução exige justificativa, responsável da organização quando informado e histórico append-only.

## Saída

Compara itens fiscais com a operação de origem. Para venda, mostra quantidade pedida, quantidade abrangida pela expedição/documento e recebível associado ao SalesOrder. O cenário 100/60 preserva o saldo de 40 sem novo pedido, documento ou movimento. Sem autorização oficial, o resultado fica pendente.

Remessa permanece transferência de posse. Não há leitura do valor bruto do marketplace como receita da fábrica nem geração de venda pela remessa. A conferência completa entre remessa, retorno, PartnerReconciliation e valores cobrados ainda é parcial: os vínculos operacionais existem, mas falta comparação consolidada por período.

## Entrada

Compara fornecedor, linhas mapeadas, quantidade, preço, quantidade de linhas e total do título explicitamente vinculado. Recusa mapeamento duplicado e título de outra origem. Divergência vira MISMATCH; falta de comprovação/arquivamento fica PENDING. XML, tributos, frete e autenticidade exigem conferência adicional; não se marca MATCHED apenas porque mercadoria e valor coincidiram.

## Efeitos

Não chama escritores de Inventory Ledger, financial_transactions, account_receivables, account_payables ou Cost Engine. O módulo apenas vincula e relata. Recuperabilidade do tributo fica no snapshot, sem mudar custos históricos. Eventual ajuste deverá ser feito pelo fluxo autorizado do domínio responsável.

## Relatórios

Listagens têm paginação de 50, pesquisa e filtros. Dashboard agrega estados reais. Exportação JSON autorizada exporta a página/filtros selecionados, registra auditoria e declara que é relatório interno. Não gera SPED, EFD ou declaração oficial.
