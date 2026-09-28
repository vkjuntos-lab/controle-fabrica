import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { PERMISSIONS } from "@/lib/rbac";
import { money, str } from "@/components/crm/shared";
import { SalesAction, type ActionItem } from "@/components/sales/action";
import { numeric, object, rows, text, useSalesRead, type Row } from "@/components/sales/shared";
import {
  CARRIER_MODALITY,
  DELIVERED_SHIPMENT_STATUS,
  IN_TRANSIT_SHIPMENT_STATUS,
  OPEN_ORDER_STATUS,
  RETURN_DESTINATION,
  fulfillmentActions,
  fulfillmentStatusLabel,
  isOneOf,
  orderActions,
  orderStatusLabel,
  pickingStatusLabel,
  reservationStatusLabel,
  returnDestinationLabel,
  returnStatusLabel,
  shipmentStatusLabel,
  stockStatusLabel,
} from "@/lib/sales/constants";

/**
 * Detalhe de um pedido de venda.
 *
 * Reúne o que é fato (itens, disponibilidade oficial, reservas, atendimento,
 * expedições, devoluções, recebíveis, movimentos do ledger e histórico) e as
 * ações possíveis no estado atual. A tela não decide o que é possível: ela lê o
 * status devolvido pelo servidor e oferece a ação correspondente; quem valida,
 * com permissão e regra, continua sendo a RPC.
 */
export function OrderDetail({
  organizationId,
  orderId,
}: {
  organizationId: string;
  orderId: string;
}) {
  const query = useSalesRead(organizationId, "detail", orderId);
  const locations = useSalesRead(organizationId, "locations");

  if (query.isPending) return <LoadingState label="Carregando pedido" />;
  if (query.error) {
    return <ErrorState description={query.error.message} onRetry={() => void query.refetch()} />;
  }

  const data = object(query.data);
  const order = object(data.order);
  const status = text(order.status);
  const actions = orderActions(status);
  const locationChoices = rows(locations.data).map((row) => ({
    key: text(row.id),
    label: `${str(row.name)}${row.type ? ` · ${str(row.type)}` : ""}`,
  }));
  const sourceField = {
    key: "source_location_id",
    label: "Localização de origem",
    required: true,
    options: locationChoices.map((choice) => choice.key),
    optionLabels: Object.fromEntries(locationChoices.map((choice) => [choice.key, choice.label])),
  };

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-xl font-semibold">
          {str(order.order_number)} ·{" "}
          {str(object(data.company).legal_name || object(data.company).trade_name)}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{orderStatusLabel(status)}</Badge>
          <span className="text-sm text-muted-foreground">
            Estoque: {stockStatusLabel(order.stock_status)}
          </span>
        </div>
        <p className="text-sm">
          Total do pedido: <strong>{money(order.total_amount)}</strong>
        </p>
        {order.expected_delivery_date ? (
          <p className="text-sm text-muted-foreground">
            Previsão de entrega: {str(order.expected_delivery_date)}
          </p>
        ) : null}
        {str(order.commercial_notes) === "—" ? null : (
          <p className="text-sm text-muted-foreground">
            Observações: {str(order.commercial_notes)}
          </p>
        )}
      </header>

      <OrderActions
        organizationId={organizationId}
        orderId={orderId}
        status={status}
        actions={actions}
        sourceField={sourceField}
        items={rows(data.items)}
      />

      <Section
        title="Itens do pedido"
        description="Preço e quantidade vêm da tabela oficial e da proposta aceita; a tela não permite digitá-los."
      >
        <Table
          data={rows(data.items)}
          columns={[
            ["sku_snapshot", "SKU"],
            ["description_snapshot", "Descrição"],
            ["ordered_quantity", "Pedido"],
            ["unit_price", "Preço"],
            ["reserved_quantity", "Reservado"],
            ["fulfilled_quantity", "Expedido"],
            ["delivered_quantity", "Entregue"],
            ["returned_quantity", "Devolvido"],
          ]}
        />
      </Section>

      <Section
        title="Disponibilidade oficial"
        description="Saldo físico menos reservas, como o servidor calcula. Consultar não reserva nem movimenta mercadoria."
      >
        <p className="text-sm text-muted-foreground">
          Quantidade necessária: {numeric(object(data.availability).required_quantity)}
        </p>
        {/* Só os campos que `sales_availability` devolve. A reserva por item não
            vem no resultado: deduzi-la aqui seria calcular regra no cliente. */}
        <Table
          data={rows(object(data.availability).items)}
          columns={[
            ["sku", "SKU"],
            ["available", "Disponível"],
            ["on_hand", "Saldo físico"],
          ]}
        />
      </Section>

      <Section
        title="Reservas"
        description="Reserva prende disponibilidade; não é baixa de estoque."
      >
        <Table
          data={rows(data.reservations)}
          columns={[
            ["sku_snapshot", "SKU"],
            ["location_name", "Local"],
            ["quantity", "Reservado"],
            ["status", "Situação"],
          ]}
          render={(row) => reservationStatusLabel(row.status)}
        />
      </Section>

      <Fulfillments
        organizationId={organizationId}
        orderId={orderId}
        fulfillments={rows(data.fulfillments)}
        tasks={rows(data.picking_tasks)}
        picks={rows(data.picking_items)}
      />

      <Section
        title="Expedições e entregas"
        description="A expedição é a etapa que dá baixa oficial no estoque, uma única vez."
      >
        <Table
          data={rows(data.shipments)}
          columns={[
            ["shipment_number", "Expedição"],
            ["status", "Situação"],
            ["tracking_code", "Rastreio"],
            ["delivered_quantity", "Entregue"],
          ]}
          render={(row) => shipmentStatusLabel(row.status)}
        >
          {(shipment) => (
            <ShipmentActions
              organizationId={organizationId}
              orderId={orderId}
              shipment={shipment}
              shipmentItems={rows(data.shipment_items).filter(
                (item) => text(item.shipment_id) === text(shipment.id),
              )}
            />
          )}
        </Table>
      </Section>

      <Returns
        organizationId={organizationId}
        returns={rows(data.returns)}
        returnItems={rows(data.return_items)}
        locationChoices={locationChoices}
      />

      {rows(data.receivables).length > 0 ? (
        <Section
          title="Recebíveis"
          description="Gerados pelo gatilho financeiro configurado. Obrigação em aberto não é recebimento."
        >
          <Table
            data={rows(data.receivables)}
            columns={[
              ["status", "Situação"],
              ["original_amount", "Valor original"],
              ["open_amount", "Em aberto"],
            ]}
          />
        </Section>
      ) : null}

      <Section
        title="Movimentos oficiais de estoque"
        description="Derivados do ledger; nunca editados."
      >
        <Table
          data={rows(data.movements)}
          columns={[
            ["created_at", "Data"],
            ["sku_snapshot", "SKU"],
            ["quantity", "Quantidade"],
            ["status", "Situação"],
          ]}
        />
      </Section>

      <Section title="Histórico" description="Transições registradas pelo servidor.">
        <Table
          data={rows(data.history)}
          columns={[
            ["created_at", "Data"],
            ["action", "Ação"],
            ["previous_status", "Anterior"],
            ["new_status", "Novo"],
          ]}
        />
      </Section>
    </div>
  );
}

