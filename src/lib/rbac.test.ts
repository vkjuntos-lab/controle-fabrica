import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  APP_ROLES,
  PERMISSIONS,
  PERMISSION_LABELS,
  PLATFORM_MODULES,
  ROLE_LABELS,
} from "@/lib/rbac";

describe("rbac", () => {
  it("define os papéis iniciais da plataforma", () => {
    expect(APP_ROLES).toEqual([
      "admin",
      "gestor",
      "financeiro",
      "estoque",
      "producao",
      "comercial",
      "marketplace",
      "fiscal",
    ]);
  });

  it("tem rótulo para todos os papéis", () => {
    for (const role of APP_ROLES) {
      expect(typeof ROLE_LABELS[role]).toBe("string");
      expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
    }
  });

  it("não declara módulo operacional como disponível antes de existir", () => {
    const disponiveis = [
      "dashboard",
      "administracao",
      "comercial",
      "produtos",
      "estoque",
      "parceiros",
      "financeiro",
      "compras",
      "planejamento",
      "vendas",
      "fiscal",
    ];
    const opcionais = PLATFORM_MODULES.filter((m) => !disponiveis.includes(m.key));
    for (const mod of opcionais) {
      expect(mod.status).toBe("coming_soon");
    }
  });

  it("mantém o módulo comercial disponível, com leitura no RBAC", () => {
    // O MASTER 012 entregou as telas de comercial; sem esta afirmação, trocar o
    // status para `coming_soon` esconderia o módulo já implementado.
    const comercial = PLATFORM_MODULES.find((m) => m.key === "comercial");
    expect(comercial?.status).toBe("available");
    expect(PERMISSIONS.crmRead).toBe("crm.read");
    expect(PERMISSIONS.crmConfigure).toBe("crm.configure");
  });

  it("mantém o módulo de vendas disponível, com leitura no RBAC", () => {
    // O MASTER 013 entregou as telas de vendas e logística; o status evita que o
    // módulo implemented seja escondido como "em breve".
    const vendas = PLATFORM_MODULES.find((m) => m.key === "vendas");
    expect(vendas?.status).toBe("available");
    expect(PERMISSIONS.salesOrdersRead).toBe("sales_orders.read");
    expect(PERMISSIONS.salesConfigure).toBe("sales.configure");
  });

  it("expõe a permissão de edição da matriz", () => {
    expect(PERMISSIONS.permissionsManage).toBe("permissions.manage");
  });

  it("reconhece as permissões do domínio de estoque", () => {
    expect(PERMISSIONS.inventoryRead).toBe("inventory.read");
    expect(PERMISSIONS.inventoryMovementsRead).toBe("inventory.movements.read");
    expect(PERMISSIONS.inventoryAdjust).toBe("inventory.adjust");
    expect(PERMISSIONS.inventoryTransfer).toBe("inventory.transfer");
    expect(PERMISSIONS.inventoryCount).toBe("inventory.count");
    expect(PERMISSIONS.inventoryOpeningBalance).toBe("inventory.opening_balance");
    expect(PERMISSIONS.inventoryReverse).toBe("inventory.reverse");
    expect(PERMISSIONS.inventoryManageLocations).toBe("inventory.manage_locations");
  });

  it("reconhece as permissões de reconciliação de parceiros", () => {
    expect(PERMISSIONS.partnerReconciliationRead).toBe("reconciliation.read");
    expect(PERMISSIONS.partnerReconciliationCreate).toBe("reconciliation.create");
    expect(PERMISSIONS.partnerReconciliationProcess).toBe("reconciliation.process");
    expect(PERMISSIONS.partnerReconciliationReview).toBe("reconciliation.review");
    expect(PERMISSIONS.partnerReconciliationResolveException).toBe(
      "reconciliation.resolve_exception",
    );
    expect(PERMISSIONS.partnerReconciliationClose).toBe("reconciliation.close");
    expect(PERMISSIONS.partnerReconciliationReopen).toBe("reconciliation.reopen");
    expect(PERMISSIONS.partnerReconciliationReverse).toBe("reconciliation.reverse");
  });

  it("reconhece as permissões de preço de parceiros", () => {
    expect(PERMISSIONS.partnerPricingRead).toBe("partner_pricing.read");
    expect(PERMISSIONS.partnerPricingManage).toBe("partner_pricing.manage");
  });

  it("reconhece as permissões do domínio de compras", () => {
    expect(PERMISSIONS.purchasingRead).toBe("purchasing.read");
    expect(PERMISSIONS.suppliersManage).toBe("suppliers.manage");
    expect(PERMISSIONS.purchaseRequestsApprove).toBe("purchase_requests.approve");
    expect(PERMISSIONS.quotationsAward).toBe("quotations.award");
    expect(PERMISSIONS.purchaseOrdersSend).toBe("purchase_orders.send");
    expect(PERMISSIONS.goodsReceiptsPost).toBe("goods_receipts.post");
    expect(PERMISSIONS.supplierReturnsCreate).toBe("supplier_returns.create");
    expect(PERMISSIONS.supplierDocumentsProcess).toBe("supplier_documents.process");
    expect(PERMISSIONS.purchaseExceptionsResolve).toBe("purchase_exceptions.resolve");
  });

  it("reconhece as permissões do domínio financeiro", () => {
    expect(PERMISSIONS.financeRead).toBe("finance.read");
    expect(PERMISSIONS.financeDashboard).toBe("finance.dashboard");
    expect(PERMISSIONS.receivablesRead).toBe("receivables.read");
    expect(PERMISSIONS.receivablesSettle).toBe("receivables.settle");
    expect(PERMISSIONS.receivablesReverse).toBe("receivables.reverse");
    expect(PERMISSIONS.payablesRead).toBe("payables.read");
    expect(PERMISSIONS.payablesSettle).toBe("payables.settle");
    expect(PERMISSIONS.financialAccountsManage).toBe("financial_accounts.manage");
    expect(PERMISSIONS.financialTransfersCreate).toBe("financial_transfers.create");
  });

  it("reconhece as permissões do domínio de planejamento", () => {
    expect(PERMISSIONS.planningRead).toBe("planning.read");
    expect(PERMISSIONS.planningRun).toBe("planning.run");
    expect(PERMISSIONS.planningSimulate).toBe("planning.simulate");
    expect(PERMISSIONS.planningAdjustForecast).toBe("planning.adjust_forecast");
    expect(PERMISSIONS.planningApproveSuggestion).toBe("planning.approve_suggestion");
    expect(PERMISSIONS.planningConvertPurchase).toBe("planning.convert_purchase");
    expect(PERMISSIONS.planningConvertProduction).toBe("planning.convert_production");
    expect(PERMISSIONS.planningExport).toBe("planning.export");
  });

  it("reconhece as permissões do domínio de vendas e logística", () => {
    expect(PERMISSIONS.salesOrdersRead).toBe("sales_orders.read");
    expect(PERMISSIONS.salesOrdersCreate).toBe("sales_orders.create");
    expect(PERMISSIONS.salesOrdersUpdate).toBe("sales_orders.update");
    expect(PERMISSIONS.salesOrdersApprove).toBe("sales_orders.approve");
    expect(PERMISSIONS.salesOrdersCancel).toBe("sales_orders.cancel");
    expect(PERMISSIONS.reservationsRead).toBe("reservations.read");
    expect(PERMISSIONS.reservationsCreate).toBe("reservations.create");
    expect(PERMISSIONS.reservationsRelease).toBe("reservations.release");
    expect(PERMISSIONS.fulfillmentRead).toBe("fulfillment.read");
    expect(PERMISSIONS.fulfillmentManage).toBe("fulfillment.manage");
    expect(PERMISSIONS.pickingExecute).toBe("picking.execute");
    expect(PERMISSIONS.pickingConfirm).toBe("picking.confirm");
    expect(PERMISSIONS.packingManage).toBe("packing.manage");
    expect(PERMISSIONS.shipmentsRead).toBe("shipments.read");
    expect(PERMISSIONS.shipmentsCreate).toBe("shipments.create");
    expect(PERMISSIONS.shipmentsDispatch).toBe("shipments.dispatch");
    expect(PERMISSIONS.shipmentsConfirmDelivery).toBe("shipments.confirm_delivery");
    expect(PERMISSIONS.returnsRead).toBe("returns.read");
    expect(PERMISSIONS.returnsCreate).toBe("returns.create");
    expect(PERMISSIONS.returnsApprove).toBe("returns.approve");
    expect(PERMISSIONS.returnsReceive).toBe("returns.receive");
    expect(PERMISSIONS.logisticsRead).toBe("logistics.read");
    expect(PERMISSIONS.logisticsExport).toBe("logistics.export");
    expect(PERMISSIONS.logisticsExceptions).toBe("logistics.exceptions");
    expect(PERMISSIONS.salesConfigure).toBe("sales.configure");
    expect(PERMISSIONS.carriersManage).toBe("carriers.manage");
    expect(PERMISSIONS.salesCreditRead).toBe("sales_credit.read");
    expect(PERMISSIONS.salesDashboard).toBe("sales.dashboard");
  });

  it("declara rótulo para todas as chaves reconhecidas", () => {
    for (const key of Object.values(PERMISSIONS)) {
      expect(typeof PERMISSION_LABELS[key]).toBe("string");
      expect(PERMISSION_LABELS[key].length).toBeGreaterThan(0);
    }
  });
});

