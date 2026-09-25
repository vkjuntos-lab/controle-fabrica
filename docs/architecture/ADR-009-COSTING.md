# ADR 009 — Custeio versionado e economia histórica

Status: implementado localmente. Data: 25/09/2026.

## Decisão

CostEngine e Pricing são domínios separados, implementados como funções PostgreSQL protegidas por RBAC/RLS. Cálculos usam numeric, dados oficiais e referências imutáveis. Componentes React não calculam saldos financeiros nem custo oficial.

STANDARD usa BOM de um nível, perda aditiva sobre base, taxas de mão de obra e overhead configurados. ACTUAL_PRODUCTION absorve consumos/perdas válidos e custos reais na produção boa do ledger. Rejeitos não viram unidades boas. Demais políticas de absorção não são presumidas.

Custo é versionado com janela inicial inclusiva/final exclusiva, aprovação antes da publicação, serialização organizacional e fingerprint para deduplicação. Custo real é comparativo, não substitui automaticamente custo padrão. Embalagem da BOM não é duplicada.

Preços reutilizam tabelas do MASTER 007 com vigências inclusivas. PUBLICAR insere uma nova linha e encerra a anterior. Simular não publica nem chama marketplace.

COGS usa custo padrão publicado na data da venda. Capturas próprias explícitas e capturas do fechamento de parceiro preservam referências e componentes. A receita da fábrica no parceiro é billable por item; ajustes globais não são rateados implicitamente. Reabrir fechamento torna sua captura anterior histórica, sem apagá-la.

## Consequências

Não existe custo único mutável para reescrever o passado. Material ausente bloqueia publicação; overhead não configurado é aviso explícito. As unidades requerem conversões cadastradas; não há fatores fixos de rolo/caixa.

Custos/margens são sensíveis. A permissão de produto não os expõe; o campo legado cost_price é preservado, mas inacessível pela API genérica autenticada. Auditoria referencia registros protegidos, sem espalhar valores sensíveis em consultas de histórico genéricas.

Limitações: BRL, BOM de um nível, uma regra de overhead vigente por organização, sem FIFO, sem câmbio, sem correção em lugar dos snapshots. Sem anexos/fiscal/IA. Decisões detalhadas em ../business/COSTING.md, PRICING.md e PROFITABILITY.md.

## Evidência

`scripts/test-costs-db.py` executa PostgreSQL real descartável: custo 30, perda 5%, conversão, falta de custo, simulação, produção boa, preço/margem/contribuição, história, fechamento e RLS. Não usa dados de organização real.
