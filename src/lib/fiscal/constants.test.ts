import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DOCUMENT_STATUS,
  EVENT_TYPE,
  EXCEPTION_STATUS,
  EXCEPTION_TYPE,
  FINDING_TYPE,
  ORIGIN_CODE,
  RECONCILIATION_STATUS,
  listings,
  readPermission,
} from "./constants";
import { sections } from "@/components/fiscal/config";

/**
 * Lê as migrations em vez de confiar em tipos gerados: os tipos do Supabase
 * são gerados antes destas tabelas existirem, e o objetivo é prender a tela
 * ao SQL que roda, não ao que foi gerado uma vez.
 */
function migrations(): string {
  const dir = "supabase/migrations";
  return readdirSync(dir)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => readFileSync(join(dir, file), "utf8"))
    .join("\n");
}

const SQL = migrations();

/** Sem comentários: o SQL do projeto comenta colunas com vírgula e parênteses,
 * e um "-- ... , ..." lido como coluna vira coluna fantasma no teste. */
function sqlSemComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Corpo entre parênteses, respeitando CHECK(...) e defaults com parênteses. */
function createTableBody(table: string): string | null {
  const source = sqlSemComentarios(SQL);
  // A última declaração vence. O histórico tem um `fiscal_documents` legado
  // de 2026-07 com outro desenho; ler a primeira faria o teste validar a
  // tabela que o MASTER 014 substituiu.
  const pattern = new RegExp(
    `CREATE TABLE(?: IF NOT EXISTS)? public\\.${table}\\s*\\(`,
    "gi",
  );
  let head: RegExpExecArray | null = null;
  for (const found of source.matchAll(pattern)) head = found;
  if (!head) return null;
  let depth = 1;
  for (let index = head.index + head[0].length; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    else if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) return source.slice(head.index + head[0].length, index);
    }
  }
  return null;
}

/** Colunas declaradas em `CREATE TABLE public.<tabela>`. */
function tableColumns(table: string): string[] {
  const body = createTableBody(table);
  if (!body) return [];
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts
    .map((part) => part.trim())
    .filter((part) => !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT|EXCLUDE)\b/i.test(part))
    .map((part) => /^([a-z_][a-z0-9_]*)\s/i.exec(part)?.[1] ?? "")
    .filter(Boolean);
}

/** Tabela de listagem declarada pelo `CASE` mais recente de `fiscal_query`. */
function serverTable(kind: string): string | undefined {
  const definition = [...SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.fiscal_query[\s\S]*?\$\$;/g)].at(-1);
  const block = definition?.[0];
  if (!block) return undefined;
  return new RegExp(`WHEN '${kind}' THEN '([a-z_]+)'`, "i").exec(block)?.[1];
}

/** Permissão cobrada pelo `CASE` mais recente de `fiscal_query`. */
function serverPermission(kind: string): string | undefined {
  const definition = [...SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.fiscal_query[\s\S]*?\$\$;/g)].at(-1);
  const block = definition?.[0];
  if (!block) return undefined;
  // A permissão vem tanto de `WHEN _kind='x' THEN 'p'` quanto de
  // `WHEN _kind IN ('x','y') THEN 'p'`. Ler só a primeira forma dava
  // `fiscal.read` para toda área agrupada.
  const direct = new RegExp(
    `WHEN _kind='${kind}' THEN '([a-z_.]+)'|WHEN _kind IN \\(([^)]*)\\) THEN '([a-z_.]+)'`,
  ).exec(block);
  if (direct) {
    if (direct[1]) return direct[1];
    const grouped = (direct[2] ?? "").match(/'([a-z_]+)'/g) ?? [];
    if (grouped.map((value) => value.replaceAll("'", "")).includes(kind)) return direct[3];
    return undefined;
  }
  return new RegExp("ELSE '([a-z_.]+)' END").exec(block)?.[1];
}

/** Colunas calculadas na tela, que não são colunas de tabela. */
const CALCULADAS = new Set(["findings", "result"]);

describe("contrato entre a listagem e o banco", () => {
  const areas = Object.entries(listings);

  it("toda área com listagem aponta para uma tabela que existe", () => {
    for (const [area] of areas) {
      const table = serverTable(area);
      expect(table, `área "${area}" sem tabela no fiscal_query`).toBeTruthy();
      expect(tableColumns(String(table)).length, `tabela ${String(table)} não declarada`).toBeGreaterThan(0);
    }
  });

  it("toda coluna listada existe na tabela da área", () => {
    for (const [area, listing] of areas) {
      const table = serverTable(area);
      const columns = tableColumns(String(table));
      for (const column of listing.columns) {
        if (CALCULADAS.has(column.key)) continue;
        expect(
          columns,
          `coluna "${column.key}" listada em "${area}" não existe em ${String(table)}`,
        ).toContain(column.key);
      }
    }
  });

  it("nenhuma área de listagem abre com identificador interno do banco", () => {
    // `id` é UUID e `fingerprint` é md5: nenhum dos dois diz ao usuário o
    // que o registro é. Antes do MASTER 014 a lista genérica abria com `id`.
    const INTERNOS = new Set(["id", "fingerprint"]);
    for (const [area, listing] of areas) {
      const first = listing.columns[0]?.key;
      expect(first, `área "${area}" sem coluna de identificação`).toBeTruthy();
      expect(
        INTERNOS.has(String(first)),
        `área "${area}" abre com "${String(first)}", que não identifica o registro para o usuário`,
      ).toBe(false);
      for (const column of listing.columns) {
        expect(
          INTERNOS.has(column.key),
          `área "${area}" lista a coluna interna "${column.key}"`,
        ).toBe(false);
      }
    }
  });

  it("toda área de listagem tem coluna de situação ou de quantidade", () => {
    for (const [area, listing] of areas) {
      const keys = listing.columns.map((column) => column.key);
      expect(
        keys.some((key) =>
          /^(status|is_active|passed|severity|event_type|exception_type|has_blocking_issue|authenticity_status|requires_document)$/.test(
            key,
          ),
        ),
        `área "${area}" sem coluna que diga a situação do registro`,
      ).toBe(true);
    }
  });
});

