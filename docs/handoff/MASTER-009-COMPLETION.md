# MASTER 009 — revisão final local, 25/09/2026

Esta continuação verificou o Cost Engine já presente no checkout e completou a documentação de negócio. O repositório também contém Compras e Planejamento; esses módulos foram preservados. Nenhum dado fictício foi criado em organização real e nenhuma publicação cloud foi executada.

## Implementado

Motor central server-side: custos de materiais, mão de obra padrão/real, conversões oficiais, perdas, overhead e decomposição; versões, aprovação/publicação, simulação isolada, impacto de materiais e comparação padrão × real. Pricing reutiliza tabelas existentes, preserva vigências e separa markup de margem. Rentabilidade usa snapshots históricos, valores efetivos/estimados identificados e receita billable nas operações de parceiros.

## Alterado nesta revisão

- Seletor de precificação passa a exibir o nome retornado pelo contrato `pricing_options`.
- Conteúdo de custos é remontado ao mudar organization_id, descartando seleção, simulação e detalhe do tenant anterior.
- Harness SQL ampliado: cálculo concorrente deduplicado, deduções ausentes, snapshots imutáveis e catálogo legível sem acesso a custo.
- PROJECT-STATE atualizado sem remover o histórico das outras etapas.

## Arquivos criados

- `docs/business/COSTING.md`
- `docs/business/PRICING.md`
- `docs/business/PROFITABILITY.md`
- `docs/architecture/ADR-009-COSTING.md`
- `docs/handoff/MASTER-009-COMPLETION.md`

Arquivos alterados: `src/components/costs/commercial.tsx`, `shared.tsx`, `scripts/test-costs-db.py`, `docs/handoff/PROJECT-STATE.md`. `.chat-history.json` contém alterações da plataforma e não faz parte da implementação técnica.

## Migrations e tabelas

Nenhuma migration existente foi reescrita nesta revisão. A implementação está em `20260930100000_cost_engine.sql`; o módulo de Compras posterior amplia as origens de aquisição sem substituir o motor.

Tabelas do domínio: material_cost_versions, labor_rates, overhead_rules, cost_routing_steps, production_labor_entries, cost_calculation_runs, product_cost_versions, pricing_variable_rules, profitability_settings, sale_economics, sale_cost_snapshots. Evolução das tabelas existentes price_tables/price_table_items para canais, aprovação e vigência.

## Server functions / RPCs

Públicas: cost_save_input, cost_calculate, cost_version_action, cost_query, pricing_simulate, pricing_publish, profitability_capture. Helpers privados: cost_compute, cost_conversion, pricing_math, cost_capture_sale, cost_require, cost_audit e guards. Fechamento utiliza cost_on_reconciliation_close sem conceder leitura de custo ao usuário comercial.

## Cost Engine / versionamento / métodos

STANDARD: BOM, material vigente, conversão, scrap aditivo, roteiro, labor rate e overhead. ACTUAL_PRODUCTION: consumo/perda com movimento válido dividido por produção boa. Histórico: referências e valores congelados; custo novo não altera captura anterior. Material Cost manual com motivo/unidade/vigência; Labor Cost por minutos × custo-hora; overhead PER_UNIT / PERCENTAGE_OF_DIRECT_COST / LABOR_HOUR. Outros custos exigem origem.

## Pricing / margins / profitability

Markup = preço/custo; margem bruta = receita−COGS; contribuição deduz despesas variáveis. Simulação não publica. Preços são novas vigências no cadastro existente. Relatório server-side por produto, variante, marketplace, loja e parceiro, períodos configuráveis, paginação, CSV autorizado e detalhamento da origem. Custos ausentes geram pendência, não zero.

## Rotas

`/custos`, `/custos/insumos`, `/custos/calcular`, `/custos/versoes`, `/custos/simulador`, `/custos/impacto`, `/custos/producao`, `/precificacao`, `/relatorios/rentabilidade`. Editor anterior de tabelas de preço continua em `/reconciliacao/tabelas-preco`.

## Permissions / RLS / auditoria

costs.read, costs.calculate, costs.simulate, costs.approve, costs.publish, costs.manage_material_cost, costs.manage_labor_rate, costs.manage_overhead; pricing.read/manage/simulate/approve; profitability.read/export. Seeds somente admin/gestor; product read não implica cost read. Novas tabelas isoladas por organization_id, SELECT sob permissão e mutações por RPC. Acesso por IDs e helper privado testados. Audit Log referencia o registro protegido sem divulgar seus valores a consumidores genéricos do histórico.

## Testes executados

- `npm run test:costs:db`: **10 grupos passaram**, PostgreSQL real descartável. BOM30; perda20+1; conversão; INCOMPLETE; simulação; markup/margem/contribuição; real4000/80=50; janeiro40 preservado após março45; preço100 preservado após120; parceiro80−45=35; RLS/permissões; reabertura/fechamento; queries; concorrência e deduções desconhecidas.
- `npm run test:purchasing:db`: **15 grupos passaram**, incluindo aquisição, histórico de custo, idempotência, financeiro e isolamento.
- `npm test`: **37 testes passaram**.
- `npm run typecheck`: passou.
- `npm run build`: passou após regenerar a saída local cujo diretório anterior não permitia sobrescrita. Backup preservado e ignorado pelo Git.
- ESLint nos componentes de custos: sem erros; dois avisos de Fast Refresh em funções auxiliares compartilhadas.
- Lint global não passou: há erros preexistentes de formatação/tipagem de lint em autenticação, Compras e outros arquivos, além de artefatos antigos de build fora dos ignores. Não foram reformados módulos alheios ao escopo. O domínio de custos não apresentou erros.
- `git diff --check`: passou.

O teste de despesas desconhecidas usa evento externo explícito: a constraint atual de MarketplaceSale aceita somente uma referência NULL por loja. Esse comportamento do módulo anterior foi documentado, não removido silenciosamente.

## Limitações e pendências

Publicação da migration/cloud e teste autenticado em navegador **não verificados**. Não declarar aceite de produção com base somente no build local.

Metodologia atual: BRL, BOM de um nível, uma regra organizacional de overhead vigente, absorção dos rejeitos nas unidades boas e COGS padrão publicado. Não há FIFO, câmbio, política de reprocesso, correção em lugar de despesas efetivas ou distribuição automática de ajustes globais do fechamento. Há filtros por identificador e seletores limitados às opções carregadas que merecem evolução de usabilidade em catálogos grandes. Exportação CSV é paginada, não um snapshot transacional global; XLSX não implementado. ABC de custos e relatório dedicado de participação de materiais não estão implementados; existe simulação de impacto por material.

Sem conclusão presumida do importador MASTER 005. Reavaliar sua unicidade de evento ausente ao evoluir a integração. Nenhum preço externo é modificado e nenhum recebimento bancário é usado para inferir margem.

## Próximo domínio

Não iniciar outro MASTER nesta tarefa. Compras (MASTER 010) e código de Planejamento já existem no checkout: a próxima ação é validar seu estado documentado e a publicação, não recriá-los. O número e escopo da próxima etapa devem seguir o roteiro do projeto.
