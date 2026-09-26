import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { sanitizeFilters } from "@/lib/crm/export";
import {
  ACTIVITY_TYPE,
  COMMERCIAL_STATUS,
  COMMISSION_RATE_TYPE,
  COMMISSION_TRIGGER,
  CRM_FILTER_KEYS,
  CRM_LIST_KINDS,
  LEAD_STATUS,
  OPPORTUNITY_STATUS,
  QUOTE_FLOW,
  QUOTE_STATUS,
  REASON_KIND,
  REPRESENTATIVE_TYPE,
} from "@/lib/crm/constants";
import { areaOrder, areas, configurationOrder, configurations } from "@/components/crm/config";
import { optionLabels } from "@/components/crm/shared";
import { PERMISSIONS } from "@/lib/rbac";

const migration = readFileSync(
  resolve(import.meta.dirname, "../../../supabase/migrations/20261005100000_crm.sql"),
  "utf8",
);

/** Kinds que o `crm_query` resolve por ramo próprio, antes do `CASE` genérico. */
const detailKinds = ["members", "finance", "margin", "stock", "commission", "dashboard"];

/** Mapa `kind` → permissão lido do `CASE` de `crm_query` na migration. */
function queryPermissions(): Record<string, string> {
  const block = migration.slice(
    migration.indexOf("CASE _kind\n WHEN 'customers'"),
    migration.indexOf("PERFORM public.crm_require(_org,perm);", migration.indexOf("CASE _kind\n WHEN 'customers'")),
  );
  const found: Record<string, string> = {};
  for (const match of block.matchAll(/WHEN '([a-z_]+)' THEN tab:='([a-z_]+)';perm:='([a-z_.]+)'/g)) {
    found[match[1]] = match[3];
  }
  return found;
}

/** Kinds que o `crm_save` aceita, lidos do `CASE` de `crm_save`. */
function saveKinds(): string[] {
  const start = migration.indexOf("CREATE FUNCTION public.crm_save");
  const end = migration.indexOf("CREATE FUNCTION public.crm_action");
  return [
    ...new Set(
      [...migration.slice(start, end).matchAll(/WHEN '([a-z_]+)' THEN/g)].map((m) => m[1]),
    ),
  ];
}

const permissions = queryPermissions();
const declaredAreas = [...areaOrder.map((key) => areas[key]), ...configurationOrder.map((key) => configurations[key])];

describe("filtros do CRM", () => {
  it("mantém apenas chaves que o servidor aplica", () => {
    expect(sanitizeFilters({ status: "NEW", company_id: "x", sort: "name", role: "admin" })).toEqual({
      status: "NEW",
      company_id: "x",
    });
  });

  it("descarta valor vazio, que no servidor casaria com a string vazia", () => {
    expect(sanitizeFilters({ status: "", q: "acme" })).toEqual({ q: "acme" });
  });

  it("cobre a lista branca declarada nas constantes", () => {
    // O `crm_query` só filtra por estas chaves; qualquer filtro de tela fora
    // delas seria aplicado só no cliente e mentiria sobre o recorte.
    for (const key of CRM_FILTER_KEYS) {
      expect(sanitizeFilters({ [key]: "valor" })).toHaveProperty(key);
    }
  });
});

describe("kinds do CRM", () => {
  it("todo kind tabular declarado existe no crm_query do servidor", () => {
    for (const kind of CRM_LIST_KINDS) {
      expect(permissions, `kind ${kind} ausente no CASE de crm_query`).toHaveProperty(kind);
    }
  });

  it("todo kind usado por área e configuração existe no servidor", () => {
    const known = new Set([...CRM_LIST_KINDS, ...detailKinds]);
    for (const area of declaredAreas) {
      expect(known, `kind ${area.query} da área ${area.title}`).toContain(area.query);
    }
  });

  it("todo kind gravado por área existe no crm_save", () => {
    const saves = saveKinds();
    for (const area of declaredAreas) {
      for (const step of area.saves ?? [{ kind: area.save }]) {
        if (!step?.kind) continue;
        expect(saves, `kind ${step.kind} da área ${area.title}`).toContain(step.kind);
      }
    }
  });

  it("todo lookup de campo e de filtro existe no servidor", () => {
    const known = new Set([...CRM_LIST_KINDS, ...detailKinds]);
    for (const area of declaredAreas) {
      for (const field of area.fields) {
        if (field.lookup) expect(known, `lookup ${field.lookup}`).toContain(field.lookup);
      }
      for (const filter of area.filters ?? []) {
        if (filter.kind) expect(known, `filtro ${filter.kind}`).toContain(filter.kind);
        expect(CRM_FILTER_KEYS, `chave de filtro ${filter.key}`).toContain(filter.key);
      }
    }
  });

  it("toda coluna com nome resolvido aponta para um kind existente", () => {
    const known = new Set([...CRM_LIST_KINDS, ...detailKinds]);
    for (const area of declaredAreas) {
      for (const kind of Object.values(area.refColumns ?? {})) {
        expect(known, `refColumn ${kind}`).toContain(kind);
      }
    }
  });
});

