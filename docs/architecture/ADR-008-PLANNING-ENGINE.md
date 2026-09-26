# ADR 008 — Motor de planejamento no banco, com resultado imutável e conversão humana

Status: implementado localmente. Data: 26/09/2026.

## Decisão

O planejamento é calculado em funções PostgreSQL `SECURITY DEFINER`, nunca no navegador. O
frontend envia parâmetros e exibe o resultado; nenhum componente faz aritmética de saldo, estoque,
BOM ou prazo. As 13 tabelas do domínio são `SELECT`-only para `authenticated`, com policy por
organização, e toda escrita passa por cinco RPCs (`planning_save`, `planning_execute`,
`planning_query`, `planning_order_action`, `planning_exception_action`) que validam permissão,
organização e estado. Helpers permanecem sem `EXECUTE`.

O resultado de uma execução é snapshot: run concluído não é reescrito nem removido, e projeções,
retratos, fatos e conversões são append-only. Recalcular cria outro run, com novo
`request_key` de idempotência. Sugestão não é ordem: `planned_order` não movimenta estoque, não
cria obrigação financeira e não é executável.

Conversão é humana, explícita, parcial e idempotente. Compra usa `request_save` com
`source_type='MRP'`; produção usa `production_create_order` com verificação de drift de BOM. A
conversão exige a permissão de planejamento e a do módulo de destino, e registra
`planning_conversions` na mesma transação: se a ordem destino falhar, nada é convertido.

Execução é serializada por `inventory_lock` da organização, e as entradas são congeladas em tabelas
temporárias antes do cálculo. O trade-off é explícito: uma execução longa bloqueia escritores de
estoque da mesma organização. A integridade do retrato vale mais que o paralelismo, e o custo é
limitado por 20.000 posições diárias, teto de sugestões e horizonte de 365 dias.

## Correções da validação

A validação de aceitação do MASTER 011 encontrou defeitos reais, corrigidos em
`20261004100000_planning_fixes.sql`:

- `planning_execute` falhava ao validar componentes da BOM com `column reference "factor" is ambiguous`:
  a coluna `pln_edges.factor` colidia com a variável PL/pgSQL `factor`. A referência foi
  qualificada.
- A verificação de drift de BOM na conversão exigia `status='ACTIVE'`, enquanto o motor escolhe a
  BOM vigente por data. Sugestão válida virava erro enganoso. A validação passou a usar a mesma
  regra do motor.
- `planning_save` gravava `safety_stock`, lead time de BOM e múltiplo de fornecedor exigindo apenas
  `planning.run`, contornando `products.manage`, `production.bom.update` e `suppliers.manage`.
- A matriz de papéis dava `planning.convert_purchase` ao papel `estoque`, que não tinha
  `purchase_requests.create`: o botão de conversão aparecia e sempre falhava. A permissão de
  criação de requisição foi concedida ao papel `estoque` — a requisição não efetua a compra, e cotação,
  aprovação e pedido continuam exigindo permissões de Compras.
- Nome de execução repetido estourava `unique violation` cru na tela; agora há mensagem explícita.
- `planning_query` devolvia `parameters_snapshot` — que carrega todas as arestas de BOM da
  organização — na listagem e no dashboard. A listagem foi enxuta; o detalhe do run preserva o
  snapshot, inclusive para a verificação de drift.
- Ajuste de forecast era sempre inserção: segunda tentativa no mesmo dia quebrava com erro cru e
  não havia edição. Agora aceita edição por `id` e rejeita duplicidade com mensagem clara.
- O limite de sugestões era contado a cada dia com `count(*)`, custo O(n·d). Passou a contador.
- `USE_MANUAL` e o prazo de compra por variante existiam no banco sem caminho na interface; a tela
  de parâmetros passou a expor a política e o override, inclusive para limpeza.

Também foi corrigido o `eslint.config.js`, que não ignorava `.output*`/`dist*` e travava o lint
global ao varrer artefatos de build.

## Consequências

O planejamento é reprodutível e auditável, e a explicação da sugestão não depende de refazer
cálculo no cliente. Em troca, o custo de um run cresce com variantes × dias, features complexas
de otimização ficam fora: não há lote econômico, revisão de forecast, reservas ou calendário
comercial.

Limitações assumidas: sem reservas (`reservations='NOT_IMPLEMENTED'`), dias corridos, uma
sugestão por variante/tipo/data, sem conversão de transferência, `options` paginado de 50 em 50, e
nenhuma reserva de estoque em outro local. Simulação não é conversível.

Evidência: `scripts/test-planning-db.py` (`npm run test:planning:db`) com 20 grupos em PostgreSQL
real descartável, mais `src/lib/rbac.test.ts` alinhando as oito permissões ao contrato do banco.
Detalhe em [MASTER-011-VALIDATION](../handoff/MASTER-011-VALIDATION.md) e
[PLANNING](../business/PLANNING.md).
