import { toCsv, downloadCsv } from "@/lib/csv";
import { columnLabel } from "@/components/crm/shared";
import { CRM_FILTER_KEYS } from "@/lib/crm/constants";

/**
 * Exporta o resultado já filtrado da consulta do CRM.
 *
 * Reusa a infraestrutura de CSV dos demais módulos e neutraliza fórmulas de
 * planilha em texto digitado pelo usuário. As linhas vêm da mesma RPC com
 * `export = true`, ou seja, respeitam RLS, escopo de carteira e as permissões
 * do chamador — o navegador nunca amplia o que o servidor devolveu.
 */
export function exportCrmCsv(
  filename: string,
  rows: Record<string, unknown>[],
  columns?: string[],
) {
  const safe = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value,
      ]),
    ),
  );
  const visible = columns?.length ? columns : undefined;
  downloadCsv(filename, toCsv(safe, visible));
}

/** Cabeçalhos em português na ordem das colunas visíveis. */
export const csvHeaders = (columns: string[]): Record<string, string> =>
  Object.fromEntries(columns.map((column) => [column, columnLabel(column)]));

/** Remove chaves de filtro que o servidor ignora, para não exportar dados de outro recorte. */
export function sanitizeFilters(filters: Record<string, string>): Record<string, string> {
  const allowed = new Set<string>(CRM_FILTER_KEYS);
  return Object.fromEntries(
    Object.entries(filters).filter(([key, value]) => allowed.has(key) && value !== ""),
  );
}