function OrderActions({
  organizationId,
  orderId,
  status,
  actions,
  sourceField,
  items,
}: {
  organizationId: string;
  orderId: string;
  status: string;
  actions: string[];
  sourceField: {
    key: string;
    label: string;
    required?: boolean;
    options: string[];
    optionLabels: Record<string, string>;
  };
  items: Row[];
}) {
  const reason = { key: "reason", label: "Motivo", type: "textarea" as const, required: true };
  const open = isOneOf(status, OPEN_ORDER_STATUS);

  return (
    <div className="flex flex-wrap gap-2">
      {actions.includes("submit") ? (
        <SalesAction
          organizationId={organizationId}
          label="Enviar para aprovação"
          permission={PERMISSIONS.salesOrdersUpdate}
          operation="order"
          id={orderId}
          action="submit"
          description="Enviar não aprova. A aprovação é de outro usuário quando a segregação está ativa."
        />
      ) : null}
      {actions.includes("approve") ? (
        <SalesAction
          organizationId={organizationId}
          label="Aprovar pedido"
          permission={PERMISSIONS.salesOrdersApprove}
          operation="order"
          id={orderId}
          action="approve"
          fields={[reason]}
          description="A aprovação avalia o crédito e cria a demanda. Ela não gera recebimento."
        />
      ) : null}
      {actions.includes("reject") ? (
        <SalesAction
          organizationId={organizationId}
          label="Rejeitar pedido"
          permission={PERMISSIONS.salesOrdersApprove}
          operation="order"
          id={orderId}
          action="reject"
          fields={[reason]}
        />
      ) : null}
      {actions.includes("reserve") ? (
        <SalesAction
          organizationId={organizationId}
          label="Reservar estoque"
          permission={PERMISSIONS.reservationsCreate}
          operation="reserve"
          id={orderId}
          fields={[sourceField]}
          description="A reserva torna a mercadoria indisponível para os demais pedidos, sem baixar estoque."
        />
      ) : null}
      {actions.includes("create_fulfillment") ? (
        <SalesAction
          organizationId={organizationId}
          label="Criar separação"
          permission={PERMISSIONS.fulfillmentManage}
          operation="fulfillment_create"
          id={orderId}
          fields={[sourceField]}
          items={toActionItems(items)}
          description="Informe quanto sair de cada item. Separar não baixa estoque."
        />
      ) : null}
      {actions.includes("close") ? (
        <SalesAction
          organizationId={organizationId}
          label="Encerrar pedido"
          permission={PERMISSIONS.salesOrdersUpdate}
          operation="order"
          id={orderId}
          action="close"
          fields={[reason]}
          description="Encerrar consolida o histórico; não apaga expedição nem devolução."
        />
      ) : null}
      {open && !actions.includes("cancel") ? null : null}
      {actions.includes("cancel") ? (
        <SalesAction
          organizationId={organizationId}
          label="Cancelar pedido"
          permission={PERMISSIONS.salesOrdersCancel}
          operation="order"
          id={orderId}
          action="cancel"
          fields={[reason]}
          description="Cancelar libera reservas e fecha o pedido. O que já foi expedido permanece no histórico."
        />
      ) : null}
    </div>
  );
}

