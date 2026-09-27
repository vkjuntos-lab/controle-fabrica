# Representantes, carteiras e comissões
SalesRepresentative pode ser INTERNAL, EXTERNAL ou COMPANY, ligado opcionalmente a usuário ou Company. Representante sem usuário não ganha acesso ao SaaS.

CustomerPortfolioAssignment mantém uma atribuição PRIMARY ativa por cliente. Transferência encerra a anterior e insere outra, com autor/data/motivo, em transação. Não existe atribuição secundária/apoio nesta versão. Oportunidades anteriores conservam seu representante.

SalesTerritory pode guardar região, UF, cidade e segmento. CustomerTerritories permite múltiplos vínculos; CustomerTags permite múltiplas etiquetas. A interface associa esses vínculos e filtra clientes por representante, território, etiqueta, origem, segmento e status. Não há descoberta automática de territórios nem remoção de vínculos históricos.

## Autorização externa
Uma identidade vinculada a representante EXTERNAL/COMPANY tem permissões limitadas centralmente e registros do CRM filtrados pela carteira atual. Não basta filtro visual. Company/Contact têm políticas restritivas adicionais. Leituras amplas de Parceiros, Financeiro, Reconciliação, Custos, Planejamento e Estoque não são concedidas pelo papel base dessa identidade. Catálogo e preços são referências comerciais compartilhadas. Usuários internos conservam o RBAC existente.

## Comissão
CommissionPlan exige fato gerador futuro SALE_CONFIRMED ou RECEIPT_CONFIRMED. CommissionRule tem vigência, representante/cliente/variante opcionais e PERCENT ou FIXED_PER_UNIT.

Simulação por proposta: percentual incide no valor do item após desconto; valor fixo multiplica unidades. Cada regra é cenário independente; resultados sobrepostos não devem ser somados. Não há precedência automática de regras, comissão por categoria/canal, apuração, elegibilidade financeira ou pagamento. Nenhum recebível/pagável é criado.
