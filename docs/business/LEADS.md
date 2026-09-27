# Leads e conversão
Status reais: NEW, CONTACT_ATTEMPTED, CONTACTED, QUALIFIED, UNQUALIFIED, CONVERTED, ARCHIVED. Motivo configurado do tipo LEAD é obrigatório ao desqualificar. Não existe score automático, NURTURE ou previsão de perda por origem.

O lead pode preceder o cadastro completo. Nome, empresa informada, contatos, origem, segmento, responsável, finalidade e notas são preservados. Comunicação de marketing não é autorizada pela mera existência do registro; marketing_opt_in começa falso.

## Conversão
A interface apresenta busca e possíveis correspondências, permitindo selecionar Company existente ou informar dados de nova empresa. CPF/CNPJ seguem normalização e validação de formato do serviço empresarial existente. Não há mesclagem por semelhança de nome.

A conversão exige QUALIFIED e permissões dos passos envolvidos. A transação serializada por organização:
1. Vincula CUSTOMER à Company existente ou cria Company por serviço compartilhado.
2. Cria/reutiliza CustomerProfile.
3. Reutiliza contato por e-mail ou telefone na mesma empresa, ou cria CompanyContact.
4. Cria oportunidade na etapa escolhida, com source_type=LEAD e source_id do lead.
5. Marca o lead CONVERTED, com company_id e converted_at.

Chave de operação e resultado ficam em crm_operation_keys. Retentativas concorrentes não duplicam empresa, contato ou oportunidade. O lead convertido não é reeditado. Não há colunas converted_customer_id ou converted_opportunity_id: a ligação da oportunidade usa sua origem.

Representante externo só consulta/altera leads atribuídos a ele; nova empresa exige equipe interna. Patches omissos preservam responsável. Testes cobrem conversão concorrente e criação por usuário comercial interno.
