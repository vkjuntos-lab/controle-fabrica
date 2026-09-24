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
      "produtos",
      "estoque",
      "parceiros",
      "financeiro",
      "compras",
    ];
    const opcionais = PLATFORM_MODULES.filter((m) => !disponiveis.includes(m.key));
    for (const mod of opcionais) {
      expect(mod.status).toBe("coming_soon");
    }
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

it("alinha as permissões de compras ao contrato do banco", () => {
  const migration = readFileSync(
    new URL("../../supabase/migrations/20261001100000_purchasing.sql", import.meta.url),
    "utf8",
  );
  const databaseKeys = new Set(
    [
      ...migration.matchAll(/'(?:suppliers|purchase_requests|quotations|purchase_orders|goods_receipts|supplier_returns|supplier_documents|purchase_exceptions)\.[a-z_]+'/g),
      ...migration.matchAll(/'(purchasing\.(?:read|dashboard))'/g),
    ].map((match) => match[1]),
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
