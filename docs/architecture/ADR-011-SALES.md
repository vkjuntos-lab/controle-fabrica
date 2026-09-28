# ADR 011 — Vendas e logística integradas ao ERP
Estado: implementado localmente; revisão em 28/09/2026.

## Contexto

O MASTER 012 entregou o CRM, incluindo propostas versionadas com preço oficial. O aceite de uma
proposta emitia `SALES_QUOTE_ACCEPTED`, mas não existia consumidor: nenhum pedido de venda nascia
do aceite, e nada ligava a necessidade comercial ao MRP. O ERP tinha estoque, ledger, financeiro e
planejamento, porém nenhuma tela de venda.

Um pedido de venda não é venda recebida. Essa distinção é o eixo do trabalho: um rascunho é um
pedido comercial sem valor nenhum, e cada etapa seguinte — aprovação, reserva, separação,
expedição, entrega, devolução — tem efeito físico, financeiro ou de obligation diferentes. O risco
central era tratar esses efeitos como um só e prometer um faturamento que o sistema não tem.

## Decisões

1. **O banco é a autoridade.** Preço, crédito, estado, estoque, idempotência e transições são
   decididos por funções `SECURITY DEFINER`. A tela escolhe *qual* operação chamar; nunca *se* ela é
   permitida. Não existe fonte paralela de preço, disponibilidade ou autorização.

2. **Preço nunca é digitado.** O preço do item vem da tabela oficial vigente na data do pedido. Um
   preço enviado pelo cliente é ignorado pelo servidor (grupo C). Conversão de proposta preserva o
   preço aceito (grupo R), porque a tabela vigente pode ter mudado desde o aceite.

3. **Disponível é saldo físico menos reservas.** `DISPONÍVEL = SALDO_FÍSICO − RESERVAS` (grupo G).
   Reserva torna a mercadoria indisponível para os demais pedidos e **não** movimenta estoque nem
   gera entrada no ledger. Só a expedição dá baixa oficial, uma única vez (grupo L).

4. **Reserva expira sozinha por validade configurável.** Reserva vencida expira por chamada
   idempotente e devolve o disponível sem tocar no saldo físico (grupo T). Cancelar pedido libera a
   reserva e devolve o disponível (grupo S).

5. **Separação não é expedição.** Ler código de barras acumula quantidade separada; conferir
   confronta separado e conferido. A diferença vira ocorrência, não estoque (grupo J). Conferir é
   imutável. A Expedição é o único momento que baixa o ledger.

6. **Expedir exige duas permissões.** Despachar exige `shipments.dispatch` **e** permissão de
   movimentação de inventário (grupo M). A tela mostra o botão; o banco exige as duas.

7. **Entrega não mexe no saldo e não fecha pedido.** Confirmar entrega exige prova de entrega
   registrada (grupo N). O fechamento do pedido é ato comercial separado.

8. **Obrigação financeira é configurável e não nasce de reserva.** O gatilho é
   `NONE`, `ON_APPROVAL` ou `ON_DISPATCH`. Com `ON_DISPATCH`, o título é proporcional ao expedido e
   um pedido gera **um** título, não um por expedição (grupo Q). O gatilho nunca é uma reserva.

9. **Ajuste financeiro de devolução é solicitação, não execução.** Receber devolução devolve
   mercadoria ao estoque; o estorno financeiro fica registrado como solicitação, sem execução
   automática (grupo O). O sistema não baixa, titula nem concilia por conta própria.

10. **Devolução danificada não volta para vendável.** Mercadoria com defeito só pode ir para
    quarentena ou inspeção, e saldo em quarentena não atende venda direta (grupo P).

11. **Crédito é avaliado na aprovação, com o valor avaliado.** A política de exposição
    (`OPEN_RECEIVABLES_ONLY` ou `OPEN_RECEIVABLES_PLUS_OPEN_ORDERS`) é aplicada pelo servidor, e o
    valor avaliado é preservado (grupo AA). A tela apenas mostra o que foi avaliado.

12. **Aprovação exige outro usuário.** Com segregação ativa, quem cria não aprova (grupo F).

13. **Todas as escritas passam por um único gateway idempotente.** `sales_execute` exige chave no
    formato UUID, serializa operação, id, ação e payload, e grava chave/payload/resultado na mesma
    transação. Mesma chave com mesmo conteúdo devolve o mesmo resultado; mesma chave com conteúdo
    diferente é recusada. A tela deriva a chave do próprio conteúdo da operação (ver
    `src/lib/sales/idempotency.ts`): reenviar o mesmo conteúdo deduplica, e corrigir o conteúdo
    gera chave nova que executa de fato. A chave **não** é renovada em caso de erro — se o servidor
    gravou e a resposta se perdeu, uma chave nova repetiria a operação.

14. **As doze políticas por organização são editáveis e validadas.** Reserva, validade da reserva,
    sob encomenda, alteração de preço, exposição de crédito, segregação na aprovação, desconto
    máximo, expedição parcial, conferência integral, endereço obrigatório, rastreamento e gatilho
    financeiro. A tela edita as doze; o servidor valida e recusa valor fora da lista (grupo AE).

15. **Rastreamento é manual.** O modo `WEBHOOK` existe como opção, mas nenhum provedor externo está
    conectado. Registrador de recebedor é registro manual de evidência: não há upload de foto nem
    assinatura digital.

16. **A conversão de proposta é idempotente por chave e por vínculo.** Aceitar a mesma proposta duas
    vezes não cria dois pedidos (grupo R).

17. **Demanda sincronizada.** A aprovação do pedido publica `SALES_DEMAND` para o MRP, na mesma
    transação, com sincronização testada (grupo Z).

## Limites

Sem NF-e, sem integração fiscal e sem transporte de transportadora externa. A expedição registra
código de rastreio informado; nenhum serviço externo é simulado como envio real. A reserva expira
por chamada — não há job de expiração automática em background. Peso e dimensão são os medidos e
registrados; o sistema nunca os estima. A empresa do cliente fica presa à organização (grupo W), mas
não há múltiplos centros de custo por pedido. A tela de vendas não tem testes de navegador
autenticado: a cobertura é banco real isolado, Vitest e verificação de build.

Evidências: `scripts/test-sales-db.py` (32 grupos, PostgreSQL descartável),
`src/lib/sales/idempotency.test.ts`, `src/lib/rbac.test.ts` e o relatório
`docs/handoff/MASTER-013-VALIDATION.md`. Não confundir build e validação local com aplicação no
Lovable Cloud ou navegação autenticada.
