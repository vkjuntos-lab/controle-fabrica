# Políticas comerciais

Data: 26/09/2026. MASTER 012. As políticas são configuráveis por organização e aplicadas no
servidor; a interface apenas as apresenta e envia a intenção.

## Crédito

`customer_credit_policies` define limite, dias de carência e alçada por cliente. O servidor
recusa operação acima do limite disponível e considera o carveiro de valores já comprometidos.
Cliente `BLOCKED` é recusado em qualquer operação comercial, mesmo dentro do limite.

Crédito é limite de política, não表皮 de财务: nada aqui emite título, não registra recebimento e
não substitui o financeiro do MASTER 013.

## Desconto e alçada

`commercial_discount_authorities` define, por papel, a faixa de desconto e o percentual máximo
que a pessoa pode aprovar, e o status daauthority (ativa, expirada, revogada). Um desconto acima
da alçada exige aprovação de quem a tem, registrada em `quote_approvals`, com aprovador, momento
e limite. Tentativa negada também gera auditoria.

## Condição de pagamento

`commercial_payment_terms` define prazo em dias e número de parcelas. A condição escolhida na
proposta precisa estar habilitada e dentro da alçada do cliente; prazo maior que o permitido é
recusado pelo servidor.

## Carteira e território

Atribuição de cliente, apoio e território são configuráveis e têm vigência, conforme
[SALES-REPRESENTATIVES.md](SALES-REPRESENTATIVES.md). Troca de titular é transacional e
encontra o histórico preservado.

## Motivos e padronização

Perda de oportunidade, recusa de proposta, desqualificação de lead e cancelamento exigem motivo
de `commercial_reasons`. A padronização não é burocracia: sem motivo estruturado não há análise
de causa, e análise de causa é o que separa um pipeline que aprende de um que só acumula.

## Comissionamento

Regras são cadastradas e simuladas; a apuração financeira é do MASTER 013. Ver
[SALES-REPRESENTATIVES.md](SALES-REPRESENTATIVES.md).

## Imutabilidade

Configuração comercial salva por `crm_save` exige `crm.configure`. Identificadores e
`organization_id` não são editáveis, e uma configuração referenciada por registro existente não
pode ser apagada — a referência é preservada e o registro continua legível.
