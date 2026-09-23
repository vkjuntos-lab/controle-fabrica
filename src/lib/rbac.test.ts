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
    const disponiveis = ["dashboard", "administracao", "produtos", "estoque", "parceiros"];
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
    expect(PERMISSIONS.partnerReconciliationRead).toBe("partner_reconciliation.read");
    expect(PERMISSIONS.partnerReconciliationCreate).toBe("partner_reconciliation.create");
    expect(PERMISSIONS.partnerReconciliationProcess).toBe("partner_reconciliation.process");
    expect(PERMISSIONS.partnerReconciliationReview).toBe("partner_reconciliation.review");
    expect(PERMISSIONS.partnerReconciliationResolveException).toBe(
      "partner_reconciliation.resolve_exception",
    );
    expect(PERMISSIONS.partnerReconciliationClose).toBe("partner_reconciliation.close");
    expect(PERMISSIONS.partnerReconciliationReopen).toBe("partner_reconciliation.reopen");
    expect(PERMISSIONS.partnerReconciliationReverse).toBe("partner_reconciliation.reverse");
  });

  it("reconhece as permissões de preço de parceiros", () => {
    expect(PERMISSIONS.partnerPricingRead).toBe("partner_pricing.read");
    expect(PERMISSIONS.partnerPricingManage).toBe("partner_pricing.manage");
  });

  it("declara rótulo para todas as chaves reconhecidas", () => {
    for (const key of Object.values(PERMISSIONS)) {
      expect(typeof PERMISSION_LABELS[key]).toBe("string");
      expect(PERMISSION_LABELS[key].length).toBeGreaterThan(0);
    }
  });
});
