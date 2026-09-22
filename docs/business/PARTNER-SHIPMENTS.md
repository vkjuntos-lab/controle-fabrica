# Remessas e devoluções — MASTER 006

## Estratégia física

**Remessa não é venda. Remessa não gera automaticamente contas a receber.**
**Estoque do parceiro é derivado do Inventory Ledger.**
**Devolução não altera a remessa histórica.**
**Quantidade enviada e quantidade vendida são conceitos diferentes.**

Decisão: transferência direta origem → parceiro em **SHIPPED**. Não usa trânsito intermediário.
DELIVERED registra data e quem recebeu, sem repetir movimento. A posição contabilizada no parceiro
pode, portanto, incluir mercadoria expedida ainda sem confirmação de entrega. `delivered_at` permite
separar confirmação logística da posição operacional; não chamar essa posição de recebimento confirmado.
TRANSIT permanece no inventário para evolução futura, sem misturar estratégias nesta versão.

## Entidades e estados

`partner_shipments`: número UUID prefixado REM-, organization_id, parceiro, origem/destino, status,
data, previsão, transportadora/rastreio, notas, criador/aprovador, expedição/entrega, recebedor e transfer_id.
`partner_shipment_items`: ProductVariant, lote opcional, quantidade positiva, quantidade separada e notas.

Fluxo inicial:

```text
DRAFT → APPROVED → PICKING → SHIPPED → DELIVERED
   └──────── pré-expedição ───────→ CANCELED
SHIPPED/DELIVERED → PARTIALLY_RETURNED → RETURNED
```

PENDING_APPROVAL está preparado no schema; o fluxo atual aprova diretamente DRAFT. Receber uma entrega
após uma devolução preserva o status parcial/total e acrescenta delivered_at/received_by. CANCEL não é
aceito após expedição. Itens comerciais são imutáveis após criação; em PICKING só muda picked_quantity.
Para corrigir um rascunho, cancelar e criar outro. Não há editor de itens consolidados.

Na criação: parceiro ativo, origem da organização (não PARTNER), destino PARTNER do perfil, produto/
variante/lote da mesma organização, lote pertencente à variante, quantidades positivas e itens presentes.
O saldo mostrado no formulário é informativo; a validação autoritativa ocorre na expedição.

## Picking e expedição

Busca por nome, SKU ou barcode. BarcodeInput existente aceita leitor USB/Bluetooth/entrada manual,
com Enter. Não há câmera. Scan incrementa a separação; código estranho/ambíguo por lote solicita seleção
manual. Quantidade separada deve ficar entre zero e solicitado. Scan não gera movimento.
Expedição exige todos os itens separados. UI mostra solicitado, separado e faltante, com controles móveis.

`partner_shipment_action(...,'ship')` revalida status, parceiro e estoque dentro da transação. Gera
InventoryTransfer e movimentos POSTED com quantity positiva, OUT na origem e IN no parceiro,
movement_type/reference_type PARTNER_SHIPMENT, reference_id = InventoryTransfer.id.
`PartnerShipment.transfer_id` conecta os dois movimentos ao documento empresarial. Lote é preservado.

O núcleo privado `inventory_transfer_internal` é o mesmo mecanismo usado por `inventory_post_transfer`.
O wrapper público de estoque encaminha localizações vinculadas ao fluxo de remessa/devolução, evitando
contornar estado, bloqueio e permissões do parceiro. Localizações legadas sem vínculo continuam atendidas
pelas operações existentes. Nenhuma coluna de saldo foi criada.

Lock transacional por organização serializa os escritores do ledger e validações de saldo. Falha em
qualquer item/entrada/saída aborta tudo, inclusive status e auditoria de sucesso. `transfer_id` e chave
`partner-shipment:<id>` deduplicam retries. Quantidade negativa segue a configuração e as permissões do
Inventory Service; quando autorizada, o aviso e Audit Log existentes são preservados.

## Devoluções

`partner_returns`: número DEV-, organização, parceiro, remessa opcional, origem/destino, data, status,
recebimento, notas, criador e transfer_id. `partner_return_items`: variante, lote, quantidade, condição,
motivo obrigatório e notas. Condições SELLABLE, DAMAGED, DEFECTIVE, OTHER.

DRAFT → RECEIVED em `partner_receive_return`. Origem pertence ao parceiro. Destino da organização,
ativo. SELLABLE pode retornar à localização normal; demais condições exigem QUARANTINE/INSPECTION.
Um documento usa um destino e um item por variante/lote. Para condições/destinos diferentes, registrar
devoluções separadas. Não existe liberação automática de quarentena ou afirmação de saldo disponível.

No recebimento: OUT parceiro + IN destino, PARTNER_RETURN, mesma referência InventoryTransfer,
atômico e idempotente por `partner-return:<id>` e status RECEIVED. Quando vinculada à remessa, cada
variante/lote é limitada ao enviado menos devoluções já recebidas; pendências não alteram saldo.
Devolução sem remessa exige saldo na localização, mas não atribui automaticamente crédito a uma remessa
histórica. Isso evita inventar FIFO/reconciliação. Histórico mantém as quantidades enviadas originais.

Devolução recebida não é editada/deletada. Estorno genérico de par de movimentos vinculado a remessa/
devolução é bloqueado, para não contradizer o documento. Correção física usa novo documento adequado
(remessa/devolução) e, em divergência real, ajuste autorizado com motivo. A versão inicial não tem
workflow específico para anular uma devolução errada, nem cancelamento de devolução em rascunho na UI.

## Impressão e anexos

Romaneio é a impressão autenticada da remessa: número, data, parceiro, origem/destino, produtos, SKU,
lote, quantidades, total e notas. Não é nota fiscal. Histórico/ações/sidebar não são impressos.
QR Code de remessa é opcional e não foi implementado.

Preparação real de Storage: bucket **privado** `partner-documents`, limite 10 MB, PDF/JPEG/PNG.
Caminho `organization_id/shipment_id/file_uuid.ext`. RLS exige remessa no tenant e
`partner_shipments.read` para ler, `partner_shipments.ship` para acrescentar. Sem update/delete de
anexos; políticas restritivas impedem que permissões abrangentes legadas abram este bucket.
Integração futura deve usar upload autenticado e URL assinada de curta duração, jamais getPublicUrl.
O formulário de upload/listagem e metadados de anexos ainda não estão implementados; preparação não é
apresentada como funcionalidade de upload pronta.

## Rastreabilidade

Audit Log: criação, aprovação, início/picking/conclusão, expedição com transfer_id/movement_ids,
entrega, cancelamento e devolução recebida. Ledger conserva before/after e usuário. Detalhes exibem
itens, devoluções relacionadas, movimentos e eventos (últimos 100); histórico do parceiro é paginado.

As cadeias de mercadoria e venda externa permanecem separadas. Nenhum handler aqui grava venda,
receita, contas a receber, pagamento, fechamento ou baixa por MarketplaceSale.
