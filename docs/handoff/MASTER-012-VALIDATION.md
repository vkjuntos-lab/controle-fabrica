# MASTER 012 — CRM, cadastro comercial, pipeline e propostas

Data: 26/09/2026. Continuação do MASTER 011, reutilizando catálogo mestre, Pricing e Cost Engine,
Inventory Ledger, empresas e contatos. Preserva a mesma casa: `organization_id` em tudo, RLS,
RBAC central, Audit Log, idempotência e estado explícito com imutabilidade após conclusão.

Regra mestra preservada e verificada por teste: **PREÇO, DESCONTO, TOTAL E MARGEM SÃO DO
SERVIDOR**. O navegador envia variante e quantidade; a tabela de preço vigente, o custo e o total
são resolvidos em `crm_query`/`crm_save`. Um `crm_save` completo de proposta nunca cria
`accounts_receivable` nem `inventory_movements` — a proposta não é pedido, não reserva estoque e
não fatura.

## Implementado

- **Schema e funções**: 29 tabelas do CRM em `20261005100000_crm.sql`, com leitura por
  `crm_query`, escrita por `crm_save` e efeitos por `crm_action`. Nenhuma tabela gravável por
  `authenticated`.
- **Correção**: `crm_save` sobrescrevia colunas omitidas no payload com o default do schema em
  update parcial, apagando dado já gravado. Corrigido e coberto por teste.
- **Kind `members`**: a lista de responsáveis passou a ser resolvida por `crm_query`, sem exigir
  `users.read`, que é permissão de administração.
- **RBAC**: 27 permissões `crm.*`, `leads.*`, `customers.*`, `opportunities.*`, `quotes.*`,
  `activities.*`, `representatives.*`, `crm.sensitive.read` e `crm.configure`; módulo
  `comercial` como `available` e item no menu.
- **Interface** em `src/components/crm/*` — `constants.ts`, `export.ts`, `config.ts`,
  `shared.tsx`, `data.ts`, `list.tsx`, `dashboard.tsx`, `leads.tsx`, `customers.tsx`,
  `opportunities.tsx`, `quotes.tsx`, `activities.tsx`, `team.tsx`, `reports.tsx` — e 15 rotas em
  `src/routes/_authenticated/comercial/`.

## Critérios de aceite

| Item | Situação | Evidência |
| --- | --- | --- |
| Cadastro comercial unificado | IMPLEMENTED | `crm_query`/`crm_save`; teste A |
| Leads e conversão | IMPLEMENTED | Teste B: conversão concorrente idempotente |
| Contatos | IMPLEMENTED | Testes A e B: contato criado ou reutilizado, sem duplicar |
| Representantes e carteiras | IMPLEMENTED | Teste C: troca de titular preserva histórico |
| Pipeline e oportunidades | IMPLEMENTED | Teste D: itens somam 60, snapshot de etapa |
| Histórico de etapas | IMPLEMENTED | Teste D: `opportunity_stage_history` |
| Propostas e versionamento | IMPLEMENTED | Teste E: versão nova preserva preço anterior |
| Integração com preços | IMPLEMENTED | Teste E/F/G: preço vigente resolvido no servidor |
| Aprovações comerciais | IMPLEMENTED | Teste G: alçada configurada é exigida |
| Consulta de estoque | IMPLEMENTED | Teste D: consulta por RPC oficial, sem escrita |
| Atividades e agenda | IMPLEMENTED | Teste de atividades: reagendar com histórico |
| Customer 360 | IMPLEMENTED | `customers.tsx`; escopo no teste K |
| Dashboard com dados reais | IMPLEMENTED | Teste de dashboard: agregados oficiais |
| RLS e permissões | IMPLEMENTED | Testes K e L |
| Auditoria | IMPLEMENTED | Teste I/J: aceite gera um evento, sem ledger nem receivable |
| Testes críticos | IMPLEMENTED | `npm run test:crm:db`, 19 testes unitários |
| TypeScript e build | IMPLEMENTED | `npm run typecheck`, `npm run build` |

## Verificado

`npm run test:crm:db` — PostgreSQL real descartável, sem tocar em dado de organização real:

1. **A**: fornecedor vira cliente sem duplicar `companies`.
2. **B**: duas conversões simultâneas do mesmo lead produzem um único cliente, uma oportunidade e
   um contato, com histórico preservado.
3. **C**: troca de carteira encerra a atribuição anterior e mantém o responsável da oportunidade.
4. **D**: itens somam 60; transição grava snapshot; nenhuma escrita de estoque.
5. **E/F/G**: versões preservam preços; aprovação do servidor exige a alçada configurada.
6. **I/J**: aceite produz um evento e não cria ledger nem conta a receber.
7. **K/L**: escopo entre tenants e entre carteiras; permissão sensível exigida por RPC.
8. **Atividades**: reagendamento com histórico, sem conclusão automática.
9. **Dashboard**: agregados e saldo oficial.

`npx vitest run` — 59 testes em 6 arquivos, incluindo `src/lib/crm/crm.test.ts` (19), que amarra a
configuração da interface ao SQL e ao RBAC. Dois defeitos foram encontrados por esse teste e
corrigidos: `commercial_status` sem rótulo em `optionLabels` (apareceria como `ACTIVE` cru no
cadastro) e `QUOTE_FLOW` sem os status terminais (`ACCEPTED`, `REJECTED`, `EXPIRED`, `CANCELED`).

`npm run typecheck` e `npm run build` passam. Lint do escopo CRM sem erros; permanecem warnings
`react-refresh/only-export-components`, que não afetam o bundle.

## Defeitos encontrados na validação

`crm_save` tratava todo update como insert completo: campo ausente do payload recebia o default do
schema. Na edição de um cliente, por exemplo, salvar sem informar o limite de crédito zerava o
limite. O mesmo padrão apagava preferências, etiquetas e vínculos. Corrigido para patch parcial e
coberto pelo harness.

Também corrigidos: `commercial_status` sem rótulo, exibindo valor cru; `QUOTE_FLOW` incompleto;
`_id` de `crm_action` tipado como não nulo, embora a criação de proposta envie `null`; `members`
dependente de `users.read`; `config.ts` gravando cliente em chamada única quando a operação
exige duas (`customer` + `customer_profile`) e permitindo editar `company_id`; `Picker` chamando
kind inexistente e com `required` inválido; colunas de referência sem rótulo em listas; e teste de
RBAC que tratava o módulo comercial como `coming_soon` depois de ele ter sido entregue.

## Não implementado (por escopo ou dependência do MASTER 013)

Motor de pedidos de venda; reserva definitiva de estoque; separação e expedição; faturamento
fiscal; NF-e; integração WhatsApp sem configuração real; disparo de campanhas; comissionamento
financeiro liquidado — o plano e as regras são cadastrados e simulados, mas a apuração depende de
faturamento e recebimento; previsão comercial apresentada como garantia.

## Pendências honestas

A aplicação da migration no Lovable Cloud e o funcionamento em navegador publicado não foram
verificados: não houve smoke test autenticado. `src/integrations/supabase/types.ts` tem as três
RPCs do CRM, mas as 29 tabelas não constam do bloco `Tables`, que é gerado; a aplicação não as
consulta diretamente, e a regeneração contra um banco com a migration aplicada as inclui. Os
tipos de `crm_action` e `crm_query` aceitam `_kind` e `_filters` como texto livre, porque o `kind`
depende do resultado do `CASE` do servidor; o `crm.test.ts` é o que amarra esse texto ao SQL.

Dívida de formatação pré-existente permanece em arquivos de outros módulos (`auth-middleware`,
`csv`, `logger`, entre outros).
