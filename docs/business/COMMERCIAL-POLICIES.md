# Políticas comerciais
Configuração explícita por organização; nenhuma taxa, limite ou autorização é presumida.

## Crédito
CustomerCreditPolicy separa dados sensíveis do perfil comercial. Para leitura são necessárias commercial_sensitive.read e receivables.read; escrita também exige crm.configure e equipe interna.

Posição financeira:
- aberto = soma de open_amount dos recebíveis OPEN, PARTIALLY_PAID e OVERDUE;
- vencido = parcela desses saldos com due_date anterior à data atual;
- disponível = credit_limit − aberto, ou não configurado quando não há limite.

Na aprovação, exposição = aberto + total da proposta examinada. Não soma oportunidades nem outras propostas e não é reserva de crédito. block_overdue e block_over_limit são flags configuráveis. Sem flags, não há bloqueio automático. Não se promete controle concorrente de limite entre vários pedidos futuros; essa política precisa ser ampliada no MASTER 013.

## Desconto e pagamento
Alçada é por usuário, com percentual máximo e motivo; não por papel/faixa/vigência. Tentativas rejeitadas levantam erro e transação reverte: não há audit log persistente separado de todas as rejeições. Aprovação realizada grava autor, motivo, valores e alçada em quote_approvals/audit_log.

PaymentTerms guarda nome e descrição de condição, copiados da configuração do cliente para a proposta. Não é calendário de parcelas nem validação automática de condições especiais. Regras de margem mínima não foram implementadas.

## Dados pessoais
Finalidade e canal preferencial são separados do cadastro empresarial; marketing_opt_in começa falso e communication_restricted pode registrar restrição. Patches preservam preferências existentes. O sistema não envia marketing nem presume consentimento irrestrito.

Retenção automatizada, solicitação de titular, anonimização e gestão completa de consentimentos são NOT_IMPLEMENTED. Definir política organizacional de retenção antes de automatizar descarte; não remover históricos fiscais/comerciais indiscriminadamente.

## Auditoria e correções
Cadastro, conversão, carteira, etapa, versão, aprovação, aceite, documentos e solicitações de mesclagem são auditados com usuário e contexto. Históricos consolidados não são excluídos. Chaves de operação protegem conversão/ações; retries de interface mantêm a mesma chave. Revisão de proposta é nova versão.
