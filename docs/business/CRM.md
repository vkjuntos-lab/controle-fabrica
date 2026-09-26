# CRM e cadastro comercial unificado

Data: 26/09/2026. MASTER 012. Continuação do MASTER 011, reutilizando o catálogo mestre
(`MASTER 001`), Pricing e Cost Engine (MASTER 007/009), Inventory Ledger (MASTER 002),
parceiros e customers de aplicação.

Este documento descreve o núcleo cadastral do comercial. O restante do módulo está em
[LEADS.md](LEADS.md), [SALES-PIPELINE.md](SALES-PIPELINE.md), [SALES-QUOTES.md](SALES-QUOTES.md),
[SALES-REPRESENTATIVES.md](SALES-REPRESENTATIVES.md), [CUSTOMER-360.md](CUSTOMER-360.md) e
[COMMERCIAL-POLICIES.md](COMMERCIAL-POLICIES.md).

## Conceito

Um registro em `companies` é a razão social. O comercial não duplica cliente: estende o
parceiro com `customer_profiles` e, quando aplicável, com `customer_tags`, `customer_territories`
e `customer_credit_policies`. Contatos são `contacts`, compartilhados entre empresas, e recebem
vínculo por `customer_contacts`.

A separação segue a mesma casa do resto da plataforma: `companies` e `contacts` são a identidade;
`customer_profiles` é o comportamento comercial. Isso permite que a mesma razão social exista
como fornecedor, parceiro e cliente sem cadastro duplicado, e permite que um contato atende a
várias empresas.

## Tabelas

| Tabela | Papel |
| --- | --- |
| `commercial_segments` | Segmento comercial, usado para política de crédito e comissão. |
| `commercial_sources` | Origem de aquisição (indicação, marketplace, site, campanha). |
| `commercial_reasons` | Motivo padronizado de recusa, perda e cancelamento. |
| `commercial_tags` | Etiquetas de segmentação, com vínculo em `customer_tags`. |
| `commercial_payment_terms` | Prazo de pagamento, com limite de dias e parcelamento. |
| `sales_territories` | Território comercial, base para carteira e escopo. |
| `customer_profiles` | Perfil comercial do cliente: status, segmento, representante, obs. |
| `customer_credit_policies` | Limite de crédito, dias de carência e alçada. |
| `customer_tags` | Vínculo etiqueta ↔ cliente. |
| `customer_territories` | Vínculo território ↔ cliente. |
| `customer_portfolio_assignments` | Responsável, nível (titular/apoio) e vigência da carteira. |
| `leads` | Contato ainda não convertido, com origem, dono e qualificação. |
| `sales_pipelines` / `sales_pipeline_stages` | Pipeline e suas etapas ordenadas. |
| `sales_opportunities` | Oportunidade, valor, etapa, probabilidade e ciclo. |
| `opportunity_items` | Itens da oportunidade, com variante e quantidade. |
| `opportunity_stage_history` | Histórico de transições, com motivo e responsável. |
| `sales_quotes` | Proposta e suas versões, com validade e total calculado no servidor. |
| `sales_quote_items` | Itens da proposta; preço e desconto resolvidos no servidor. |
| `quote_approvals` | Aprovações, com alçada exigida e substituto. |
| `commercial_discount_authorities` | Alçada de desconto por papel, faixa e status. |
| `crm_activities` | Tarefa, ligação, e-mail, reunião ou follow-up. |
| `crm_activity_history` | Histórico de execução, reagendamento e conclusão. |
| `commission_plans` / `commission_rules` | Planos e regras de comissão por gatilho e tipo. |
| `crm_operation_keys` | Idempotência de ações comerciais. |
| `company_merge_requests` | Solicitação de mesclagem de cadastros duplicados. |

## Visibilidade e permissões

A leitura exige `crm.read`; a escrita exige a permissão específica do registro
(`customers.create`, `customers.update`, `leads.create`, `opportunities.create`,
`quotes.create`, `activities.create`, `representatives.manage`, `crm.configure`).

Toda listagem passa por `crm_query`, que aplica RLS, escopo de carteira e as permissões do
chamador. Um representante sem `crm.sensitive.read` recebe clientes, oportunidades e propostas
**sem** margem, custo e volume financeiro; a coluna simplesmente não vem na resposta, em vez de
vir zerada. A UI esconde o campo, mas quem tem acesso à API continua protegido: a omissão é
decidida no `crm_query`, não no componente.

`crm_query` também é o caminho de exportação. Com `export = true` a mesma consulta devolve o
recorte filtrado, sem que o cliente reimplemente a regra.

## Status comercial

`ACTIVE`, `INACTIVE` e `BLOCKED`. `BLOCKED` recusa operação comercial no servidor: nova
oportunidade, nova proposta e novo aceite. Cliente bloqueado continua legível e seu histórico
permanece auditável — bloqueio é decisão comercial, não apagamento.

## Idempotência

`crm_operation_keys` guarda `(organization_id, key)` com o resultado da primeira execução.
Ações de conversão, aceite de proposta e conclusão de atividade enviam uma chave gerada pelo
cliente; repetir a chamada devolve o resultado original em vez de duplicar o efeito. Isso
permite reenvio seguro por retry de rede ou duplo clique.

## Auditoria

Toda escrita e toda ação grava em `audit_log` com `organization_id`, `actor_user_id`, `entity`,
`entity_id`, `action` e `diff`. O histórico de etapa e o de atividade são, além disso, tabelas
próprias consultáveis, porque o CRM precisa mostrar a linha do tempo, não só o diff.

## Duplicidade

`company_merge_requests` recebe o par de empresas e o motivo. A mesclagem **não** é executada
pela interface: ela é enviada para análise, e a decisão fica registrada. Isso evita que um erro
de digitação no cadastro apague histórico comercial de uma razão social inteira.

## Integrações

Implementadas neste master: Pricing (tabelas de preço vigentes), Cost Engine (custo e margem),
Inventory Ledger (disponibilidade para consulta, sem reserva), Financeiro (limite de crédito e
condição de pagamento), RBAC/RLS e Audit Log.

Pendentes para o MASTER 013: motor de pedidos de venda, reserva definitiva de estoque,
separação e expedição, faturamento fiscal, NF-e, WhatsApp, campanhas e comissionamento
financeiro. Ver `docs/handoff/MASTER-012-VALIDATION.md`.