describe("permissões do CRM", () => {
  it("toda permissão usada por área existe no RBAC", () => {
    const declared = new Set<string>(Object.values(PERMISSIONS));
    for (const area of declaredAreas) {
      expect(declared, `leitura de ${area.title}`).toContain(area.permission);
      if (area.write) expect(declared, `escrita de ${area.title}`).toContain(area.write);
    }
  });

  it("a permissão exigida pelo servidor bate com a declarada pela área", () => {
    // A tela esconderia o botão, mas o servidor recusaria — ou o inverso — se as
    // duas listas divergissem. A área tem de declarar a mesma chave do SQL.
    for (const area of declaredAreas) {
      const server = permissions[area.query];
      if (!server) continue;
      expect(area.permission, `permissão de leitura de ${area.title}`).toBe(server);
    }
  });

  it("toda permissão de gravação de lead existe como chave no RBAC", () => {
    expect(PERMISSIONS.leadsCreate).toBe("leads.create");
    expect(PERMISSIONS.leadsConvert).toBe("leads.convert");
  });
});

describe("rótulos das opções fixas", () => {
  const labelSets: [string, Record<string, string>][] = [
    ["status", optionLabels.status],
    ["activity_type", ACTIVITY_TYPE],
    ["representative_type", REPRESENTATIVE_TYPE],
    ["kind", REASON_KIND],
    ["trigger_event", COMMISSION_TRIGGER],
    ["rate_type", COMMISSION_RATE_TYPE],
    ["commercial_status", COMMERCIAL_STATUS],
  ];

  it("todo valor de option tem rótulo em português", () => {
    for (const area of declaredAreas) {
      for (const field of area.fields) {
        if (field.type !== "options") continue;
        const labels = labelSets.find(([key]) => key === field.key)?.[1];
        for (const value of field.options ?? []) {
          expect(labels?.[value], `${field.key}=${value} (${area.title})`).toBeTruthy();
          expect(labels?.[value]).not.toBe(value);
        }
      }
    }
  });

  it("todo status gravável pelo servidor tem rótulo", () => {
    const known: Record<string, string> = {
      ...LEAD_STATUS,
      ...OPPORTUNITY_STATUS,
      ...QUOTE_STATUS,
    };
    for (const [value, label] of Object.entries(known)) {
      expect(optionLabels.status[value], `status ${value}`).toBe(label);
    }
  });
});

describe("fluxo de estados da proposta", () => {
  it("cobre todos os status declarados", () => {
    for (const status of Object.keys(QUOTE_STATUS)) {
      expect(QUOTE_FLOW[status], `fluxo de ${status}`).toBeDefined();
    }
  });

  it("só avança a partir de rascunho para aprovação, e nunca volta", () => {
    expect(QUOTE_FLOW.DRAFT).toEqual(["PENDING_APPROVAL"]);
    expect(QUOTE_FLOW.PENDING_APPROVAL).toEqual(["APPROVED"]);
    expect(QUOTE_FLOW.APPROVED).toEqual(["SENT"]);
    // Aceita é terminal: o servidor não reabre uma proposta com aceite.
    expect(QUOTE_FLOW.ACCEPTED ?? []).toEqual([]);
  });

  it("a aceitação é sempre a última etapa de uma proposta enviada", () => {
    expect(QUOTE_FLOW.SENT).toContain("ACCEPTED");
  });
});

describe("gravações em etapas", () => {
  it("cada passo declara campos que existem no formulário", () => {
    for (const area of declaredAreas) {
      const keys = new Set(area.fields.map((field) => field.key));
      for (const step of area.saves ?? []) {
        for (const key of step.fields) {
          expect(keys, `campo ${key} de ${area.title}`).toContain(key);
        }
      }
    }
  });

  it("um passo que depende do id anterior vem depois de um que o cria", () => {
    for (const area of declaredAreas) {
      const steps = area.saves ?? [];
      steps.forEach((step, index) => {
        if (!step.usePreviousId) return;
        expect(index, `${area.title}: passo ${step.kind} sem passo anterior`).toBeGreaterThan(0);
      });
    }
  });

  it("nenhum campo aparece em dois passos da mesma área", () => {
    for (const area of declaredAreas) {
      const seen = new Set<string>();
      for (const step of area.saves ?? []) {
        for (const key of step.fields) {
          expect(seen.has(key), `${key} repetido em ${area.title}`).toBe(false);
          seen.add(key);
        }
      }
    }
  });
});
