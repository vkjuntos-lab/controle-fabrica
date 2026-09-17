import { describe, expect, it } from "vitest";

import { APP_ROLES, PERMISSIONS, PLATFORM_MODULES, ROLE_LABELS } from "@/lib/rbac";

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
    const disponiveis = ["dashboard", "administracao", "produtos"];
    const opcionais = PLATFORM_MODULES.filter((m) => !disponiveis.includes(m.key));
    for (const mod of opcionais) {
      expect(mod.status).toBe("coming_soon");
    }
  });

  it("expõe a permissão de edição da matriz", () => {
    expect(PERMISSIONS.permissionsManage).toBe("permissions.manage");
  });
});
