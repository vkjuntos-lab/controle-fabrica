# ADR 010 — CRM integrado ao ERP
Estado: implementado localmente; revisão em 27/09/2026.

## Decisões
1. Company é o cadastro unificado. CustomerProfile adiciona perspectiva comercial. O legado varejista customers não é migrado por heurística de nome/CPF.
2. Serviços empresariais foram extraídos em company_save_core e company_detail_core privados. Wrappers de Parceiros conservam permissões originais; CRM exige suas permissões e carteira antes de reutilizar o mesmo núcleo.
3. SQL é a autoridade para preço vigente, cálculo de proposta, alçada, crédito e transições. Não existe fonte paralela de preço, estoque ou autorização.
4. Propostas são imutáveis quanto a valores desde a criação. Revisar cria nova versão; apenas uma pode ser aceita.
5. Conversão de lead e ações serializam pela organização e registram chave/payload/resultado. Isso prioriza integridade e pode limitar throughput; não foi testado volume de produção.
6. O aceite grava domain_events na mesma transação. O MASTER 013 ainda deverá implementar consumidor e criação idempotente de SalesOrder.
7. Representantes externos têm autorização central limitada e acesso por carteira no banco; uma permissão ampla do papel base não deve contornar esse escopo em APIs de outros módulos.
8. Documentos são privados, com tipo/tamanho limitados e download assinado. Nenhum canal de comunicação é simulado como envio real.

## Limites
Aprovação financeira usa recebíveis abertos + proposta atual, sem reserva de crédito. Comissão é simulação independente por regra. Mesclagem somente registra revisão; execução de fusão permanece pendente. Forecast comercial não altera demanda confirmada do MRP.

Evidências: scripts/test-crm-db.py (PostgreSQL descartável), testes Vitest e relatório docs/handoff/MASTER-012-VALIDATION.md. Não confundir build/validação local com aplicação no Lovable Cloud ou teste de navegador autenticado.
