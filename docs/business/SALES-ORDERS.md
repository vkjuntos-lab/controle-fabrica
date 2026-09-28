# Pedidos de venda e logística

Documento de negócio do MASTER 013. Descreve o que o sistema faz e, principalmente, o que ele
**não** faz. Nenhuma linha aqui deve ser lida como promessa de entrega.

## A regra que organiza tudo

**Pedido de venda não é venda recebida.**

Um rascunho é apenas um pedido comercial. Ele não vale nada, não ocupa estoque, não cria
obrigação financeira e não aparece como faturamento. Cada etapa seguinte tem efeito próprio:

| Etapa | Efeito físico | Efeito financeiro |
| --- | --- | --- |
| Rascunho | nenhum | nenhum |
| Enviar para aprovação | nenhum | nenhum |
| Aprovar | nenhum | depende do gatilho configurado |
| Reservar | **nenhum** — apenas prende disponibilidade | nenhum |
| Separar e conferir | **nenhum** | nenhum |
| Expedir | **baixa oficial no estoque** | depende do gatilho configurado |
| Entregar | nenhum — a baixa já ocorreu | nenhum |
| Receber devolução | devolve mercadoria ao estoque | fica como **solicitação** |

Três linhas dessa tabela costumam ser mal interpretadas e valem ser repetidas:

- **Reserva não movimenta estoque.** Ela torna a mercadoria indisponível para os demais pedidos.
  Saldo físico não muda. Cancelar o pedido libera a reserva; o saldo continua o mesmo.
- **Separar não baixa estoque.** Separar, conferir e embalar preparam a mercadoria. A baixa
  acontece quando a expedição é despachada.
- **Entregar não mexe no saldo.** A baixa já ocorreu na expedição. Confirmar entrega registra o
  fato, não movimenta mercadoria.

## Disponibilidade

```
DISPONÍVEL = SALDO FÍSICO − RESERVAS
```

O saldo físico vem do ledger oficial de inventário. As reservas vêm das políticas de reserva da
organização. A tela mostra as duas parcelas para que a diferença seja auditável, e consultar
disponibilidade não reserva nem movimenta nada.

Reservas têm validade configurável. Uma reserva vencida expira sozinha quando a expiração é
processada e devolve a disponibilidade, sem tocar no saldo físico.

## Preço

O preço do item **nunca** é digitado. Ele vem da tabela de preços oficial vigente na data do
pedido. Se o cliente enviar um preço, o servidor o ignora e aplica a tabela.

Na conversão de proposta aceita, o preço aceito é preservado — a proposta já foi negociada e
assinada comercialmente, e a tabela pode ter mudado desde o aceite.

Desconto é aplicado sobre a tabela oficial. O desconto máximo por organização, quando existe,
limita o que o salesperson pode conceder; quando não existe, vale a alçada de desconto do CRM.
Desconto é sobre a tabela, nunca substitui a tabela.

## Aprovação e crédito

A aprovação avalia o crédito no momento da aprovação, com o valor avaliado naquele instante, e
guarda esse valor. A tela mostra o que foi avaliado; quem reavalia é o servidor.

A exposição de crédito é configurável: somente recebíveis em aberto, ou recebíveis mais pedidos
aprovados em aberto. Cliente bloqueado no CRM é recusado.

Com segregação de funções ativa, quem cria o pedido não pode aprová-lo. Quem aprova pode registrar
o motivo, e o motivo fica no histórico.

A aprovação publica a demanda para o MRP, na mesma transação. Cancelar pedido remove a demanda.

## Separação, conferência e embalagem

Separar acumula a quantidade separada de cada item, por leitura de código de barras ou por SKU. Item
errado e excesso são recusados pelo servidor.

Conferir confronta o separado com o conferido. **A diferença vira ocorrência, não estoque** — não
existe caminho em que divergência de separação increase o saldo. A conferência é imutável depois de
registrada.

Embalagem registra peso e dimensões **medidos**. O sistema nunca estima peso nem calcula volume
por conta própria. Medidas e volumes ficam registrados por expedição para conferência posterior.

Expedir exige duas permissões: a de expedição e a de movimentação de inventário. A tela mostra o
botão; o banco exige as duas.

## Expedição e entrega

A expedição é criada a partir de um atendimento liberado. Ela nasce como rascunho pronta e recebe
transportadora, código de rastreio e data prevista de entrega.

Despachar dá a baixa oficial no ledger, uma única vez. Reenviar a mesma operação não duplica a
baixa. A expedição parcial está autorizada quando a organização permite, e o saldo do pedido
permanece em aberto.

