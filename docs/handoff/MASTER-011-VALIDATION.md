# MASTER 011 — Planejamento, Forecast, MRP e Conversão Assistida

Data: 26/09/2026. Continuação do MASTER 010 (Compras), reutilizando catálogo mestre, Inventory
Ledger, Produção e BOM, Reconciliação de Parceiros, fornecedores e Cost Engine. Preserva as
mesmas decisões da casa: `organization_id` em tudo, RLS, RBAC central, Audit Log, idempotência e
estado explícito com imutabilidade após conclusão.

Regra mestra preservada e verificada por teste: **PLANEJAMENTO NÃO É EXECUÇÃO**. Uma execução
completa do motor não altera `inventory_movements`, `purchase_orders`, `production_orders` nem
`account_payables`. Nada é comprado, produzido, transferido, reprecificado ou cancelado
automaticamente.

## Implementado

- **Schema e configuração** (migrations de 02 e 03/10): 13 tabelas `SELECT`-only para
  `authenticated` com policy `planning_tenant_read` por `has_permission(organization_id,
  'planning.read')`; escrita somente por RPC; helpers `planning_require`, `planning_audit`,
  `planning_note` e `planning_ensure_settings` sem `EXECUTE`; oito permissões do módulo; tela de
  parâmetros com método de forecast, fontes, histórico, bucket, política de lead time, prazos
  padrão, locais participantes, segurança por variante e múltiplos de compra.
- **Motor** (`20261003100000_planning_engine.sql`): `planning_execute` com congelamento de entradas
  em tabelas temporárias, PAB diário, explosão de BOM multinível com detecção de ciclo, consumo de
  pool único por variante, MOQ e múltiplo convertidos, três políticas de lead time, `why`
  explicável por sugestão, `planning_projections` diário/semanal, `material_requirements`,
  `projected_shortages`, `planning_item_snapshots`, `planning_source_facts` e auditoria.
  `planning_query`, `planning_order_action` (revisar, aprovar, descartar, converter) e
  `planning_save` completam a superfície.
- **Correções** (`20261004100000_planning_fixes.sql`): ver "Defeitos encontrados" abaixo.
- **Interface** `src/components/planning/*` e rotas `/planejamento`,
  `/planejamento/execucoes`, `/planejamento/execucoes/$id`, `/planejamento/forecast`,
  `/planejamento/simulacao` e `/planejamento/configuracoes`, item no menu operacional, permissões em
  `src/lib/rbac.ts` e servidor em `src/lib/planning/planning.functions.ts`.

## Defeitos encontrados na validação

A validação encontrou uma falha no cálculo com BOM. `planning_execute` falhava ao validar componentes da BOM com
`column reference "factor" is ambiguous` (coluna `pln_edges.factor` × variável PL/pgSQL `factor`),
A falha foi reproduzida durante os testes de aceitação. Corrigido e coberto por teste.

Também corrigidos: drift de BOM exigindo `ACTIVE` contra motor que escolhe BOM vigente por data;
`planning_save` gravando catálogo, BOM e múltiplo de fornecedor sem a permissão do domínio; papel
`estoque` com `planning.convert_purchase` sem `purchase_requests.create` (botão que sempre
falhava); nome de execução repetido com `unique violation` cru; `parameters_snapshot` — que carrega
todas as arestas de BOM da organização — na listagem e no dashboard; ajuste de forecast sem edição e
com duplicidade silenciosa; limite de sugestões com `count(*)` por dia; política `USE_MANUAL` e
prazo por variante sem caminho na interface. O lint global também não concluía por não ignorar
artefatos de build.

## Verificado

`npm run test:planning:db` — 20 grupos em PostgreSQL real descartável, sem tocar em dado de
organização real:

1. Alvo 100, saldo 30, pendente 20 ⇒ 50; reexecução com a mesma chave devolve o mesmo run; nenhum
   movimento, pedido, ordem ou conta a pagar criado.
2. Produção 100 × BOM 0,5 = material 50; saldo 20 + recebimento 10 ⇒ líquido 20; data sugerida 15
   dias antes da necessidade.
3. Recebimento posterior à necessidade não cobre a lacuna.
4. MOQ 70→100, múltiplo 20→24, MOQ seguido de múltiplo 70→108, com explicação.
5. Parceiro 100 e trânsito 8 fora do saldo fabril 20; inclusão de local parceiro recusada.
6. Pedido 100 − recebimento postado 60 = 40 programado, via APIs reais de recebimento.
7. Produção 100 − output 40 no ledger = 60 programado.
8. Componente compartilhado por dois produtos: 42 bruto − 10 de saldo = 32, com perda de 5% da BOM.
9. Conversão parcial 60+40, retentativa concorrente devolvendo uma única requisição, conversão de
   produção em `DRAFT` real e rastreio `source_type='MRP'`.