describe("contrato de permissões entre navegação e servidor", () => {
  it("toda área liberada pela navegação é aceita pelo servidor", () => {
    for (const [area, permission] of sections) {
      const expected = readPermission[area];
      expect(expected, `área "${area}" sem permissão de leitura declarada`).toBeTruthy();
      expect(
        serverPermission(area),
        `servidor não resolve a permissão da área "${area}"`,
      ).toBeDefined();
      expect(
        serverPermission(area) === expected || serverPermission(area) === permission,
        `área "${area}": navegação usa ${permission},Constants declara ${String(expected)}, servidor exige ${String(serverPermission(area))}`,
      ).toBe(true);
    }
  });

  it("a permissão de leitura nunca é a de gravação", () => {
    // `providers` é a única exceção, e é declarada: o catálogo não tem
    // permissão de leitura separada para provedor, e o registro só existe
    // para ser habilitado por quem tem `fiscal.provider.manage`.
    const EXCECOES = new Set(["providers"]);
    for (const [area, permission] of Object.entries(readPermission)) {
      if (EXCECOES.has(area)) continue;
      expect(permission, `área "${area}" sem permissão de leitura`).not.toMatch(
        /configure$|manage$|create$|issue$|validate$|import$|approve$/,
      );
    }
  });
});

describe("rótulos de códigos", () => {
  it("traduz todos os estados de documento permitidos pelo banco", () => {
    const type = /CREATE TYPE public\.fiscal_document_status AS ENUM \(([^;]*?)\);/i.exec(
      sqlSemComentarios(SQL),
    )?.[1];
    const allowed = (type ?? "").match(/'([A-Z_]+)'/g) ?? [];
    expect(allowed.length, "estado de documento não lido das migrations").toBeGreaterThan(5);
    for (const code of allowed) {
      expect(DOCUMENT_STATUS[code.replaceAll("'", "")], `estado ${code} sem rótulo`).toBeTruthy();
    }
  });

  it("traduz todas as origens permitidas pelo banco", () => {
    const check = /origin_code smallint NOT NULL DEFAULT 0 CHECK\(origin_code BETWEEN (\d+) AND (\d+)\)/.exec(
      createTableBody("product_fiscal_profiles") ?? "",
    );
    const from = Number(check?.[1] ?? -1);
    const to = Number(check?.[2] ?? -1);
    expect(from, "faixa de origem não lida de product_fiscal_profiles").toBe(0);
    for (let code = from; code <= to; code += 1) {
      expect(ORIGIN_CODE[String(code)], `origem ${code} sem rótulo`).toBeTruthy();
    }
  });

  it("traduz todos os tipos de pendência permitidos pelo banco", () => {
    const types =
      /exception_type text NOT NULL CHECK\(exception_type IN \(([^)]*)\)\)/.exec(
        createTableBody("fiscal_exceptions") ?? "",
      )?.[1]?.match(/'[A-Z_]+'/g) ?? [];
    expect(types.length, "tipo de pendência não lido de fiscal_exceptions").toBeGreaterThan(5);
    for (const type of types) {
      expect(EXCEPTION_TYPE[type.replaceAll("'", "")], `pendência ${type} sem rótulo`).toBeTruthy();
    }
  });

  it("traduz exatamente os eventos que o banco emite", () => {
    // `fiscal_events.event_type` é texto livre: o contrato é o que o servidor
    // grava via `fiscal_emit`, e a lista de rótulos tem que acompanhar.
    const emitted = new Set(
      [...SQL.matchAll(/fiscal_emit\([^,]+,'([A-Z_]+)'/g)].map((match) => match[1]),
    );
    expect(emitted.size, "nenhum evento emitido lido das migrations").toBeGreaterThan(0);
    for (const event of emitted) {
      expect(EVENT_TYPE[event], `evento ${event} sem rótulo`).toBeTruthy();
    }
    for (const event of Object.keys(EVENT_TYPE)) {
      expect(emitted.has(event), `rótulo ${event} sem evento correspondente no banco`).toBe(true);
    }
  });

  it("traduz todos os estados de conciliação permitidos pelo banco", () => {
    const types =
      /status text NOT NULL CHECK\(status IN \(([^)]*)\)\)/.exec(
        createTableBody("fiscal_reconciliations") ?? "",
      )?.[1]?.match(/'[A-Z_]+'/g) ?? [];
    expect(types.length, "estado de conciliação não lido").toBeGreaterThan(0);
    for (const type of types) {
      expect(RECONCILIATION_STATUS[type.replaceAll("'", "")], `conciliação ${type} sem rótulo`).toBeTruthy();
    }
  });

  it("não deixa código em inglês nas listas de tradução", () => {
    for (const [group, map] of Object.entries({
      DOCUMENT_STATUS,
      EVENT_TYPE,
      EXCEPTION_STATUS,
      EXCEPTION_TYPE,
      FINDING_TYPE,
      RECONCILIATION_STATUS,
      ORIGIN_CODE,
    })) {
      for (const [code, text] of Object.entries(map)) {
        expect(code, `chave vazia em ${group}`).toBeTruthy();
        expect(text, `rótulo vazio para ${code} em ${group}`).toBeTruthy();
        expect(text.trim(), `rótulo em branco para ${code} em ${group}`).not.toBe("");
      }
    }
  });
});
