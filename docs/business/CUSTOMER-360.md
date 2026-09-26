# Customer 360

Data: 26/09/2026. MASTER 012.

O Customer 360 é a leitura única de um cliente: identificação, perfil comercial, contatos,
carteira, crédito, oportunidades, propostas, atividades e linha do tempo. Ele existe para
responder "o que aconteceu com esta conta" sem abrir cinco telas.

## Composição

A tela reúne, na organização corrente:

- **Identificação**: razão social, documento, cidade, contatos e endereços, vindos do cadastro
  de empresas e contatos.
- **Perfil comercial**: status, segmento comercial, origem, etiqueta, território, condição de
  pagamento, responsável e apoios.
- **Crédito**: limite, usado, disponível, dias de carência e alçada, de `customer_credit_policies`.
- **Relacionamento**: oportunidades com etapa e valor, propostas com status e versão vigente.
- **Atividades**: agenda do cliente, com concluídas, pendentes e reagendadas.
- **Histórico**: `audit_log` do cliente e das entidades relacionadas, em ordem cronológica.

## Dados sensíveis

Margem, custo, volume financeiro e limite de crédito exigem `crm.sensitive.read`. Sem a
permissão, a tela é montada sem esses blocos — não com valores ocultos por CSS. O `crm_query`
omite a coluna, de forma que a informação não chega ao navegador de quem não pode vê-la. Essa é a
diferença entre esconder e proteger.

## Escopo

O 360 respeita o escopo de carteira. Representante externo sem atribuição recebe a visão
reduzida do próprio escopo, e um cliente de outra organização simplesmente não existe para ele.

## Duplicidade

Quando o cadastro aparece duplicado, a tela oferece a solicitação de mesclagem
(`company_merge_requests`), que registra o par e o motivo para análise. A mesclagem em si não é
executada pela interface: ela apaga histórico comercial de uma razão social inteira, e por isso
exige decisão fora do fluxo de cadastro.

## Limitações

Sem timeline de e-mail e telefone reais, sem score de crédito, sem saturação de mercado e sem
sugestão de ação. Todos dependem de integrações externas do MASTER 013.
