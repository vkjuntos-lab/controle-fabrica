# ADR 010 — CRM por RPC, com escopo e projectional no servidor

Status: implementado localmente. Data: 26/09/2026.

## Decisão

O CRM é exposto por três funções PostgreSQL — `crm_query`, `crm_save` e `crm_action` — e não por
acesso direto a tabelas. Nenhuma tabela do CRM é gravável por `authenticated`, e as de leitura
têm policy própria por `has_permission(organization_id, 'crm.read')`.

`crm_query` decide o que cada chamador pode ver, aplicando escopo de carteira e omitindo colunas
sensíveis para quem não tem `crm.sensitive.read`. `crm_save` valida e grava, com patch parcial
preservando campos omitidos. `crm_action` executa as operações com efeito — converter lead, mudar
etapa, aprovar, enviar, aceitar, concluir atividade, atribuir carteira — validando transição,
permissão, alçada e estado, tudo em transação, com chave de idempotência.

Totais, desconto e margem nunca são recebidos do navegador. O cliente envia variante e
quantidade; o servidor resolve preço vigente, custo e crédito. A interface é declarativa por
`src/components/crm/config.ts`, e a mesma configuração descreve tabela, formulário, validação e
gravações em etapas.

## Consequências

Um único contrato para todo o módulo: não há caminho no cliente capaz de contornar regra
comercial, porque não existe caminho no cliente. RLS, RBAC, auditoria, idempotência e escopo
têm um só lugar de implementação, testável em PostgreSQL real.

O custo é a curva de entrada: quem mexe no CRM precisa escrever SQL, não apenas componente. Em
troca, a interface não consegue inventar regra que o servidor não aplica — o que já falhou em
sistemas onde preço e desconto eram digitados.

A omissão de coluna sensível é decided no `crm_query`, e não no componente: esconder um campo
com CSS ainda entrega o dado a quem abriu a API. Um teste cobre exatamente esse caso.

Limitações: a RPC genérica não é uma API de de leitura em cache; sem real-time, sem
paginação por cursor, sem projection específica por tela além dos filtros aceitos. Os filtros de
`crm_query` são lista branca, e a interface só oferece o que está nessa lista.

## Evidência

`scripts/test-crm-db.py` executa PostgreSQL real descartável e cobre clientes, leads e conversão,
contatos, representantes e carteira, pipeline e histórico, propostas e versionamento, aprovação e
alçada, atividades, agenda, permissões, escopo externo, RLS entre organizações e dashboard.
`src/lib/crm/crm.test.ts` amarra a configuração da interface ao SQL: todo `kind` usado por área,
lookup, filtro ou coluna precisa existir no `crm_query`/`crm_save`, toda permissão precisa existir
no RBAC e bater com a exigida pelo servidor, e todo `status` gravável precisa ter rótulo.

Decisões de negócio detalhadas em `../business/CRM.md`, `LEADS.md`, `SALES-PIPELINE.md`,
`SALES-QUOTES.md`, `SALES-REPRESENTATIVES.md`, `CUSTOMER-360.md` e `COMMERCIAL-POLICIES.md`.
