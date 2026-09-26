# Leads, qualificação e conversão

Data: 26/09/2026. MASTER 012.

Um lead é um contato ainda não convertido. Ele existe em `leads`, com origem, responsável,
qualificação e consentimento de contato, e vira cliente e oportunidade por uma única ação
idempotente.

## Ciclo de vida

`NEW` → `CONTACTED` → `QUALIFIED` → `CONVERTED`, com `DISQUALIFIED` como saída de qualificação
e `NURTURE` como espera.

A conversão não apaga o lead: o registro vira `CONVERTED` e guarda `converted_customer_id` e
`converted_opportunity_id`. O histórico de como a conta foi conquistada é tão comercial quanto a
conta, e perder esse vínculo inviabilisa a leitura de marketing sobre origem de receita.

## Qualificação

Faixa (`score`) e campos estruturados definem priorização. A tela de lead mostra a perda
esperada de cada oportunidade já convertida a partir daquela origem, porque a qualificação é
melhorada por evidência histórica e não por intuição.

Motivo de desqualificação é obrigatório ao sair para `DISQUALIFIED` e grava em
`crm_operation_keys` junto da ação, o que impede que o mesmo lead seja desqualificado com
motivos contraditórios sem deixar rastro.

## Conversão

A conversão é uma **única** ação de `crm_action` com a chave de idempotência, e executa em
transação:

1. cria ou reutiliza a empresa, a partir do nome e documento informados;
2. cria o contato, ou reutiliza o existente pelo e-mail dentro da organização;
3. cria o `customer_profile` com o segmento e a condição de pagamento herdados do lead;
4. cria a oportunidade no pipeline padrão, na primeira etapa, com o valor e a itens informados;
5. atribui o responsável e registra a atividade de conversão;
6. marca o lead como `CONVERTED` com os ids gerados.

Reenviar a mesma chave devolve o resultado original. A conversão parcial é impossível: ou os
seis passos acontecem, ou nenhum.

A conversão exige `leads.convert`, permissão separada de `leads.create`. Um usuário pode
capturar e qualificar sem poder criar oportunidade comercial — a segregação de funções não
depende só do RBAC do papel, mas da permissão da ação.

## Origem

`commercial_sources` registra o canal. A origem acompanha lead, cliente e oportunidade, o que
permite comparar conversão e margem por canal sem planilha paralela.

## Limitações

Sem verificação de e-mail, sem score automático, sem enriquecimento de dados e sem disparo de
campanha. O consentimento é registrado, mas nada é enviado automaticamente: isso depende do
MASTER 013.
