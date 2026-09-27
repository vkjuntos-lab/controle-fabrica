# MASTER 012 — Relatório de validação
Revisão: 27/09/2026. Estado global: PARTIAL. Implementação local; implantação e aceitação visual publicada não verificadas.

## 1. Diagnóstico
O checkout já tinha Company, contatos, preços versionados, financeiro, ledger, planejamento, eventos e uma primeira implementação CRM. A revisão encontrou falhas não cobertas pelos testes: responsável alterado em patches, acesso externo indevido a atividades, conversão visual sem seleção de empresa, rotas de detalhe sob listagens sem Outlet, agregações limitadas à primeira página, filtros incompatíveis e ausência de anexos/consulta futura. Documentos descreviam recursos inexistentes; foram corrigidos.

## 2. Implementado
Cadastro empresarial unificado; lead e conversão transacional; contatos; representantes e carteiras históricas; segmentação; pipeline e histórico; propostas versionadas com preço oficial; alçada e bloqueio de crédito; aceite idempotente; atividades; consultas de estoque/planejamento; dashboard server-side; CSV; documentos privados; RLS e auditoria.

## 3. Critérios de aceite
| Critério | Estado | Evidência / limite |
| --- | --- | --- |
| Cadastro comercial unificado | IMPLEMENTED | A: fornecedor recebe CUSTOMER sem duplicação; criação por usuário comercial |
| Leads e conversão | IMPLEMENTED | B: conversão concorrente, contato reutilizado, seleção de empresa na interface |
| Contatos | IMPLEMENTED | Serviço compartilhado e formulário no 360; patch preserva campos |
| Representantes e carteiras | IMPLEMENTED | C: histórico e responsável da oportunidade preservados |
| Pipeline e oportunidades | IMPLEMENTED | D: três variantes somam 60 sem estoque; edição geral posterior não disponível |
| Histórico de etapas | IMPLEMENTED | Snapshot anterior/novo |
| Propostas/versionamento/preços | IMPLEMENTED | E/F: preço histórico permanece após nova tabela/versão |
| Aprovação comercial | IMPLEMENTED | G/H: alçada, vencidos, limite e cliente bloqueado; sem política automática de margem mínima |
| Consulta de estoque | IMPLEMENTED | Balance oficial e PlanningRun real; sem reserva |
| Atividades e agenda | IMPLEMENTED | Reagendamento com histórico; sem conclusão automática |
| Customer 360 | IMPLEMENTED | Abas paginadas; timeline com reconciliações autorizadas e links à origem; teste de páginas distintas além de 50 registros |
| Dashboard real | IMPLEMENTED | Teste com mais de 50 oportunidades e filtro por responsável |
| Integrações testadas | PARTIAL | Banco real isolado; Storage publicado e navegação autenticada não testados |
| RLS/permissões | IMPLEMENTED | K/L: isolamento, escopo externo, escrita direta e RPC ampla do ERP bloqueadas |
| Auditoria | IMPLEMENTED | Eventos crm.*; rejeições com rollback não têm log independente |
| Testes críticos | IMPLEMENTED | A–L e regressões, 15 grupos PostgreSQL |
| TypeScript/build | IMPLEMENTED | Verificações locais |
| Comissão | PARTIAL | Configuração/simulação por regra; sem apuração financeira ou precedência automática |
| Mesclagem | PARTIAL | Solicitação deduplicada para revisão; sem execução de fusão |
| LGPD | PARTIAL | Finalidade/preferências/acesso; sem retenção automatizada ou workflow de titular |

## 4. Não implementado
SalesOrder, reserva definitiva, expedição B2B, fiscal/NF-e, envio real de mensagens/campanhas, comissão financeira, integração automática de oportunidade ao MRP, expiração automática de propostas, PDF próprio e assinatura eletrônica. Nenhum deles é apresentado como funcionando.

## 5. Arquivos
Criados nesta revisão:
- supabase/migrations/20261006100000_crm_integrity.sql
- supabase/migrations/20261007100000_crm_documents.sql
- supabase/migrations/20261008100000_crm_company_services.sql
- supabase/migrations/20261009100000_crm_customer_history.sql
- src/components/crm/availability.tsx
- src/components/crm/company-choice.tsx
- src/components/crm/documents.tsx

Modificados: componentes CRM de configuração/clientes/dashboard/leads/oportunidades/propostas/shared/carteiras; funções, constantes e testes CRM; scripts/test-crm-db.py; tipos Supabase; árvore de rotas; sete documentos de negócio, ADR-010-CRM e handoff.
Quatro arquivos de detalhes passaram a usar *_.$id.tsx, preservando URLs e removendo o aninhamento incorreto sob listagens.

