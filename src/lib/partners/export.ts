import { toCsv, downloadCsv } from "@/lib/csv";
/** Reuses the CSV infrastructure and neutralizes spreadsheet formulas in user text. */
export function exportPartnerCsv(filename: string, rows: Record<string, unknown>[]) {
  const safe = rows.map((row) =>
    Object.fromEntries(
      Object.entries(row).map(([key, value]) => [
        key,
        typeof value === "string" && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value,
      ]),
    ),
  );
  downloadCsv(filename, toCsv(safe));
}
