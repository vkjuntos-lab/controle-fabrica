import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CARRIER_MODALITY,
  EXCEPTION_SEVERITY,
  EXCEPTION_STATUS,
  EXCEPTION_TYPE,
  ORDER_STATUS,
  PROOF_TYPE,
  RETURN_DESTINATION,
  SETTING_FLAGS,
  SETTING_OPTIONS,
} from "@/lib/sales/constants";

/**
 * Contrato entre as telas de vendas e o banco.
 *
 * Estas regras já custaram defeitos reais: a tela oferecia um valor de política
 * que o servidor rejeitava, e o cartão de crédito lia campos que existem dentro
 * de `position`, não no nível da linha. Nenhum dos dois aparece em typecheck nem
 * em teste de unidade — só em tempo de execução, contra o banco.
 *
 * A verificação aqui é mecânica e barata: as migrations são a fonte, e a tela
 * precisa concordar com elas.
 */

const migration = readFileSync(
  new URL("../../../supabase/migrations/20261006100000_sales_orders.sql", import.meta.url),
  "utf8",
);

/** Colunas de uma tabela, na ordem em que a migration declara. */
const tableColumns = (table: string): string[] => {
  const body = migration.match(new RegExp(`CREATE TABLE[^;]*${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!body) throw new Error(`Tabela ${table} não encontrada na migration.`);
  return [...body[1].matchAll(/^\s{2}([a-z_]+)\s/gm)].map((match) => match[1]);
};

/** Valores aceitos por um `CHECK(coluna IN ('A','B'))`. */
const checkValues = (column: string): string[] => {
  const match = migration.match(
    new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`, "s"),
  );
  if (!match) throw new Error(`CHECK de ${column} não encontrado.`);
  return [...match[1].matchAll(/'([A-Z_]+)'/g)].map((value) => value[1]);
};

describe("políticas editáveis na tela de configurações", () => {
  const keys = [
    ...Object.keys(SETTING_OPTIONS),
    ...Object.keys(SETTING_FLAGS),
    "reservation_expiry_hours",
    "max_discount_percent",
  ];

  it("cobre exatamente as doze políticas do banco", () => {
    expect(keys).toHaveLength(12);
    expect(new Set(keys).size).toBe(12);
  });

  it("sete chaves correspondem a colunas de sales_order_settings", () => {
    // `sales_order_settings` guarda uma linha por organização; a tela lê e
    // escreve essas mesmas colunas. Sem correspondência, o servidor ignora o
    // campo ou falha na gravação.
    const columns = new Set(tableColumns("sales_order_settings"));
    for (const key of keys) expect(columns.has(key), key).toBe(true);
  });

  it("oferece exatamente os valores que o servidor aceita", () => {
    for (const [key, option] of Object.entries(SETTING_OPTIONS)) {
      const accepted = checkValues(key);
      expect([...option.options].sort(), key).toEqual([...accepted].sort());
    }
  });

  it("traduz todo valor aceito, sem valor órfão", () => {
    for (const [key, option] of Object.entries(SETTING_OPTIONS)) {
      const labels = Object.keys(option.labels).sort();
      expect(labels, key).toEqual([...option.options].sort());
    }
  });

  it("traduz toda opção de booleanos e de números", () => {
    for (const [key, flag] of Object.entries(SETTING_FLAGS)) {
      expect(typeof flag.label, key).toBe("string");
      expect(flag.label.length, key).toBeGreaterThan(0);
      expect(typeof flag.hint, key).toBe("string");
    }
  });
});

describe("códigos de status e de ocorrência", () => {
  const cases: [string, Record<string, string>, string][] = [
    ["exception_type", EXCEPTION_TYPE, "exception_type"],
    ["proof_type", PROOF_TYPE, "proof_type"],
    ["exception severity", EXCEPTION_SEVERITY, "severity"],
    ["exception status", EXCEPTION_STATUS, "status"],
    ["modality", CARRIER_MODALITY, "modality"],
  ];

  it.each(cases)("traduz todos os valores de %s sem inventar código", (_name, map, column) => {
    const accepted = new Set(checkValues(column));
    // Um código que o banco nunca produz cai no `label()` e vira texto cru na
    // tela; um código sem tradução mostra `PICKING_DIFFERENCE` ao usuário.
    for (const value of checkValues(column)) expect(map[value], value).toBeTruthy();
    for (const value of Object.keys(map)) expect(accepted.has(value), value).toBe(true);
  });

  it("traduz os destinos de devolução", () => {
    const accepted = new Set(checkValues("destination"));
    for (const value of accepted) expect(RETURN_DESTINATION[value], value).toBeTruthy();
    for (const value of Object.keys(RETURN_DESTINATION)) expect(accepted.has(value), value).toBe(true);
  });

  it("traduz todo status de pedido que o banco aceita", () => {
    const accepted = new Set(checkValues("status"));
    for (const value of Object.keys(ORDER_STATUS)) expect(accepted.has(value), value).toBe(true);
  });
});
