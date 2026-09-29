# Documentos fiscais de saída

## Preparação

`fiscal_prepare` requer criação e simulação. A quantidade vem exclusivamente da operação existente:

| Origem | Critério operacional | Valoração |
| --- | --- | --- |
| SHIPMENT | expedição despachada | preço e desconto proporcional do pedido |
| PARTNER_SHIPMENT | remessa com transferência registrada | valor fiscal explícito, com justificativa |
| CUSTOMER_RETURN | recebimento confirmado, quantidade recebida positiva | nova valoração e regra da devolução |
| SUPPLIER_RETURN | devolução POSTED | nova valoração e regra da devolução |
| PARTNER_RETURN | retorno RECEIVED, com transferência | nova valoração e regra do retorno |
| INTERNAL_TRANSFER | transferência COMPLETED, estabelecimentos distintos vinculados aos locais | valoração fiscal explícita |

Transferir entre duas localizações não implica obrigação fiscal: a operação precisa exigir documento, e a transferência fiscal exige estabelecimentos distintos. Não há geração de documento somente porque ocorreu movimento físico.

Venda parcial é atendida por expedição: pedido de 100 e expedição de 60 resultam em documento de 60. Não há emissão automática para o saldo nem divisão arbitrária de uma mesma expedição. UNIQUE(organização, origem, id) impede duplicação; repetir devolve o documento existente e configurações diferentes são recusadas. Reemissão após cancelamento e revisão de rascunho preparado ainda precisam de fluxo de substituição explícito.

Preparação captura estabelecimento, natureza/CFOP, leiaute, origem, descrição, quantidade, preço, classificação e tributos. A referência opcional a documento original é validada por organização e contraparte; sua obrigatoriedade deve constar da configuração de campos do leiaute.

## Estados e validação

DRAFT → validação cadastral → PENDING_VALIDATION ou VALIDATED → conferência com justificativa → READY_TO_SEND.

A validação lê `required_fields` do snapshot do leiaute como caminhos, por exemplo `recipient.tax_registration`, `issuer_address.street` e `original_document_id`. A interface oferece uma lista mínima de cadastro/endereço, sem afirmar validação XSD integral. Perfil aprovado do destinatário é necessário; não se exige indiscriminadamente IE para todos.

Conferido não é transmitido. `submit` e `cancel` verificam permissão/estado e registram PROVIDER_UNAVAILABLE enquanto não houver adaptador. Não mudam o documento para AUTHORIZED, REJECTED ou CANCELED. Não existe endpoint público que permita informar manualmente um protocolo e obter autorização.

Estados reservados SENDING, PROCESSING, AUTHORIZED, REJECTED, CANCELLATION_REQUESTED, CANCELED, DENIED e CONTINGENCY_PENDING aguardam o adaptador real. Um CHECK exige chave, protocolo, data e XML nos estados oficialmente autorizados. Isso complementa, mas não substitui, a futura verificação da evidência remota.

## Número e arquivos

O alocador transacional privado separa organização, estabelecimento, ambiente, modelo e série. Foi testado sob concorrência e não está disponível ao frontend. Não se consome número enquanto não houver adaptador operacional. O tratamento de inutilização e política de números em falhas requer integração homologada.

Arquivos pertencem ao bucket privado `fiscal-private`, em organização/estabelecimento/modelo/ano/mês/documento. XML e PDF são diferentes: o PDF auxiliar não comprova autorização. Saída oficial e PDF ainda não são produzidos; XML recebido possui fluxo de arquivamento real no código.