it("alinha as permissões de reconciliação ao contrato do banco", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20260926100000_partner_reconciliation.sql", import.meta.url),
    "utf8",
  );
  const databaseKeys = new Set(
    [...migration.matchAll(/'((?:reconciliation|marketplace)\.[a-z_]+)'/g)].map(
      (match) => match[1],
    ),
  );
  const keys = Object.entries(PERMISSIONS).filter(
    ([key]) => key.startsWith("partnerReconciliation") || key.startsWith("marketplace"),
  );
  expect(keys.length).toBeGreaterThan(0);
  for (const [, value] of keys) expect(databaseKeys.has(value), value).toBe(true);
});

it("alinha as permissões de planejamento ao contrato do banco", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20261002100000_planning.sql", import.meta.url),
    "utf8",
  );
  const databaseKeys = new Set(
    [...migration.matchAll(/'(planning\.[a-z_]+)'/g)].map((match) => match[1]),
  );
  const keys = Object.entries(PERMISSIONS).filter(([key]) => key.startsWith("planning"));
  expect(keys.length).toBeGreaterThan(0);
  for (const [, value] of keys) expect(databaseKeys.has(value), value).toBe(true);
});

it("alinha as permissões de compras ao contrato do banco", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20261001100000_purchasing.sql", import.meta.url),
    "utf8",
  );
  const databaseKeys = new Set(
    [
      ...migration.matchAll(
        /'(?:suppliers|purchase_requests|quotations|purchase_orders|goods_receipts|supplier_returns|supplier_documents|purchase_exceptions)\.[a-z_]+'/g,
      ),
      ...migration.matchAll(/'(purchasing\.(?:read|dashboard))'/g),
    ].map((match) => match[0].replace(/'/g, "")),
  );
  const keys = Object.entries(PERMISSIONS).filter(
    ([key]) =>
      key.startsWith("suppliers") ||
      key.startsWith("purchaseRequests") ||
      key.startsWith("quotations") ||
      key.startsWith("purchaseOrders") ||
      key.startsWith("goodsReceipts") ||
      key.startsWith("supplierReturns") ||
      key.startsWith("supplierDocuments") ||
      key.startsWith("purchaseExceptions") ||
      key.startsWith("purchasing"),
  );
  expect(keys.length).toBeGreaterThan(0);
  for (const [, value] of keys) expect(databaseKeys.has(value), value).toBe(true);
});