Rastreio é **manual**. O modo integrado existe como opção, mas nenhum provedor externo está
conectado: não há consulta automática a transportadora.

Confirmar entrega exige prova de entrega registrada. O cadastro de recebedor é registro manual de
evidência: nome de quem recebeu e observação. Não há upload de foto nem assinatura digital.

Entregar não fecha o pedido e não altera o saldo. Fechar é ato comercial separado, e exige que o
pedido esteja expedido.

## Devoluções

Devolução nasce de uma expedição entregue. Ela passa por rascunho, aprovação e recebimento.

Ao receber, a mercadoria volta ao estoque, e a **destinação** é obrigatória: revendável,
quarentena ou inspeção. Mercadoria danificada ou com defeito **não** pode ir para estoque
revendável. Saldo em quarentena não atende venda direta.

O ajuste financeiro da devolução fica como **solicitação**. O sistema não baixa, não titula e não
concilia automaticamente. Quem executa o estorno é o financeiro, no módulo dele.

O recebimento é idempotente e respeita o teto acumulado: não é possível devolver mais do que foi
entregue, mesmo repetindo a chamada.

## Ocorrências

Divergência de separação, atraso de entrega e problema em trânsito ficam em ocorrências, com
gravidade e situação. Cada ocorrência registra a ação e a resolução, e o histórico permanece.

Ocorrência não é desculpa automática: registrar uma não altera estoque, não fecha pedido e não
estorna valor. Ela informa.

## Políticas por organização

As doze políticas são editáveis na tela e validadas pelo servidor, que recusa qualquer valor fora
da lista:

| Política | Opções |
| --- | --- |
| Reserva de estoque | Somente a quantidade inteira · Permitir reserva parcial · Permitir disponível negativo |
| Validade da reserva | 1 a 8760 horas |
| Venda sob encomenda | Sim · Não |
| Alteração de preço | Bloquear sempre · Permitir com alçada |
| Exposição de crédito | Somente recebíveis em aberto · Recebíveis e pedidos aprovados |
| Segregação na aprovação | Sim · Não |
| Desconto máximo | 0 a 100%, ou em branco para usar a alçada do CRM |
| Expedição parcial | Sim · Não |
| Conferência integral antes de expedir | Sim · Não |
| Endereço de entrega obrigatório | Sim · Não |
| Rastreamento | Manual · Integrado com transportadora (sem provedor conectado) |
| Gatilho financeiro | Não gerar · Na aprovação · Na expedição, proporcional ao expedido |

Com conferência parcial desligada, expedir exige que a quantidade conferida cubra a expedida. Com
conferência integral ligada, a diferença separada vira ocorrência.

## O que este sistema não faz

Estes itens **não** existem e não devem ser apresentados como existentes:

- **Nota fiscal e integração fiscal.** Não há NF-e, nem emissão, nem transmissão de documento fiscal.
- **Transportadora externa.** Nenhuma consulta de rastreio, nenhuma integração de coleta.
- **Cobrança e recebimento.** A obrigação financeira existe; o recebimento é feito no módulo
  financeiro, não aqui.
- **Expiração automática em background.** A reserva expira por chamada processada; não há job
 Rodando sozinho.
- **Assinatura digital ou upload de foto na entrega.** O registro de recebedor é manual.
- **Estimativa automática de peso e volume.** Só o que foi medido é registrado.
- **Comissão financeira.** Não há apuração de comissão aqui.

## Permissões

| Permissão | O que abre |
| --- | --- |
| `sales_orders.read` | lista e detalhe do pedido |
| `sales_orders.create` | novo pedido e conversão de proposta |
| `sales_orders.update` | edição, envio e fechamento |
| `sales_orders.approve` | aprovar e rejeitar |
| `sales_orders.cancel` | cancelar pedido |
| `reservations.read` / `.create` / `.release` | reservas |
| `fulfillment.read` / `.manage` | separação e embalagem |
| `picking.execute` / `.confirm` | leitura de código de barras e conferência |
| `packing.manage` | embalagem |
| `shipments.read` / `.create` / `.dispatch` / `.confirm_delivery` | expedições e entregas |
| `returns.read` / `.create` / `.approve` / `.receive` | devoluções |
| `logistics.read` / `.export` / `.exceptions` | ocorrências |
| `carriers.manage` | transportadoras |
| `sales_credit.read` | crédito do cliente |
| `sales.dashboard` | indicadores |
| `sales.configure` | políticas da organização |

A permissão decide se o botão aparece. Quem valida, com estado e regra, continua sendo o banco: um
botão visível pode ser recusado, e isso é o comportamento correto.