## 6. Migrations e tabelas
A migration original 20261005100000_crm.sql foi preservada (28 tabelas). Quatro migrations novas acrescentam integridade, escopo externo, documentos, consultas e extração dos serviços empresariais compartilhados. Total: 29 tabelas:
commercial_segments, commercial_sources, commercial_reasons, commercial_tags, sales_territories, sales_representatives, commercial_payment_terms, customer_profiles, customer_credit_policies, customer_tags, customer_territories, customer_portfolio_assignments, leads, sales_pipelines, sales_pipeline_stages, sales_opportunities, opportunity_stage_history, opportunity_items, sales_quotes, sales_quote_items, quote_approvals, commercial_discount_authorities, crm_activities, crm_activity_history, commission_plans, commission_rules, crm_operation_keys, company_merge_requests, crm_documents.

Bucket crm-documents privado, PDF/JPEG/PNG até 10 MB. Conferir histórico do banco de destino antes de aplicar; aplicação publicada não foi verificada.

## 7. Serviços e eventos
RPCs crm_save, crm_action, crm_query e crm_document. Preparação/conclusão/download de documento usam servidor autenticado. company_save_core e company_detail_core são privados; wrappers de Parceiros mantêm suas autorizações originais.
SALES_QUOTE_ACCEPTED é inserido em domain_events com chave única por proposta, versão e cliente, na mesma transação. PENDING não significa entrega externa. Não há consumidor SalesOrder.

## 8. Rotas
/comercial; leads; clientes e detalhe; oportunidades e detalhe; propostas e detalhe; atividades; agenda; representantes e detalhe; carteiras; relatórios; configurações por seção. Todas sob /comercial, autenticadas. URLs de detalhe preservadas após correção.

## 9. Integrações
Company/Contact compartilhados; ProductVariant; PriceTableItem oficial; Cost Engine para estimativa autorizada; recebíveis para crédito; inventory_get_balance; PlanningRun; domain_events. PartnerProfile/MarketplaceStore não foram duplicados. Não há reconciliação automática de venda ou demanda confirmada.

## 10. Permissões/RLS
Matriz existente: crm.read/dashboard/export/configure, leads.read/create/update/convert, customers.read/create/update/merge, opportunities.read/create/update/close, quotes.read/create/update/approve/send/accept, activities.read/manage, representatives.read/manage, portfolios.manage, commercial_sensitive.read.
Financeiro exige também receivables.read; margem costs.read; projeções planning.read e inventory.read.
Identidades externas vinculadas a representante têm acesso por carteira e não herdam leitura ampla do ERP. Company/Contact têm política restritiva. Escrita direta CRM negada. Documento exige empresa autorizada; download assinado por 60 segundos.

## 11. Testes
- 15 grupos em PostgreSQL descartável: A–L, concorrência, patch, crédito, bloqueio, RLS, helpers privados, auditoria, metadados/políticas Storage, timeline, filtros, dashboard completo e projeção real.
- 63 testes Vitest em seis arquivos, incluindo quatro regressões de rotas.
- TypeScript (tsc --noEmit), build Vite/Nitro e lint CRM.
- Lint: zero erros; 14 avisos Fast Refresh.
Nenhum dado demo foi inserido na organização real. Teste local de Storage não comprova transporte de arquivos no ambiente publicado. Não houve teste de navegador autenticado ou carga.

## 12. Problemas conhecidos
Referências de alguns formulários ainda limitadas à primeira página. As abas do Customer 360 foram paginadas. Exposição de crédito = recebíveis abertos + proposta examinada, sem reservar limite nem somar outras propostas. Taxa de aceite conta versões. Comissão trata regras como cenários independentes, não aditivos. Margem é estimativa, não snapshot definitivo de COGS. Regenerar tipos de Tables após migração publicada. Não houve commit/push/deploy nesta revisão.

## 13. Decisões de configuração
Nenhuma confirmação é necessária para revisar o código local. Operação requer configurar pipelines, etapas, motivos, preços, condições, alçadas por usuário e crédito. Política de retenção e fato gerador contratual de comissão precisam ser definidos antes da automação. Não foram inventados limites, taxas ou consentimentos.

## 14. MASTER 013
Consumir SALES_QUOTE_ACCEPTED idempotentemente, criar SalesOrder com a versão e os snapshots aceitos, deduplicar por quote_id/event_key. Só então implementar demanda confirmada, reserva e efeitos operacionais/financeiros.
