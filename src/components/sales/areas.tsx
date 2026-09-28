import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, ErrorState, LoadingState } from "@/components/states";
import { PERMISSIONS } from "@/lib/rbac";
import {
  carrierModalityLabel,
  exceptionSeverityLabel,
  exceptionStatusLabel,
  orderStatusLabel,
  reservationStatusLabel,
  returnStatusLabel,
  shipmentStatusLabel,
  stockStatusLabel,
  fulfillmentStatusLabel,
  CARRIER_MODALITY,
} from "@/lib/sales/constants";
import { SalesAction } from "@/components/sales/action";
import { NewOrder } from "@/components/sales/new-order";
import {
  isMoneyColumn,
  numeric,
  object,
  rows,
  text,
  useSalesList,
  useSalesRead,
  type Row,
} from "@/components/sales/shared";
import { money, str } from "@/components/crm/shared";
import type { Json } from "@/integrations/supabase/types";

/**
 * Listagens do módulo de vendas.
 *
 * Cada área declara suas colunas e o rótulo de cada status; o servidor decide o
 * que a pessoa pode ver. Filtros enviados são apenas os que `sales_query`
 * entende — a tela não promete filtro que o backend não aplica.
 */
export type Area = {
  key: string;
  title: string;
  kind: string;
  permission: string;
  columns: string[];
  description: string;
};

export const AREAS: Area[] = [
  {
    key: "orders",
    title: "Pedidos",
    kind: "orders",
    permission: PERMISSIONS.salesOrdersRead,
    columns: [
      "order_number",
      "company_name",
      "order_date",
      "status",
      "stock_status",
      "fulfillment_status",
      "total_amount",
    ],
    description: "Pedido comercial não é venda recebida: o valor aqui não é faturamento.",
  },
  {
    key: "reservations",
    title: "Reservas",
    kind: "reservations",
    permission: PERMISSIONS.reservationsRead,
    columns: ["order_number", "sku_snapshot", "location_name", "quantity", "status"],
    description:
      "Reserva não movimenta estoque: torna a mercadoria indisponível para os demais pedidos.",
  },
  {
    key: "fulfillment",
    title: "Separação e embalagem",
    kind: "fulfillment",
    permission: PERMISSIONS.fulfillmentRead,
    columns: ["fulfillment_number", "order_number", "source_location_name", "status"],
    description: "Separa, confere e embala. Conferir não baixa estoque; expedir baixa.",
  },
  {
    key: "shipments",
    title: "Expedições",
    kind: "shipments",
    permission: PERMISSIONS.shipmentsRead,
    columns: ["shipment_number", "order_number", "status", "tracking_code", "delivered_quantity"],
    description: "A expedição é a única etapa do ciclo que dá baixa oficial no estoque.",
  },
  {
    key: "returns",
    title: "Devoluções",
    kind: "returns",
    permission: PERMISSIONS.returnsRead,
    columns: ["return_number", "order_number", "status", "reason"],
    description:
      "Receber devolução devolve mercadoria ao estoque; o estorno financeiro fica pedido.",
  },
  {
    key: "exceptions",
    title: "Ocorrências",
    kind: "exceptions",
    permission: PERMISSIONS.logisticsRead,
    columns: ["order_number", "message", "severity", "status"],
    description: "Divergência de separação, atraso e problema de entrega ficam registrados aqui.",
  },
  {
    key: "carriers",
    title: "Transportadoras",
    kind: "carriers",
    permission: PERMISSIONS.shipmentsRead,
    columns: ["name", "modality", "status"],
    description: "Cadastro usado nas expedições. Não há integração com transportadora externa.",
  },
];

/** Rótulo do código de `status` depende da área; as demais colunas são fixas. */
const AREA_STATUS_LABELS: Record<string, (value: unknown) => string> = {
  orders: orderStatusLabel,
  reservations: reservationStatusLabel,
  fulfillment: fulfillmentStatusLabel,
  shipments: shipmentStatusLabel,
  returns: returnStatusLabel,
  exceptions: exceptionStatusLabel,
  carriers: (value) =>
    text(value) === "ACTIVE" ? "Ativa" : text(value) === "INACTIVE" ? "Inativa" : "—",
};