function Fulfillments({
  organizationId,
  orderId,
  fulfillments,
  tasks,
  picks,
}: {
  organizationId: string;
  orderId: string;
  fulfillments: Row[];
  tasks: Row[];
  picks: Row[];
}) {
  if (fulfillments.length === 0) {
    return (
      <EmptyState
        title="Nenhuma separação criada"
        description="A separação é criada a partir de um pedido aprovado e é o que prepara a mercadoria para expedição."
      />
    );
  }
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Separação, conferência e embalagem</h2>
      {fulfillments.map((fulfillment) => {
        const status = text(fulfillment.status);
        const task = tasks.find((row) => text(row.fulfillment_order_id) === text(fulfillment.id));
        const taskPicks = picks.filter((row) => text(row.picking_task_id) === text(task?.id));
        return (
          <Card key={text(fulfillment.id)}>
            <CardHeader>
              <CardTitle className="text-base">
                {str(fulfillment.fulfillment_number)} · {fulfillmentStatusLabel(status)}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {fulfillmentActions(status).map((action) => (
                  <SalesAction
                    key={action.action}
                    organizationId={organizationId}
                    label={action.label}
                    permission={action.permission}
                    operation="fulfillment"
                    id={text(fulfillment.id)}
                    action={action.action}
                  />
                ))}
                {status === "PICKING" ? (
                  <SalesAction
                    organizationId={organizationId}
                    label="Ler código de barras / SKU"
                    permission={PERMISSIONS.pickingExecute}
                    operation="scan"
                    id={text(task?.id)}
                    fields={[
                      { key: "code", label: "Código de barras ou SKU", required: true },
                      { key: "quantity", label: "Quantidade", type: "number", required: true },
                    ]}
                    initial={{ quantity: 1 }}
                    description="Cada leitura soma à quantidade separada. Separar não baixa estoque."
                  />
                ) : null}
                {text(task?.status) === "PICKED" ? (
                  <SalesAction
                    organizationId={organizationId}
                    label="Conferir quantidades"
                    permission={PERMISSIONS.pickingConfirm}
                    operation="confirm"
                    id={text(task?.id)}
                    items={taskPicks.map((pick) => ({
                      id: text(pick.id),
                      label: `${str(pick.sku_snapshot)} — separado: ${numeric(pick.picked_quantity)}`,
                    }))}
                    itemField="picking_task_item_id"
                    quantityField="confirmed_quantity"
                    description="A diferença entre separado e conferido vira ocorrência; a conferência não altera o estoque."
                  />
                ) : null}
                {status === "PACKING" ? (
                  <SalesAction
                    organizationId={organizationId}
                    label="Registrar embalagem"
                    permission={PERMISSIONS.packingManage}
                    operation="pack"
                    id={text(fulfillment.id)}
                    items={taskPicks.map((pick) => ({
                      id: text(pick.id),
                      label: str(pick.sku_snapshot),
                    }))}
                    itemField="picking_task_item_id"
                    fields={[
                      { key: "gross_weight_kg", label: "Peso medido (kg)", type: "number" },
                      { key: "length_cm", label: "Comprimento (cm)", type: "number" },
                      { key: "width_cm", label: "Largura (cm)", type: "number" },
                      { key: "height_cm", label: "Altura (cm)", type: "number" },
                    ]}
                    description="Registre o que foi medido. Peso e dimensões nunca são estimados pelo sistema."
                  />
                ) : null}
                {status === "READY_FOR_SHIPMENT" ? (
                  <SalesAction
                    organizationId={organizationId}
                    label="Criar expedição"
                    permission={PERMISSIONS.shipmentsCreate}
                    operation="shipment_create"
                    id={orderId}
                    fixed={{ fulfillment_order_id: text(fulfillment.id) } as Row}
                    fields={[
                      {
                        key: "carrier_id",
                        label: "Transportadora",
                        hint: "Opcional: a expedição pode ser criada sem transportadora definida.",
                      },
                      { key: "tracking_code", label: "Código de rastreio" },
                      {
                        key: "expected_delivery_at",
                        label: "Entrega prevista",
                        type: "datetime-local",
                      },
                    ]}
                    description="A expedição é criada como rascunho pronta; a baixa de estoque acontece ao despachar."
                  />
                ) : null}
              </div>
              {task ? (
                <p className="text-sm text-muted-foreground">
                  Tarefa de separação: {pickingStatusLabel(task.status)}
                </p>
              ) : null}
              <Table
                data={taskPicks}
                columns={[
                  ["sku_snapshot", "SKU"],
                  ["requested_quantity", "Solicitado"],
                  ["picked_quantity", "Separado"],
                  ["confirmed_quantity", "Conferido"],
                ]}
              />
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}

function ShipmentActions({
  organizationId,
  orderId,
  shipment,
  shipmentItems,
}: {
  organizationId: string;
  orderId: string;
  shipment: Row;
  shipmentItems: Row[];
}) {
  const status = text(shipment.status);
  return (
    <div className="flex flex-wrap gap-2">
      {status === "READY" ? (
        <SalesAction
          organizationId={organizationId}
          label="Confirmar expedição"
          permission={PERMISSIONS.shipmentsDispatch}
          operation="dispatch"
          id={text(shipment.id)}
          description="Despachar dá a baixa oficial no estoque. Repetir a chamada não duplica a baixa."
        />
      ) : null}
      {isOneOf(status, IN_TRANSIT_SHIPMENT_STATUS) ? (
        <>
          <SalesAction
            organizationId={organizationId}
            label="Registrar rastreio"
            permission={PERMISSIONS.shipmentsDispatch}
            operation="shipment"
            action="track"
            id={text(shipment.id)}
            fields={[{ key: "tracking_code", label: "Código de rastreio", required: true }]}
          />
          <SalesAction
            organizationId={organizationId}
            label="Registrar recebedor"
            permission={PERMISSIONS.shipmentsConfirmDelivery}
            operation="shipment"
            action="proof"
            id={text(shipment.id)}
            fixed={{ proof_type: "SIGNATURE" } as Row}
            fields={[
              { key: "signature_name", label: "Nome do recebedor", required: true },
              { key: "notes", label: "Evidência / observações", type: "textarea", required: true },
            ]}
            description="Registro manual de evidência. Não há upload de foto ou assinatura digital."
          />
          <SalesAction
            organizationId={organizationId}
            label="Confirmar entrega"
            permission={PERMISSIONS.shipmentsConfirmDelivery}
            operation="shipment"
            action="deliver"
            id={text(shipment.id)}
            description="Confirmar entrega não mexe no saldo: a baixa já ocorreu na expedição."
          />
        </>
      ) : null}
      {isOneOf(status, DELIVERED_SHIPMENT_STATUS) ? (
        <SalesAction
          organizationId={organizationId}
          label="Solicitar devolução"
          permission={PERMISSIONS.returnsCreate}
          operation="return_create"
          id={orderId}
          fixed={{ shipment_id: text(shipment.id) } as Row}
          fields={[{ key: "reason", label: "Motivo", type: "textarea", required: true }]}
          items={shipmentItems.map((item) => ({
            id: text(item.sales_order_item_id),
            label: `${str(item.sku_snapshot)} — entregue: ${numeric(item.delivered_quantity)}`,
            pending: numeric(item.delivered_quantity) - numeric(item.returned_quantity),
          }))}
          description="Informe o que está voltando. O ajuste financeiro fica como solicitação, sem execução automática."
        />
      ) : null}
    </div>
  );
}

function Returns({
  organizationId,
  returns,
  returnItems,
  locationChoices,
}: {
  organizationId: string;
  returns: Row[];
  returnItems: Row[];
  locationChoices: { key: string; label: string }[];
}) {
  return (
    <Section
      title="Devoluções"
      description="Receber devolução devolve mercadoria ao estoque. Destino diferente de revendável exige quarentena ou inspeção."
    >
      {returns.length === 0 ? (
        <EmptyState
          title="Nenhuma devolução"
          description="A devolução é criada a partir de uma expedição entregue."
        />
      ) : (
        <div className="space-y-3">
          {returns.map((entry) => {
            const status = text(entry.status);
            const items = returnItems.filter(
              (row) => text(row.customer_return_id) === text(entry.id),
            );
            return (
              <Card key={text(entry.id)}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {str(entry.return_number)} · {returnStatusLabel(status)}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex flex-wrap gap-2">
                    {status === "DRAFT" ? (
                      <SalesAction
                        organizationId={organizationId}
                        label="Submeter devolução"
                        permission={PERMISSIONS.returnsCreate}
                        operation="return"
                        id={text(entry.id)}
                        action="submit"
                      />
                    ) : null}
                    {status === "PENDING_APPROVAL" ? (
                      <SalesAction
                        organizationId={organizationId}
                        label="Aprovar devolução"
                        permission={PERMISSIONS.returnsApprove}
                        operation="return"
                        id={text(entry.id)}
                        action="approve"
                        fields={[
                          { key: "reason", label: "Motivo", type: "textarea", required: true },
                        ]}
                      />
                    ) : null}
                    {status === "APPROVED" ? (
                      <SalesAction
                        organizationId={organizationId}
                        label="Receber devolução"
                        permission={PERMISSIONS.returnsReceive}
                        operation="return"
                        id={text(entry.id)}
                        action="receive"
                        fields={[
                          {
                            key: "destination_location_id",
                            label: "Local de destino",
                            required: true,
                            options: locationChoices.map((choice) => choice.key),
                            optionLabels: Object.fromEntries(
                              locationChoices.map((choice) => [choice.key, choice.label]),
                            ),
                          },
                          {
                            key: "destination",
                            label: "Destinação",
                            required: true,
                            options: ["SELLABLE", "QUARANTINE", "INSPECTION"],
                            optionLabels: {
                              SELLABLE: "Revendável",
                              QUARANTINE: "Quarentena",
                              INSPECTION: "Inspeção",
                            },
                          },
                        ]}
                        items={items.map((item) => ({
                          id: text(item.id),
                          label: str(item.sku_snapshot),
                        }))}
                        itemField="customer_return_item_id"
                        description="Mercadoria danificada ou com defeito não pode ir para estoque revendável."
                      />
                    ) : null}
                    {status === "RECEIVED" || status === "INSPECTED" ? (
                      <SalesAction
                        organizationId={organizationId}
                        label="Concluir devolução"
                        permission={PERMISSIONS.returnsCreate}
                        operation="return"
                        id={text(entry.id)}
                        action="complete"
                        fields={[
                          { key: "reason", label: "Motivo", type: "textarea", required: true },
                        ]}
                      />
                    ) : null}
                  </div>
                  <Table
                    data={items}
                    columns={[
                      ["sku_snapshot", "SKU"],
                      ["requested_quantity", "Solicitado"],
                      ["received_quantity", "Recebido"],
                      ["destination", "Destinação"],
                    ]}
                    render={(row) => returnDestinationLabel(row.destination)}
                  />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

function Table({
  data,
  columns,
  render,
  children,
}: {
  data: Row[];
  columns: [string, string][];
  render?: (row: Row) => string;
  children?: (row: Row) => React.ReactNode;
}) {
  if (data.length === 0) {
    return <p className="rounded border p-4 text-sm text-muted-foreground">Sem registros.</p>;
  }
  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-left">
              {columns.map(([key, title]) => (
                <th key={key} className="px-3 py-2 font-medium">
                  {title}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, index) => (
              <tr key={text(row.id) || index} className="border-b last:border-b-0">
                {columns.map(([key]) => (
                  <td key={key} className="px-3 py-2 align-top">
                    {render
                      ? render(row)
                      : key.includes("amount") || key === "unit_price"
                        ? money(row[key])
                        : str(row[key])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.map((row, index) => (
        <div key={`actions-${text(row.id) || index}`} className="flex flex-wrap gap-2">
          {children?.(row)}
        </div>
      ))}
    </div>
  );
}

function toActionItems(items: Row[]): ActionItem[] {
  return items.map((item) => ({
    id: text(item.id),
    label: `${str(item.sku_snapshot)} — pedido: ${numeric(item.approved_quantity)}, expedido: ${numeric(item.fulfilled_quantity)}`,
    pending: numeric(item.approved_quantity) - numeric(item.fulfilled_quantity),
  }));
}
