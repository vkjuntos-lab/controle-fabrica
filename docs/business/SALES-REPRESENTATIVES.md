# Representantes, carteiras e escopo

Data: 26/09/2026. MASTER 012.

## Tipos de representante

`INTERNAL` (funcionário da organização), `EXTERNAL` (pessoa) e `COMPANY` (empresa de
representação). O tipo define o que o servidor exige do cadastro: um externo tem documento e
dados de contato próprios; uma empresa de representação é uma organização parceira com
representantes vinculados.

## Territórios

`sales_territories` define a divisão geográfica ou de cartera. O vínculo cliente ↔ território é
`customer_territories`, com vigência. Território é o critério padrão para overflow de carteira:
ao cadastrar um cliente sem representante explícito, o servidor considera o território.

## Carteira

`customer_portfolio_assignments` liga cliente, representante, papel (titular ou apoio) e vigência.
Um cliente pode ter um titular e vários apoios. A atribuição é transacional: trocar o titular
encerra a vigência anterior e abre a nova, de modo que nunca existam dois titulares ativos.

Carteira não é propriedade individual. Lead, oportunidade e proposta herdam o responsável, mas a
visibilidade é por **escopo de carteira**, e um representante externo só enxerga o que lhe foi
atribuído — inclusive quando tem permissão de leitura ampla.

## Escopo aplicado no servidor

`crm_query` e `crm_action` filtram pelo escopo de quem chama. Não é um filtro da interface: um
representante externo que chame a API diretamente recebe apenas os registros da sua carteira.
O teste K da validação cobre exatamente esse caso, e é o motivo de a segurança do CRM não
depender da tela.

## Comissionamento

`commission_plans` e `commission_rules` descrevem o plano por gatilho (venda ganha, aceite de
proposta, recebimento) e tipo de cálculo (percentual do valor, por unidade, por margem). O plano
é cadastrado e simulado; a apuração financeira **não** acontece neste master, porque depende de
faturamento e recebimento, que são do MASTER 013. Registrar a regra agora e apagar o recibo depois
seria perda de informação.

## Limitações

Sem meta, sem ranking, sem cálculo de comissão liquidado, sem repasse a parceiro e sem
distribuição automática por território na entrada de lead.