const COLUMN_LABELS: Record<string, string> = {
  order_number: "Pedido",
  shipment_number: "Expedição",
  return_number: "Devolução",
  fulfillment_number: "Atendimento",
  company_name: "Cliente",
  order_date: "Data do pedido",
  status: "Status",
  stock_status: "Estoque",
  fulfillment_status: "Atendimento",
  total_amount: "Valor do pedido",
  sku_snapshot: "SKU",
  location_name: "Local",
  source_location_name: "Origem",
  quantity: "Quantidade",
  delivered_quantity: "Entregue",
  tracking_code: "Rastreio",
  message: "Ocorrência",
  severity: "Gravidade",
  name: "Nome",
  modality: "Modalidade",
  reason: "Motivo",
  credit_limit: "Limite de crédito",
  open_amount: "Valor em aberto",
  credit_available: "Crédito disponível",
  overdue_amount: "Valor vencido",
};

/** Cartão de uma linha de listagem, no formato usado pelas demais áreas. */
export function RecordCards({
  data,
  columns,
  area,
  children,
}: {
  data: Row[];
  columns: string[];
  area: string;
  children?: (row: Row) => ReactNode;
}) {
  if (data.length === 0) {
    return (
      <EmptyState
        title="Nenhum registro"
        description="Ajuste os filtros ou registre o primeiro documento desta área."
      />
    );
  }
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {data.map((row, index) => (
        <Card key={text(row.id) || index}>
          <CardContent className="space-y-3 pt-6">
            <dl className="grid grid-cols-2 gap-2">
              {columns.map((column) => (
                <div key={column}>
                  <dt className="text-xs text-muted-foreground">
                    {COLUMN_LABELS[column] ?? column}
                  </dt>
                  <dd className="break-words text-sm">
                    <Cell column={column} value={row[column]} area={area} />
                  </dd>
                </div>
              ))}
            </dl>
            {children?.(row)}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/**
 * Renderiza uma célula: dinheiro, rótulo de código ou texto simples.
 *
 * A tradução de cada código de status fica em `constants.ts`; aqui só se decide
 * o formato. Nenhum valor é exibido como código solto para o usuário final.
 */
function Cell({ column, value, area }: { column: string; value: unknown; area: string }) {
  const plain = (label: string) =>
    label === "—" ? <span className="text-muted-foreground">—</span> : <span>{label}</span>;

  if (column === "status") {
    const label = (AREA_STATUS_LABELS[area] ?? ((v: unknown) => text(v) || "—"))(value);
    return label === "—" ? (
      <span className="text-muted-foreground">—</span>
    ) : (
      <Badge variant="outline" className="font-normal">
        {label}
      </Badge>
    );
  }
  if (column === "severity") return plain(exceptionSeverityLabel(value));
  if (column === "modality") return plain(carrierModalityLabel(value));
  if (column === "stock_status") return plain(stockStatusLabel(value));
  if (column === "fulfillment_status") return plain(fulfillmentStatusLabel(value));
  if (isMoneyColumn(column)) return <span>{money(value)}</span>;
  return <span>{str(value)}</span>;
}

const PAGE_SIZE = 30;

export function SalesArea({ organizationId, area }: { organizationId: string; area: Area }) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const list = useSalesList(organizationId, area.kind, {
    search,
    status,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  if (list.query.isPending)
    return <LoadingState label={`Carregando ${area.title.toLowerCase()}`} />;
  if (list.query.error) {
    return (
      <ErrorState
        description={list.query.error.message}
        onRetry={() => void list.query.refetch()}
      />
    );
  }

  const total = list.total;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasSearch = area.kind === "orders" || area.kind === "exceptions";

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">{area.title}</h1>
        <p className="text-sm text-muted-foreground">{area.description}</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {area.key === "orders" ? <NewOrder organizationId={organizationId} /> : null}
        {area.key === "reservations" ? (
          <SalesAction
            organizationId={organizationId}
            label="Processar reservas vencidas"
            permission={PERMISSIONS.reservationsRelease}
            operation="expire"
            description="Expirar devolve a disponibilidade. Nenhum saldo físico é mexido."
          />
        ) : null}
        {area.key === "carriers" ? (
          <SalesAction
            organizationId={organizationId}
            label="Nova transportadora"
            permission={PERMISSIONS.carriersManage}
            operation="carrier"
            fields={[
              { key: "name", label: "Nome", required: true },
              {
                key: "document_type",
                label: "Documento",
                options: ["CNPJ", "CPF", "OTHER"],
                optionLabels: { CNPJ: "CNPJ", CPF: "CPF", OTHER: "Outro" },
              },
              { key: "document_number", label: "Número do documento" },
              { key: "contact_name", label: "Pessoa de contato" },
              { key: "contact_phone", label: "Telefone" },
              {
                key: "modality",
                label: "Modalidade",
                options: Object.keys(CARRIER_MODALITY),
                optionLabels: CARRIER_MODALITY,
                hint: "Em branco, a transportadora é registrada como courier.",
              },
            ]}
          />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {hasSearch ? (
          <Input
            className="max-w-xs"
            aria-label={area.key === "orders" ? "Buscar pedido" : "Buscar ocorrência"}
            placeholder={area.key === "orders" ? "Número ou observação" : "Mensagem"}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        ) : null}
        <Input
          className="max-w-[14rem]"
          aria-label="Filtrar por status"
          placeholder="Status (ex.: DRAFT)"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value.toUpperCase());
            setPage(0);
          }}
        />
      </div>
      <RecordCards data={list.rows} columns={area.columns} area={area.key}>
        {(row) => (
          <div className="flex flex-wrap gap-2">
            {row.sales_order_id || area.key === "orders" ? (
              <Link
                className="text-sm text-primary underline"
                to="/vendas/pedidos/$id"
                params={{ id: text(area.key === "orders" ? row.id : row.sales_order_id) }}
              >
                Abrir pedido
              </Link>
            ) : null}
            {area.key === "reservations" &&
            (text(row.status) === "ACTIVE" || text(row.status) === "PARTIALLY_CONSUMED") ? (
              <SalesAction
                organizationId={organizationId}
                label="Liberar reserva"
                permission={PERMISSIONS.reservationsRelease}
                operation="reservation"
                action="release"
                id={text(row.id)}
                fields={[{ key: "reason", label: "Motivo", required: true }]}
                description="Liberar devolve a disponibilidade para os demais pedidos."
              />
            ) : null}
            {area.key === "exceptions" && text(row.status) === "OPEN" ? (
              <SalesAction
                organizationId={organizationId}
                label="Resolver ocorrência"
                permission={PERMISSIONS.logisticsExceptions}
                operation="exception"
                action="resolve"
                id={text(row.id)}
                fields={[
                  { key: "resolution", label: "Resolução", type: "textarea", required: true },
                ]}
              />
            ) : null}
            {area.key === "carriers" ? (
              <CarrierEditor organizationId={organizationId} carrier={row} />
            ) : null}
          </div>
        )}
      </RecordCards>
      {pages > 1 ? (
        <div className="flex items-center gap-3">
          <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page + 1} de {pages} · {total} registros
          </span>
          <Button
            variant="outline"
            disabled={(page + 1) * PAGE_SIZE >= total}
            onClick={() => setPage((p) => p + 1)}
          >
            Próxima
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function CarrierEditor({ organizationId, carrier }: { organizationId: string; carrier: Row }) {
  return (
    <SalesAction
      organizationId={organizationId}
      label="Editar"
      permission={PERMISSIONS.carriersManage}
      operation="carrier"
      id={text(carrier.id)}
      initial={carrier}
      fields={[
        { key: "name", label: "Nome", required: true },
        {
          key: "document_type",
          label: "Documento",
          options: ["CNPJ", "CPF", "OTHER"],
          optionLabels: { CNPJ: "CNPJ", CPF: "CPF", OTHER: "Outro" },
        },
        { key: "document_number", label: "Número do documento" },
        { key: "contact_name", label: "Pessoa de contato" },
        { key: "contact_phone", label: "Telefone" },
        {
          key: "modality",
          label: "Modalidade",
          options: Object.keys(CARRIER_MODALITY),
          optionLabels: CARRIER_MODALITY,
        },
        {
          key: "status",
          label: "Situação",
          options: ["ACTIVE", "INACTIVE"],
          optionLabels: { ACTIVE: "Ativa", INACTIVE: "Inativa" },
        },
      ]}
    />
  );
}

/** Indicadores do período. Valores de pedido não são recebimento. */
export function SalesDashboard({ organizationId }: { organizationId: string }) {
  const query = useSalesRead(organizationId, "dashboard");
  if (query.isPending) return <LoadingState label="Carregando indicadores" />;
  if (query.error) {
    return <ErrorState description={query.error.message} onRetry={() => void query.refetch()} />;
  }
  const data = (query.data ?? {}) as Record<string, Json>;
  const indicators: [string, string, boolean?][] = [
    ["orders_total", "Pedidos no período"],
    ["amount_total", "Valor dos pedidos", true],
    ["awaiting_approval", "Aguardando aprovação"],
    ["awaiting_stock", "Aguardando estoque"],
    ["shipments_in_transit", "Expedições em trânsito"],
    ["shipments_overdue", "Entregas atrasadas"],
    ["returns_pending", "Devoluções pendentes"],
    ["open_exceptions", "Ocorrências abertas"],
  ];
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Indicadores de vendas</h1>
        <p className="text-sm text-muted-foreground">
          Período de {text(data.from) || "—"} a {text(data.to) || "—"}. Valor de pedido não é
          faturamento nem recebimento.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {indicators.map(([key, title, isMoney]) => (
          <Card key={key}>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="text-2xl font-semibold">
                {isMoney ? money(data[key]) : numeric(data[key])}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

/** Área de crédito do cliente, lida do CRM com permissão própria. */
export function SalesCredits({ organizationId }: { organizationId: string }) {
  const list = useSalesList(organizationId, "credits", { limit: PAGE_SIZE });
  if (list.query.isPending) return <LoadingState label="Carregando crédito" />;
  if (list.query.error) {
    return (
      <ErrorState
        description={list.query.error.message}
        onRetry={() => void list.query.refetch()}
      />
    );
  }
  // `sales_query` no modo `credits` devolve `company_id`, `company_name` e
  // `position`. Os números de crédito ficam dentro de `position`, com os nomes
  // que `crm_financial_position` devolve. Achatar aqui é só renomear/achatar o
  // que o servidor já calculou: nenhum valor é derivado nesta tela.
  const rows = list.rows.map((row) => ({ ...row, ...object(row.position) }));
  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-xl font-semibold">Crédito do cliente</h1>
        <p className="text-sm text-muted-foreground">
          Limite, valor em aberto e vencidos. O servidor reavalia o crédito no momento da aprovação
          e é ele quem bloqueia; a tela só mostra a posição avaliada, sem antecipar decisão.
        </p>
      </header>
      <RecordCards
        data={rows}
        columns={[
          "company_name",
          "credit_limit",
          "open_amount",
          "credit_available",
          "overdue_amount",
        ]}
        area="credits"
      >
        {(row) =>
          row.block_over_limit || row.block_overdue ? (
            <p className="text-xs text-muted-foreground">
              {[
                row.block_over_limit ? "bloqueia acima do limite" : null,
                row.block_overdue ? "bloqueia com valor vencido" : null,
              ]
                .filter(Boolean)
                .join(" e ")}{" "}
              — regra da política de crédito, aplicada pelo servidor na aprovação.
            </p>
          ) : null
        }
      </RecordCards>
    </section>
  );
}