it("alinha as permissões de vendas ao contrato do banco", () => {
  // As vendas foram criadas ao longo de três migrations; a permissão precisa
  // existir no banco, senão o botão aparece e a operação é recusada.
  const migrations = [
    "../../supabase/migrations/20261006100000_sales_orders.sql",
    "../../supabase/migrations/20261010100000_sales_integrity.sql",
    "../../supabase/migrations/20261011100000_sales_planning.sql",
  ].map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
  const databaseKeys = new Set(
    migrations.flatMap((sql) =>
      [
        ...sql.matchAll(
          /'(?:sales_orders|reservations|fulfillment|picking|packing|shipments|returns|logistics|carriers|sales_credit)\.[a-z_]+'/g,
        ),
        ...sql.matchAll(/'(sales\.(?:configure|dashboard))'/g),
      ].map((match) => match[0].replace(/'/g, "")),
    ),
  );
  const keys = Object.entries(PERMISSIONS).filter(
    ([key]) =>
      key.startsWith("sales") ||
      key.startsWith("reservations") ||
      key.startsWith("fulfillment") ||
      key.startsWith("picking") ||
      key.startsWith("packing") ||
      key.startsWith("shipments") ||
      key.startsWith("returns") ||
      key.startsWith("logistics") ||
      key.startsWith("carriers"),
  );
  expect(keys.length).toBeGreaterThan(0);
  for (const [, value] of keys) expect(databaseKeys.has(value), value).toBe(true);
});
