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
 * Estas regras já custaram defeitos reais: colunas lidas pela tela que não
 * existem no retorno da RPC, e cartões de crédito que liam os campos no nível
 * errado. Nenhum dos dois aparece em typecheck nem em teste de unidade — só em
 * tempo de execução, contra o banco, e a tela apenas mostra "—".
 *
 * A verificação aqui é mecânica e barata: a migration é a fonte, e a tela
 * precisa concordar com ela. Toda leitura é escopada a uma tabela, porque
 * `status` e `severity` se repetem em meia dúzia de tabelas com valores
 * diferentes.
 */

const migration = readFileSync(
  new URL("../../../supabase/migrations/20261006100000_sales_orders.sql", import.meta.url),
  "utf8",
);

/** Corpo do `CREATE TABLE` de uma tabela. */
const tableBody = (table: string): string => {
  const body = migration.match(new RegExp(`CREATE TABLE[^;]*${table} \\(([\\s\\S]*?)\\n\\);`));
  if (!body) throw new Error(`Tabela ${table} não encontrada na migration.`);
  return body[1];
};

/** Colunas declaradas na criação da tabela. */
const tableColumns = (table: string): string[] =>
  [...tableBody(table).matchAll(/^\s+([a-z_]+)\s/gm)].map((match) => match[1]);

/** Valores aceitos por `CHECK(coluna IN ('A','B'))` dentro de uma tabela. */
const checkValues = (table: string, column: string): string[] => {
  const match = tableBody(table).match(
    new RegExp(`CHECK\\s*\\(\\s*${column}\\s+IN\\s*\\(([^)]*)\\)`, "s"),
  );
  if (!match) throw new Error(`CHECK de ${column} não encontrado em ${table}.`);
  return [...match[1].matchAll(/'([A-Z_]+)'/g)].map((value) => value[1]);
};

/**
 * Todo código que a tela mostra precisa existir no banco, e todo código que o
 * banco produz precisa de tradução: sem ela, `label()` devolve o texto cru e o
 * usuário lê `PICKING_DIFFERENCE`.
 */
const expectAligned = (table: string, column: string, map: Record<string, string>): void => {
  const accepted = checkValues(table, column);
  for (const value of accepted) expect(map[value], `${table}.${column}:${value}`).toBeTruthy();
  for (const value of Object.keys(map))
    expect(accepted, `${table}.${column}:${value}`).toContain(value);
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
    // A tela lê e escreve estas colunas. Sem correspondência, o servidor ignora
    // o campo e a tela mente mostrando a política salva.
    const columns = new Set(tableColumns("sales_order_settings"));
    for (const key of keys) expect(columns.has(key), key).toBe(true);
  });

  it("oferece exatamente os valores que o servidor aceita", () => {
    // Um valor a mais na tela é erro de escrita em tempo de execução: o
    // `sales_settings_save` responde "política inválida" e nada é salvo.
    for (const [key, option] of Object.entries(SETTING_OPTIONS)) {
      expect([...option.options].sort(), key).toEqual(
        [...checkValues("sales_order_settings", key)].sort(),
      );
    }
  });

  it("traduz todo valor aceito, sem valor órfão", () => {
    for (const [key, option] of Object.entries(SETTING_OPTIONS)) {
      expect(Object.keys(option.labels).sort(), key).toEqual([...option.options].sort());
    }
  });

  it("traduz toda opção de booleanos e de números", () => {
    for (const [key, flag] of Object.entries(SETTING_FLAGS)) {
      expect(flag.label.length, key).toBeGreaterThan(0);
      expect(flag.hint.length, key).toBeGreaterThan(0);
    }
  });
});

describe("códigos traduzidos antes de chegar à tela", () => {
  it("ocorrência de logística", () => {
    expectAligned("logistics_exceptions", "exception_type", EXCEPTION_TYPE);
    expectAligned("logistics_exceptions", "severity", EXCEPTION_SEVERITY);
    expectAligned("logistics_exceptions", "status", EXCEPTION_STATUS);
  });

  it("prova de entrega", () => {
    expectAligned("shipment_delivery_proofs", "proof_type", PROOF_TYPE);
  });

  it("transportadora", () => {
    expectAligned("carriers", "modality", CARRIER_MODALITY);
  });

  it("destinação do item devolvido", () => {
    expectAligned("customer_return_items", "destination", RETURN_DESTINATION);
  });

  it("status de pedido", () => {
    // Só o sentido banco → tela: o mapa de ações é maior que o conjunto de
    // status e não faz sentido exigir igualdade aqui.
    for (const value of checkValues("sales_orders", "status")) {
      expect(ORDER_STATUS[value], value).toBeTruthy();
    }
  });
});
