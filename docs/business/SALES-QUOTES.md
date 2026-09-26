# Propostas, versionamento e aprovação

Data: 26/09/2026. MASTER 012.

Proposta é o compromisso formal com preço. Uma oportunidade pode ter várias propostas e cada
proposta pode ter várias versões, mas apenas uma versão vigente.

## Proposta e versões

`sales_quotes` guarda a proposta (oportunidade, cliente, responsável, condição de pagamento,
validade, status) e `sales_quote_items` guarda os itens. O total, o desconto e a margem **não**
são informados pelo usuário: o servidor os calcula a partir dos itens, da tabela de preço
vigente e do Cost Engine, e os persiste como snapshot da versão.

Versionar copia os itens da versão anterior para uma nova, que nasce `DRAFT`. A versão anterior
vira histórica e continua auditável. Isso é o que permite responder "por que o cliente recebeu
aquele preço em março" depois de a tabela de preço ter mudado.

## Status e transições

`DRAFT` → `PENDING_APPROVAL` → `APPROVED` → `SENT` → `ACCEPTED` ou `REJECTED`, com
`EXPIRED` e `CANCELED` como saídas.

- `DRAFT` é editável e deletável.
- `PENDING_APPROVAL` bloqueia edição de itens e total; a proposta já está sob decisão de
  alçada.
- `APPROVED` exige ter passado por aprovação dentro da alçada. Uma proposta sem aprovação
  registrada não chega a `APPROVED`, mesmo com a permissão de edição.
- `SENT` é o estado em que o cliente tem a proposta. `ACCEPTED` é irreversível: Versions
  posteriores não podem ser aceitas depois de um aceite, porque o aceite é o compromisso.
- `EXPIRED` é automático por validade, no servidor.

As transições são `crm_action` com chave de idempotência. Repetir aceite devolve o mesmo
resultado, sem duplicar版本.

## Aprovação e alçada

`quote_approvals` registra cada decisão: aprovador, alçada exigida, decisão, motivo e momento.
A alçada vem de `commercial_discount_authorities`, que define por papel, faixa de desconto e
percentual máximo aprovado. Um aprovador sem alçada suficiente não aprova, e a tentativa fica
registrada em auditoria.

Isso substitui o controle informal de "o gerente olhou e mandou aprovar": a aprovação é um
registro com pessoa, hora e limite.

## Integração com preços e estoque

O preço vem da tabela vigente (MASTER 007) e a margem do Cost Engine (MASTER 009). O item
carrega a variante e a quantidade; qualquer divergência de preço é resolvida pelo servidor no
momento da leitura e da aprovação.

A consulta de estoque de cada item é informativa, via Inventory Ledger. **Não há reserva**: a
proposta aprovada não bloqueia estoque, porque reserva operacional definitiva pertence ao motor
de pedidos do MASTER 013. A tela deixa isso explícito em vez de sugerir disponibilidade
garantida.

## Limitações

Sem assinatura eletrônica, sem envio real por e-mail ou WhatsApp, sem PDF gerado, sem
comissionamento financeiro e sem faturamento. Todos esses itens estão no MASTER 013.
