import { describe, expect, it } from "vitest";

import { fromCsv, toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("gera cabeçalho e linhas", () => {
    const csv = toCsv([
      { sku: "A-1", qty: 2 },
      { sku: "B-2", qty: 5 },
    ]);
    expect(csv).toBe("sku,qty\nA-1,2\nB-2,5");
  });

  it("escapa aspas e vírgulas em campos", () => {
    const csv = toCsv([{ name: 'Rosa, "Blush"', qty: 1 }]);
    expect(csv).toContain('"Rosa, ""Blush"""');
  });
});

describe("fromCsv", () => {
  it("converte cabeçalho + linhas em objetos", () => {
    const rows = fromCsv("sku,qty\nA-1,2\nB-2,5");
    expect(rows).toEqual([
      { sku: "A-1", qty: "2" },
      { sku: "B-2", qty: "5" },
    ]);
  });

  it("lida com CRLF e campos entre aspas", () => {
    const rows = fromCsv('nome,valor\r\n"Rosa, Blush",10');
    expect(rows).toEqual([{ nome: "Rosa, Blush", valor: "10" }]);
  });

  it("retorna array vazio para entrada vazia", () => {
    expect(fromCsv("")).toEqual([]);
  });
});