10. Simulação isolada, comparação de execuções, snapshot de lead time e run concluído imutável.
11. RLS nas 13 entidades, id direto de outra organização, permissões, helper privado e auditoria.
12. Ajuste de forecast editado no lugar; duplicidade no mesmo período recusada com mensagem clara.
13. Lead time observado medido de recebimento postado.
14. Prazo manual por variante aplicado e removido.
15. Escrita de parâmetro bloqueada sem a permissão do domínio de destino.
16. Nome de execução repetido recusado; listagem sem snapshot pesado e detalhe com snapshot.
17. Forecast simples: 90 unidades / 30 dias = 3 por dia; venda de parceiro contada uma vez; cancelamentos excluídos e cobertura sem demanda nula.
18. Forecast base 90 + ajuste 5 = 95; buckets semanais somam fluxos e preservam abertura/fechamento.
19. Média ponderada com pesos configuráveis e denominador em dias.
20. Ciclo de BOM falha com segurança, sem sugestão nem escrita operacional.

Também verificados: 39 testes unitários (incluindo alinhamento das oito permissões de planejamento
ao contrato do banco), `tsc --noEmit` e `npm run build`. Lint sem erros nos arquivos do domínio.

## Não verificado

Implantação no Lovable Cloud e as migrations `20261002100000_planning.sql`,
`20261003100000_planning_engine.sql` e `20261004100000_planning_fixes.sql`: aplicação no
banco publicado não verificada. Não houve smoke test autenticado no ambiente publicado nem teste de navegador.
Nenhuma verificação de desempenho com volume real de catálogo.

## Limitações assumidas

Sem reservas de estoque, sem lote econômico, sem fluxo de aprovação de forecast, dias corridos sem calendário
comercial, uma sugestão por variante/tipo/data, sem conversão de transferência, `options`
paginado de 50 em 50, lead time observado dependente de histórico postado e fornecedor não preenchido quando não há preferencial único. A necessidade continua calculada, com aviso; prazo sem fonte confiável fica indisponível.

## Arquivos e integrações

- Migrations: as três listadas acima. A migration inicial contém nove tabelas; a segunda acrescenta quatro tabelas de projeção, fatos e conversões. A terceira concentra as correções desta revisão.
- Servidor: `src/lib/planning/planning.functions.ts`; cinco RPCs: `planning_save`, `planning_execute`, `planning_query`, `planning_order_action`, `planning_exception_action`.
- Interface: `src/components/planning/{pages,detail,shared}.tsx`, `format.ts` e seis rotas em `src/routes/_authenticated/planejamento/`.
- Integração: menu existente, tipos Supabase e matriz RBAC; ajustes em `src/lib/rbac.ts`, teste de permissões e exclusão de artefatos no ESLint.
- Testes: `scripts/test-planning-db.py` e `src/lib/rbac.test.ts`.
- Documentação criada: `docs/business/PLANNING.md`, `MRP.md`, `DEMAND-FORECAST.md`, `REPLENISHMENT-PLANNING.md`, `docs/architecture/ADR-008-PLANNING-ENGINE.md` e este relatório.
- Handoff atualizado: `docs/handoff/PROJECT-STATE.md`.

As tabelas, rotas e oito permissões estão enumeradas em [PLANNING](../business/PLANNING.md). O motor reúne forecast simples/ponderado, ajustes manuais, recebimentos pendentes, explosão de BOM, necessidades líquidas, sugestões de compra/produção, projeção temporal, rupturas e exceções explicáveis. Cenários alteram demanda, segurança, estoque alvo e prazos sem alterar a configuração oficial.

A disponibilidade consulta o Inventory Ledger. Conversões reutilizam `request_save` e `production_create_order`, com permissões dos respectivos domínios. RLS cobre as 13 tabelas; escrita somente por RPC autorizada. A auditoria registra execução, configuração, forecast, cenário, tratamento de sugestões e conversões.

## Pendências e próximo domínio

A entrega está validada localmente; implantação e aceitação visual no ambiente publicado continuam pendentes. Antes de aplicar migrations, conferir o histórico do banco de destino. O reparo mínimo do rascunho inicial foi necessário para o replay local; não há evidência de que esse rascunho tenha sido aplicado no banco publicado.

O cálculo é síncrono e limitado a 20.000 posições variante/dia. Não houve teste de carga com catálogo real. A interface de comparação e de demanda por canal mostra até 50 linhas por consulta; expansão da navegação dessas visões permanece pendente. Exportação implementada em CSV; XLSX/PDF não implementados neste domínio. Segurança é por variante, não por combinação variante/localização. Ajuste manual é aditivo e por data.

Não foi iniciado outro MASTER. O próximo passo é validar a implantação e o uso operacional do MASTER 011; o próximo domínio depende de especificação própria.
