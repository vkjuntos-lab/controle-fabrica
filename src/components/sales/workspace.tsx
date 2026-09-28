import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/lib/org/org-context";
import { PERMISSIONS } from "@/lib/rbac";
import { SalesAction } from "@/components/sales/action";
import { RecordCards, SalesArea, SalesCredits, SalesDashboard, AREAS, type Area } from "@/components/sales/areas";
import { OrderDetail } from "@/components/sales/order-detail";
import { SalesSettings } from "@/components/sales/settings";
import { NewOrder } from "@/components/sales/new-order";
import { numeric, rows, text, useSalesList } from "@/components/sales/shared";
import { EmptyState } from "@/components/states";

/**
 * Casca e navegação do módulo de vendas.
 *
 * Este arquivo só compõe: cada área vive no seu próprio módulo e nenhuma regra de
 * negócio mora aqui. As quatro exportações públicas (`SalesPage`,
 * `SalesOrderPage`, `QuoteToOrder`, `CustomerOrders`) mantêm a assinatura usada
 * pelas rotas e pelas telas do CRM.
 */

type Section = {
  key: string;
  label: string;
  permission: string;
};

const SECTIONS: Section[] = [
  { key: "orders", label: "Pedidos", permission: PERMISSIONS.salesOrdersRead },
  { key: "dashboard", label: "Dashboard", permission: PERMISSIONS.salesDashboard },
  { key: "reservations", label: "Reservas", permission: PERMISSIONS.reservationsRead },
  { key: "fulfillment", label: "Separação", permission: PERMISSIONS.fulfillmentRead },
  { key: "shipments", label: "Expedições", permission: PERMISSIONS.shipmentsRead },
  { key: "returns", label: "Devoluções", permission: PERMISSIONS.returnsRead },
  { key: "exceptions", label: "Ocorrências", permission: PERMISSIONS.logisticsRead },
  { key: "carriers", label: "Transportadoras", permission: PERMISSIONS.carriersManage },
  { key: "credits", label: "Crédito", permission: PERMISSIONS.salesCreditRead },
  { key: "settings", label: "Configurações", permission: PERMISSIONS.salesConfigure },
];

const AREA_BY_KEY: Record<string, Area> = Object.fromEntries(
  AREAS.map((area) => [area.key, area]),
);

function Frame({ children }: { children: ReactNode }) {
  const { hasPermission } = useOrganization();
  return (
    <AppShell title="Vendas e logística">
      <div className="space-y-5">
        <nav className="flex flex-wrap gap-2" aria-label="Vendas">
          {SECTIONS.filter((section) => hasPermission(section.permission)).map((section) => (
            <Link
              className="rounded border px-3 py-2 text-sm"
              key={section.key}
              to="/vendas"
              search={{ view: section.key }}
            >
              {section.label}
            </Link>
          ))}
        </nav>
        {children}
      </div>
    </AppShell>
  );
}

export function SalesPage({ view = "orders" }: { view?: string }) {
  const { currentOrganization, hasPermission } = useOrganization();
  const org = currentOrganization?.organization_id;
  if (!org) return <Frame><p>Selecione uma organização.</p></Frame>;
  const section = SECTIONS.find((item) => item.key === view) ?? SECTIONS[0];
  if (!hasPermission(section.permission)) {
    return (
      <Frame>
        <p role="alert">Acesso não permitido.</p>
      </Frame>
    );
  }

  let content: ReactNode;
  if (section.key === "dashboard") {
    content = <SalesDashboard organizationId={org} />;
  } else if (section.key === "settings") {
    content = <SalesSettings organizationId={org} />;
  } else if (section.key === "credits") {
    content = <SalesCredits organizationId={org} />;
  } else {
    const area = AREA_BY_KEY[section.key];
    content = area ? (
      <SalesArea key={`${org}:${area.key}`} organizationId={org} area={area} />
    ) : (
      <EmptyState title="Área desconhecida" description="Selecione uma área válida." />
    );
  }

  return <Frame>{content}</Frame>;
}

export function SalesOrderPage({ id }: { id: string }) {
  const { currentOrganization, hasPermission } = useOrganization();
  const org = currentOrganization?.organization_id;
  if (!org) return <Frame><p>Selecione uma organização.</p></Frame>;
  if (!hasPermission(PERMISSIONS.salesOrdersRead)) {
    return (
      <Frame>
        <p role="alert">Acesso não permitido.</p>
      </Frame>
    );
  }
  return (
    <Frame>
      <OrderDetail key={`${org}:${id}`} organizationId={org} orderId={id} />
    </Frame>
  );
}

/** Conversão de uma proposta aceita em pedido, chamada a partir do CRM. */
export function QuoteToOrder({ org, quoteId }: { org: string; quoteId: string }) {
  return (
    <SalesAction
      organizationId={org}
      label="Criar pedido desta versão"
      permission={PERMISSIONS.salesOrdersCreate}
      operation="convert"
      id={quoteId}
      description="O pedido nasce em rascunho com o preço aceito na proposta. A aprovação é um passo seguinte."
    />
  );
}

/** Pedidos de uma empresa, exibidos na aba de vendas do cliente no CRM. */
export function CustomerOrders({ org, companyId }: { org: string; companyId: string }) {
  const [page, setPage] = useState(0);
  const list = useSalesList(org, "orders", {
    company_id: companyId,
    limit: 20,
    offset: page * 20,
  });

  if (list.query.isPending) return <p>Carregando pedidos…</p>;
  if (list.query.error) {
    return (
      <div role="alert" className="space-y-2">
        <p>{list.query.error.message}</p>
        <Button onClick={() => void list.query.refetch()}>Tentar novamente</Button>
      </div>
    );
  }

  const total = numeric(list.total);
  return (
    <div className="space-y-3">
      <RecordCards
        data={list.rows}
        columns={["order_number", "order_date", "status", "total_amount"]}
        area="orders"
      >
        {(row) => (
          <Link
            to="/vendas/pedidos/$id"
            params={{ id: text(row.id) }}
            className="text-primary underline"
          >
            Abrir pedido
          </Link>
        )}
      </RecordCards>
      <div className="flex items-center gap-3">
        <Button disabled={page === 0} onClick={() => setPage((current) => current - 1)}>
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          Página {page + 1} · {total} registros
        </span>
        <Button
          disabled={(page + 1) * 20 >= total}
          onClick={() => setPage((current) => current + 1)}
        >
          Próxima
        </Button>
      </div>
    </div>
  );
}

export { NewOrder, object, rows };
